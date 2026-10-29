#!/usr/bin/env python3
"""Synthetic Claude events and real PTY clients, on the status suite's private server."""
import json
import os
from pathlib import Path
import pty
import shlex
import sys
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent
BIN = ROOT / 'tmux/tmux-llm-status'
HOOK = ROOT / 'claude/hooks/tmux-agent-depth.sh'
SOCKET = os.environ['TMUX_SOCKET']
assert SOCKET.startswith('/tmp/tmux-llm-status-test-'), 'private fixture socket required'
# Run the synthetic hook inside the pane's process tree, just as Claude does.
if len(sys.argv) == 4 and sys.argv[1] == '--producer':
    request, response = map(Path, sys.argv[2:])
    while True:
        with request.open() as stream:
            for line in stream:
                payload = json.loads(line)
                override = payload.pop('_producer_tmux', None)
                env = dict(os.environ, TMUX_LLM_STATUS_BIN=str(BIN), TMUX_LLM_NOTIFY='0')
                if override is not None:
                    env['TMUX'] = override
                subprocess.run([str(HOOK)], input=json.dumps(payload), text=True, env=env, check=True)
                response.write_text('ok')

clients = []
checks = 0
producers = {}


def tmux(*args):
    return subprocess.check_output(['tmux', '-S', SOCKET, *args], text=True).strip()


def status(*args):
    return subprocess.check_output([str(BIN), *args], text=True).strip()


def check(label, expected, actual):
    global checks
    assert expected == actual, f'{label}: expected {expected!r}, got {actual!r}'
    checks += 1
    print(f'  ok   {label}', flush=True)


def option(pane, name):
    return tmux('show-options', '-pqv', '-t', pane, name)


def producer_command(pane=None):
    if pane is None:
        token = str(len(producers))
        request = Path(SOCKET).with_name('request-' + token)
        response = Path(SOCKET).with_name('response-' + token)
        os.mkfifo(request)
    else:
        request, response = producers[pane]
    return shlex.join([sys.executable, str(Path(__file__).resolve()), '--producer', str(request), str(response)]), (request, response)


def fire(event, pane, session='completion-session', **fields):
    payload = dict(hook_event_name=event, session_id=session, **fields)
    request, response = producers[pane]
    response.unlink(missing_ok=True)
    deadline = time.monotonic() + 10
    while True:
        try:
            writer = os.open(request, os.O_WRONLY | os.O_NONBLOCK)
            break
        except OSError:
            if time.monotonic() >= deadline:
                raise AssertionError('pane producer did not read request')
            time.sleep(.02)
    os.write(writer, (json.dumps(payload) + '\n').encode())
    os.close(writer)
    while not response.exists():
        if time.monotonic() >= deadline:
            raise AssertionError('pane producer did not finish hook')
        time.sleep(.02)


def stale_fire(event, pane, session='stale-session', tmux_env=None):
    env = dict(os.environ, TMUX_PANE=pane, TMUX_LLM_STATUS_BIN=str(BIN), TMUX_LLM_NOTIFY='0')
    env['TMUX'] = tmux_env or f"{SOCKET},{tmux('display-message', '-p', '#{pid}')},0"
    subprocess.run([str(HOOK)], input=json.dumps(dict(hook_event_name=event, session_id=session)),
                   text=True, env=env, check=True)


def switch(client, session):
    rows = tmux('list-clients', '-F', '#{client_pid}:#{client_name}').splitlines()
    name = next(row.split(':', 1)[1] for row in rows if row.startswith(str(client.pid) + ':'))
    tmux('switch-client', '-c', name, '-t', session)


def marker(pane):
    return status('window', pane)


def complete(pane):
    fire('UserPromptSubmit', pane)
    fire('Stop', pane)


def attach(session, control=False):
    master, slave = pty.openpty()
    args = ['tmux', '-S', SOCKET]
    if control:
        args.append('-C')
    client_env = dict(os.environ, TERM='xterm-256color')
    client_env.pop('TMUX', None)
    child = subprocess.Popen([*args, 'attach-session', '-t', session], stdin=slave,
                             stdout=slave, stderr=slave, env=client_env)
    os.close(slave)
    clients.append((child, master))
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        rows = tmux('list-clients', '-F', '#{client_pid}').splitlines()
        if str(child.pid) in rows:
            return child
        if child.poll() is not None:
            raise AssertionError('tmux client exited during attach')
        time.sleep(.02)
    raise AssertionError('tmux client did not attach')


