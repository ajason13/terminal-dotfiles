#!/usr/bin/env python3
"""Real tmux, synthetic hook producer, isolated state; no default server access."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / 'bin/tmux-agent-observation'
HOOK = ROOT / 'claude/hooks/tmux-agent-depth.sh'
STATUS = ROOT / 'tmux/tmux-llm-status'

if len(sys.argv) == 4 and sys.argv[1] == '--producer':
    request, response = map(Path, sys.argv[2:])
    while True:
        with request.open() as stream:
            for line in stream:
                subprocess.run([str(HOOK)], input=line, text=True, check=True)
                response.write_text('ok')


def main():
    with tempfile.TemporaryDirectory(prefix='observation-integration-') as temp:
        root = Path(temp).resolve()
        socket = root / 'tmux.sock'
        request, response = root / 'request', root / 'response'
        os.mkfifo(request)
        env = {**os.environ, 'HOME': str(root), 'TMUX_SOCKET': str(socket),
               'TMUX_AGENT_OBSERVATION_HOME': str(root / 'observations'),
               'TMUX_AGENT_OBSERVATION_BIN': str(HELPER), 'TMUX_LLM_STATUS_BIN': str(STATUS),
               'TMUX_LLM_STATE_HOME': str(root / 'legacy'), 'TMUX_LLM_NOTIFY': '0',
               'TMUX_LLM_ORG_LOCK': '/dev/null', 'TMUX_LLM_ANNOUNCE_LOG': str(root / 'absent-log'),
               'TMUX_LLM_CLAUDE_SESSIONS': str(root / 'sessions')}
        env.pop('TMUX', None)
        env.pop('TMUX_PANE', None)

        def tmux(*args):
            return subprocess.check_output(['tmux', '-S', str(socket), *args], env=env, text=True).strip()

        def command():
            return shlex.join([sys.executable, str(Path(__file__).resolve()), '--producer', str(request), str(response)])

        def fire(event, **fields):
            response.unlink(missing_ok=True)
            end = time.monotonic() + 10
            while True:
                try:
                    fd = os.open(request, os.O_WRONLY | os.O_NONBLOCK)
                    break
                except OSError:
                    if time.monotonic() > end:
                        raise AssertionError('producer unavailable')
                    time.sleep(.02)
            payload = dict(hook_event_name=event, session_id='fixture')
            payload.update(fields)
            os.write(fd, (json.dumps(payload) + '\n').encode())
            os.close(fd)
            while not response.exists():
                if time.monotonic() > end:
                    raise AssertionError('hook timed out')
                time.sleep(.02)

        def read():
            return json.loads(subprocess.check_output([str(HELPER), 'read', '--pane', pane], env=env, text=True)).get(pane, {})

        def parity(expected):
            item = read()
            assert item.get('state') == expected, (expected, item)
            explain = subprocess.check_output([str(STATUS), 'explain', pane], env=env, text=True)
            reason = {'active': 'active', 'permission': 'permission', 'question': 'question', 'ended': 'turn-ended'}[expected]
            assert 'winning rule: shared-hook-' + reason in explain, explain
            # Build and independently validate the dashboard export of this exact
            # helper decision; timestamps are from producer facts, not collection.
            code = '''import { buildSnapshot } from './dashboard/src/tmux-collector.mjs';
import { normalizeImportedSnapshot } from './dashboard/src/import-snapshot.mjs';
const [pane, value, expected] = process.argv.slice(1);
const record = {socket_path:'/synthetic/socket',start_time:'123',pane_id:pane,
  pane_index:'0',window_name:'Synthetic',session_name:'Synthetic',
  pane_current_command:'claude',pane_title:'✳ fixture',window_activity:'1'};
const snapshot=buildSnapshot([record],new Date().toISOString(),{[pane]:JSON.parse(value)});
const normalized=normalizeImportedSnapshot(snapshot);
if(normalized.sessions[0].status!==expected) throw Error('dashboard parity');'''
            status = {'active': 'active', 'permission': 'waiting_for_permission',
                      'question': 'waiting_for_input', 'ended': 'turn_ended'}[expected]
            subprocess.run(['node', '--input-type=module', '-e', code, pane, json.dumps(item), status],
                           cwd=ROOT, env=env, check=True)

        try:
            tmux('new-session', '-d', '-s', 'synthetic', command())
            pane = tmux('list-panes', '-F', '#{pane_id}')
            tmux('select-pane', '-t', pane, '-T', '✳ fixture')
            fire('SessionStart')
            assert read().get('state') == 'unknown', tmux('capture-pane', '-p', '-t', pane)
            fire('UserPromptSubmit')
            parity('active')
            fire('SubagentStart', agent_id='a')
            fire('Notification', agent_id='a', notification_type='elicitation_dialog', message='DO NOT STORE THIS')
            parity('question')
            fire('Notification', notification_type='permission_prompt')
            parity('permission')
            fire('PostToolBatch')
            parity('question')
            fire('SubagentStop', agent_id='a')
            parity('active')
            fire('Stop')
            parity('ended')
            table = subprocess.check_output([str(STATUS), 'table'], env=env, text=True)
            assert '○ unseen' in table, 'shared turn-end must retain unseen table badge'
            subprocess.check_call([str(STATUS), 'ack', pane], env=env)
            table = subprocess.check_output([str(STATUS), 'table'], env=env, text=True)
            assert 'ended' in table and '○ unseen' not in table, 'ack reveals observed end, not success'
            # Old generations and unbound legacy files cannot re-open work.
            fire('UserPromptSubmit', session_id='wrong-session')
            parity('ended')
            for path in (root / 'observations').glob('*.json'):
                assert 'DO NOT STORE THIS' not in path.read_text()
                assert 'fixture' not in path.read_text()
            tmux('respawn-pane', '-k', '-t', pane, command())
            time.sleep(.15)
            assert read().get('state', 'unknown') == 'unknown'
            fire('SessionStart', session_id='new')
            fire('UserPromptSubmit', session_id='new')
            parity('active')
            fire('SessionEnd', session_id='new')
            assert read().get('state') == 'unknown'
            # Multiple windows still perform exactly one shared helper read per
            # status pass, rather than one subprocess/all-pane scan per pane.
            wrapper = root / 'count-helper'
            calls = root / 'helper-calls'
            wrapper.write_text('#!/bin/sh\nprintf x >> ' + shlex.quote(str(calls))
                               + '\nexec ' + shlex.quote(str(HELPER)) + ' "$@"\n')
            wrapper.chmod(0o700)
            for index in range(3):
                tmux('new-window', '-d', '-t', 'synthetic:', '-n', 'extra' + str(index), 'sleep 600')
            counted_env = {**env, 'TMUX_AGENT_OBSERVATION_BIN': str(wrapper)}
            for command_name in ('once', 'summary'):
                calls.write_text('')
                subprocess.check_output([str(STATUS), command_name], env=counted_env, text=True)
                assert calls.read_text() == 'x', 'one helper per multi-window pass required'
            print('PASS: isolated hooks, both consumers, privacy, respawn/session invalidation and batched status reads')
        finally:
            subprocess.run(['tmux', '-S', str(socket), 'kill-server'], env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
