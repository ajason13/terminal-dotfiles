// Reproduce issue #100's bounded research corpus. No tmux server or user state is read.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyPane } from '../dashboard/src/tmux-classifier.mjs';
import { buildSnapshot, stableTmuxId } from '../dashboard/src/tmux-collector.mjs';
import { normalizeImportedSnapshot } from '../dashboard/src/import-snapshot.mjs';

const now = 1800000000;
const root = mkdtempSync(join(tmpdir(), 'activity-evidence-'));
try {
  // Load the real shell classifier definitions without the command dispatcher.
  // Fail explicitly if its source boundary moves; do not copy its decision rules.
  const source = readFileSync(new URL('../tmux/tmux-llm-status', import.meta.url), 'utf8');
  const boundary = '\n# Only fixed labels, counts and validated pane IDs leave this diagnostic path.';
  assert.equal(source.split(boundary).length, 2);
  const shell = join(root, 'classify.sh');
  writeFileSync(shell, source.split(boundary)[0] + `
NOW=$1
classify_pane '%1' "$2" "$3"
printf '%s/%s' "$PANE_STATE" "$PANE_REASON"
`);
  const cases = [
    // name, title, command, age of window output, hook evidence, shell expectation, dashboard expectation
    ['static-quiet', '✳ task', 'node', 120, {}, 'present/agent-title', 'idle/tmux_activity_idle'],
    ['sibling-output', '✳ task', 'node', 1, {}, 'present/agent-title', 'active/tmux_activity_recent'],
    ['busy-silent', '✳ task', 'node', 120, { busy: now }, 'active/fresh-busy-marker', 'idle/tmux_activity_idle'],
    ['blocked-recent', '✳ task', 'node', 1, { needs: true, busy: now, agents: true }, 'waiting/needs-marker', 'active/tmux_activity_recent'],
    ['subagent-silent', '✳ task', 'node', 120, { agents: true }, 'active/subagent-depth', 'idle/tmux_activity_idle'],
    ['busy-at-ttl', '✳ task', 'node', 120, { busy: now - 1200 }, 'present/agent-title', 'idle/tmux_activity_idle'],
    ['busy-future', '✳ task', 'node', 120, { busy: now + 60 }, 'active/fresh-busy-marker', 'idle/tmux_activity_idle'],
    ['busy-malformed', '✳ task', 'node', 120, { busy: '08' }, 'present/agent-title', 'idle/tmux_activity_idle'],
    ['spinner-with-prompt-text', '⠋ Action Required', 'node', 1, {}, 'active/spinner-title', 'active/tmux_title_spinner'],
    ['codex-task-text', '[Ready] Action Required | project', 'node', 1, {}, 'present/agent-title', 'active/tmux_activity_recent'],
    ['codex-current-title', 'task | project', 'node', 120, {}, 'present/agent-title', 'idle/tmux_activity_idle'],
    ['command-only', 'ordinary', 'claude', 1, {}, 'present/agent-command', 'unknown/tmux_command_candidate'],
    ['busy-on-shell', 'ordinary', 'bash', 120, { needs: true, busy: now }, 'active/fresh-busy-marker', 'excluded'],
    ['no-activity-epoch', '✳ task', 'node', null, {}, 'present/agent-title', 'idle/tmux_title_static_provider'],
    ['exact-silence-boundary', '✳ task', 'node', 60, {}, 'present/agent-title', 'idle/tmux_activity_idle'],
  ];
  for (const [name, title, command, silence, hooks, tmuxExpected, dashboardExpected] of cases) {
    const state = join(root, name);
    mkdirSync(join(state, 'panes'), { recursive: true });
    if (hooks.busy !== undefined) writeFileSync(join(state, 'panes/1.busy'), String(hooks.busy));
    if (hooks.needs) writeFileSync(join(state, 'panes/1.needs'), '');
    if (hooks.agents) {
      mkdirSync(join(state, 'panes/1.agents'));
      writeFileSync(join(state, 'panes/1.agents/synthetic'), '');
    }
    const tmux = execFileSync('bash', [shell, String(now), command, title], {
      env: { ...process.env, TMUX_LLM_STATE_HOME: state, TMUX_LLM_BUSY_TTL: '1200' }, encoding: 'utf8',
    });
    const record = {
      socket_path: '/synthetic/socket', start_time: '1799990000', session_id: '$1',
      session_name: 'synthetic', window_id: '@1', pane_id: '%1', pane_index: '0',
      window_name: 'fixture', pane_title: title, pane_current_command: command,
      window_activity: silence === null ? '' : String(now - silence),
    };
    const classified = classifyPane(record, now * 1000);
    const dashboard = classified ? `${classified.status}/${classified.provenance}` : 'excluded';
    assert.equal(tmux, tmuxExpected, name);
    assert.equal(dashboard, dashboardExpected, name);
    const snapshot = buildSnapshot([record], new Date(now * 1000).toISOString());
    normalizeImportedSnapshot(snapshot, now * 1000);
    // Server epoch protects dashboard identity on restart, not process respawn in a pane.
    assert.notEqual(stableTmuxId(record), stableTmuxId({ ...record, start_time: '1799990001' }));
    assert.equal(stableTmuxId(record), stableTmuxId({ ...record, pane_current_command: 'other' }));
    console.log(`${name}: ${tmux} | ${dashboard}`);
  }
  console.log(`${cases.length} synthetic comparisons passed; every snapshot passed the live validator.`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