try:
    command, paths = producer_command()
    pane = tmux('new-session', '-d', '-s', 'completion', '-P', '-F', '#{pane_id}', command)
    producers[pane] = paths
    tmux('select-pane', '-t', pane, '-T', '✳ completion fixture')
    other = tmux('new-window', '-d', '-t', 'completion:', '-P', '-F', '#{pane_id}', 'sleep 600')
    fire('SessionStart', pane)
    fire('Stop', pane)
    check('initial idle does not complete', '', option(pane, '@llm_unseen'))
    fire('PostToolBatch', pane)
    fire('Stop', pane)
    check('heartbeat cannot open a turn', '', option(pane, '@llm_unseen'))
    complete(pane)
    check('detached top-level completion shown', '○', marker(pane))
    check('completion remains lifecycle present', True, 'Status/daemon: present;' in status('explain', pane))
    check('table shows completion', True, '○ unseen' in status('table'))
    check('session rollup shows completion', '○1', status('summary', 'completion'))
    status('once')
    check('published window rollup', '○', tmux('show-options', '-wqv', '-t', pane, '@llm_status'))
    check('published session rollup', '○1', tmux('show-options', '-qv', '-t', 'completion', '@llm_fleet'))
    status('ack', pane)
    check('explicit acknowledgement clears', '◆', marker(pane))
    complete(pane)
    fire('UserPromptSubmit', pane)
    check('new turn clears completion', '', option(pane, '@llm_unseen'))
    fire('Stop', pane, agent_id='child')
    check('subagent Stop leaves turn open', True, bool(option(pane, '@llm_turn')))
    fire('Stop', pane, subagent_id='child')
    check('legacy subagent Stop leaves turn open', True, bool(option(pane, '@llm_turn')))
    fire('StopFailure', pane)
    check('failed turn never completes', '', option(pane, '@llm_unseen'))
    fire('Stop', pane)
    check('late Stop after failure never completes', '', option(pane, '@llm_unseen'))
    fire('UserPromptSubmit', pane)
    fire('Stop', pane, session='wrong-session')
    check('wrong Claude session cannot complete', '', option(pane, '@llm_unseen'))
    check('wrong Stop preserves current turn', True, bool(option(pane, '@llm_turn')))
    fire('StopFailure', pane, session='wrong-session')
    fire('SessionEnd', pane, session='wrong-session')
    fire('Stop', pane)
    check('current session completes after stale destructive events', '○', marker(pane))
    fire('StopFailure', pane, session='wrong-session')
    fire('SessionEnd', pane, session='wrong-session')
    check('wrong session cannot clear current completion', '○', marker(pane))
    fire('UserPromptSubmit', pane)
    fire('UserPromptSubmit', pane, session='')
    fire('Stop', pane)
    check('missing-session new prompt invalidates old turn', '', option(pane, '@llm_unseen'))
    for stamp in [str(int(time.time()) - 1300), str(int(time.time()) + 60), 'invalid']:
        fire('UserPromptSubmit', pane)
        owner = option(pane, '@llm_turn').split(':')[0]
        tmux('set-option', '-p', '-t', pane, '@llm_turn', f'{owner}:{stamp}')
        fire('PostToolBatch', pane)
        fire('Stop', pane)
        check('expired/future/malformed turn cannot complete ' + stamp, '', option(pane, '@llm_unseen'))
    fire('UserPromptSubmit', pane)
    check('interrupted turn has no completion', '', option(pane, '@llm_unseen'))
    fire('SessionStart', pane, source='resume')
    fire('Stop', pane)
    check('resume invalidates interrupted turn', '', option(pane, '@llm_unseen'))
    complete(pane)
    fire('Notification', pane, notification_type='permission_prompt')
    check('blocked retains precedence', '!', marker(pane))
    fire('PostToolBatch', pane)
    check('active retains precedence', True, marker(pane) != '○')
    fire('StopFailure', pane)
    complete(pane)
    tmux('select-pane', '-t', pane, '-T', '[Idle] codex | fixture')
    check('unsupported provider cannot display Claude completion', '◆', marker(pane))
    tmux('select-pane', '-t', pane, '-T', '✳ completion fixture')
    fire('SessionEnd', pane)
    check('session cleanup removes completion', '', option(pane, '@llm_unseen'))

    # Real attached clients, including control clients which are not a human view.
    tmux('select-window', '-t', other)
    attach('completion', control=True)
    tmux('select-window', '-t', pane)
    complete(pane)
    check('control client does not acknowledge', '○', marker(pane))
    tmux('select-window', '-t', other)
    viewer = attach('completion')
    check('background window not acknowledged', '○', marker(pane))
    tmux('select-window', '-t', pane)
    check('view clears completion', '◆', marker(pane))
    tmux('select-window', '-t', other)
    check('acknowledgement persists after leaving', '◆', marker(pane))
    tmux('select-window', '-t', pane)
    complete(pane)
    check('already viewed completion leaves no badge', '', option(pane, '@llm_unseen'))
    split = tmux('split-window', '-d', '-t', pane, '-P', '-F', '#{pane_id}', 'sleep 600')
    tmux('select-pane', '-t', split)
    complete(pane)
    check('inactive split awaits acknowledgement', '○', marker(pane))
    tmux('select-pane', '-t', pane)
    status('once')
    check('active split acknowledges', '', option(pane, '@llm_unseen'))
    switch(viewer, 'alpha')
    complete(pane)
    check('other session does not acknowledge', '○', marker(pane))
    second = attach('completion')
    check('any viewing client acknowledges across sessions', '◆', marker(pane))
    # Respawn keeps tmux pane options; process binding must reject them.
    switch(second, 'alpha')
    complete(pane)
    command, _ = producer_command(pane)
    tmux('respawn-pane', '-k', '-t', pane, command)
    tmux('select-pane', '-t', pane, '-T', '✳ respawn fixture')
    check('respawn rejects stale completion identity', '◆', marker(pane))
    fire('UserPromptSubmit', pane)
    command, _ = producer_command(pane)
    tmux('respawn-pane', '-k', '-t', pane, command)
    tmux('select-pane', '-t', pane, '-T', '✳ respawn fixture')
    fire('Stop', pane)
    check('respawn rejects stale open turn', '', option(pane, '@llm_unseen'))
    stale_fire('UserPromptSubmit', pane)
    stale_fire('Stop', pane)
    check('outside producer cannot bind replacement pane', '', option(pane, '@llm_unseen'))
    check('outside producer cannot open replacement turn', '', option(pane, '@llm_turn'))
    stale_fire('UserPromptSubmit', pane, tmux_env=f'{SOCKET},1,0')
    check('old server environment cannot open replacement turn', '', option(pane, '@llm_turn'))
    fire('UserPromptSubmit', pane, _producer_tmux=f'{SOCKET},1,0')
    check('valid descendant with old server PID cannot open turn', '', option(pane, '@llm_turn'))
    complete(pane)
    tmux('kill-pane', '-t', pane)
    replacement = tmux('new-window', '-d', '-t', 'completion:', '-P', '-F', '#{pane_id}', 'sleep 600')
    check('new pane inherits no completion', '', option(replacement, '@llm_unseen'))
    # Reusing the numeric pane ID on a brand-new server cannot inherit options.
    reuse_socket = str(Path(SOCKET).with_name('reuse.sock'))
    for _ in range(2):
        subprocess.run(['tmux', '-S', reuse_socket, '-f', '/dev/null', 'new-session', '-d', '-s', 'reuse'], check=True)
        result = subprocess.check_output(['tmux', '-S', reuse_socket, 'show-options', '-pqv', '-t', '%0', '@llm_unseen'], text=True).strip()
        check('new server cannot inherit completion', '', result)
        subprocess.run(['tmux', '-S', reuse_socket, 'set-option', '-p', '-t', '%0', '@llm_unseen', 'old'], check=True)
        subprocess.run(['tmux', '-S', reuse_socket, 'kill-server'], check=True)
        time.sleep(.1)
    print(f'Completion regression checks passed: {checks}', flush=True)
finally:
    for child, master in clients:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
        os.close(master)
    subprocess.run(['tmux', '-S', SOCKET, 'kill-session', '-t', 'completion'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
