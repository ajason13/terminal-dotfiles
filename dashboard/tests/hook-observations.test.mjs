import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapshot } from '../src/tmux-collector.mjs';
import { normalizeImportedSnapshot } from '../src/import-snapshot.mjs';
import { hookClassification, readHookObservations } from '../src/hook-observations.mjs';
import { HOOK_TTL_MS } from '../src/observation-contract.mjs';
import { runCollectorCli } from '../src/collector-cli.mjs';
import { parseServeArgs } from '../serve-live.mjs';
import { buildAccessibleText } from '../src/session-contract.mjs';
import { allocateSessions } from '../src/track-layout.mjs';

const AT = '2026-10-29T12:00:00.000Z';
const NOW = Date.parse(AT);
const record = (overrides = {}) => ({
  socket_path: '/synthetic/socket', start_time: '123', session_id: '$0',
  session_name: 'Synthetic', window_id: '@0', pane_id: '%0', pane_index: '0',
  window_name: 'Test', pane_title: '✳ not exported', pane_current_command: 'claude',
  window_activity: '1793275200', ...overrides,
});
const snapshot = (state, at = NOW - 1000) => buildSnapshot([record()], AT, { '%0': { state, at } });

const accepted = {
  active: ['active', 'unknown', 'tmux_hook_active'],
  permission: ['waiting_for_permission', 'requested', 'tmux_hook_permission'],
  question: ['waiting_for_input', 'unknown', 'tmux_hook_question'],
  ended: ['turn_ended', 'unknown', 'tmux_hook_turn_ended'],
};

test('all shared decisions round-trip; questions and turn end have distinct accessible labels', () => {
  for (const [state, [status, permission, provenance]] of Object.entries(accepted)) {
    const exported = snapshot(state);
    assert.equal(exported.schemaVersion, 3);
    assert.equal(exported.source.collectorVersion, '2.0.0');
    const normalized = normalizeImportedSnapshot(exported, NOW);
    const session = normalized.sessions[0];
    assert.equal(session.status, status);
    assert.equal(session.permissionState, permission);
    assert.equal(session.provenance, provenance);
    assert.equal(session.confidence, 'medium');
    assert.equal(session.evidence.eventAt, '2026-10-29T11:59:59.000Z');
    assert.equal(session.activity.at, session.evidence.eventAt);
    assert.equal(normalized.observedAt, AT);
    const placement = allocateSessions(normalized.sessions)[0];
    const text = buildAccessibleText(session, placement, AT);
    if (state === 'question') assert.match(text.label, /Waiting for input/);
    if (state === 'ended') {
      assert.match(text.label, /Turn ended/);
      assert.doesNotMatch(text.label, /Complete|success/i);
    }
  }
});

test('validator independently rejects every cross-product outside four hook tuples', () => {
  let count = 0;
  for (const status of ['active', 'waiting_for_permission', 'waiting_for_input', 'turn_ended', 'idle', 'complete', 'unknown']) {
    for (const permission of ['unknown', 'requested', 'granted']) {
      for (const confidence of ['medium', 'authoritative', 'low', 'none']) {
        for (const provenance of Object.values(accepted).map((row) => row[2])) {
          const data = snapshot('active');
          Object.assign(data.sessions[0], { status, permissionState: permission, confidence, provenance });
          const allowed = confidence === 'medium'
            && Object.values(accepted).some(([s, p, v]) => s === status && p === permission && v === provenance);
          if (allowed) { normalizeImportedSnapshot(data, NOW); count += 1; }
          else assert.throws(() => normalizeImportedSnapshot(data, NOW));
        }
      }
    }
  }
  assert.equal(count, 4);
});

test('future, expired, absent, malformed and unsupported observations use labelled heuristics', () => {
  for (const value of [undefined, {}, { state: 'active', at: NOW + 1 },
    { state: 'active', at: NOW - HOOK_TTL_MS }, { state: 'complete', at: NOW },
    { state: '__proto__', at: NOW }, { state: 'active', at: NaN }]) {
    assert.equal(hookClassification(value, NOW), null);
    const data = buildSnapshot([record()], AT, { '%0': value });
    assert.equal(data.sessions[0].evidence.kind, 'heuristic');
    assert.equal(data.sessions[0].evidence.eventAt, null);
    assert.notEqual(data.sessions[0].confidence, 'authoritative');
    normalizeImportedSnapshot(data, NOW);
  }
  assert.equal(hookClassification({ state: 'active', at: NOW - HOOK_TTL_MS + 1 }, NOW).status, 'active');
});

test('hook facts override sibling activity/title; absence never becomes hook idle', () => {
  for (const activity of ['1', String(NOW / 1000), '']) {
    const result = buildSnapshot([record({ window_activity: activity, pane_title: '[Working] fake | fake' })], AT,
      { '%0': { state: 'question', at: NOW } });
    assert.equal(result.sessions[0].status, 'waiting_for_input');
    assert.equal(result.sessions[0].provenance, 'tmux_hook_question');
  }
  const result = buildSnapshot([record({ pane_title: '', pane_current_command: 'claude' })], AT, {});
  assert.equal(result.sessions[0].status, 'unknown');
  assert.equal(result.sessions[0].evidence.kind, 'heuristic');
});

test('v2 path remains identical and incompatible versions, timing, metadata and provenance reject', () => {
  const legacy = buildSnapshot([record()], AT);
  assert.equal(legacy.schemaVersion, 2);
  assert.equal(legacy.source.collectorVersion, '1.1.0');
  normalizeImportedSnapshot(legacy, NOW);
  const mutations = [
    (v) => { v.schemaVersion = 2; },
    (v) => { v.source.collectorVersion = '1.1.0'; },
    (v) => { v.sessions[0].evidence.eventAt = AT; },
    (v) => { v.sessions[0].evidence.expiresAt = AT; },
    (v) => { v.sessions[0].evidence.eventAt = '2026-10-29T12:00:01.000Z'; },
    (v) => { v.sessions[0].actor = '/secret/path'; },
    (v) => { v.sessions[0].evidence.token = 'secret'; },
    (v) => { v.sessions[0].evidence.kind = 'heuristic'; },
    (v) => { v.sessions[0].confidence = 'authoritative'; },
    (v) => { v.sessions[0].status = 'complete'; },
  ];
  for (const mutate of mutations) {
    const data = snapshot('active');
    mutate(data);
    assert.throws(() => normalizeImportedSnapshot(data, NOW));
  }
  assert.doesNotMatch(JSON.stringify(snapshot('active')), /not exported|actor|session_id|socket_path|token/);
});

test('explicit opt-in reaches collector CLI and server; invalid args fail', async () => {
  const calls = [];
  const collect = async (...args) => { calls.push(args); return {}; };
  const output = { write() {} };
  assert.equal(await runCollectorCli({ argv: [], collect, stdout: output }), 0);
  assert.equal(await runCollectorCli({ argv: ['--hook-evidence'], collect, stdout: output }), 0);
  assert.deepEqual(calls, [[], [{ hookEvidence: true }]]);
  assert.deepEqual(parseServeArgs(['--hook-evidence', '--port', '0']), { port: 0, hookEvidence: true });
  assert.equal(await runCollectorCli({ argv: ['--unknown'], collect, stderr: output }), 1);
});

test('helper bridge uses bounded read-only commands; errors/malformed output fail closed', async () => {
  let command;
  const execute = (...args) => { command = args; args[3](null, '{"%0":{"state":"active","at":1}}'); };
  const result = await readHookObservations([record()], { execute });
  assert.equal(result['%0'].state, 'active');
  assert.match(command[0], /bin\/tmux-agent-observation$/);
  assert.deepEqual(command[1], ['read', '--socket', '/synthetic/socket', '--server-start', '123', '--pane', '%0']);
  assert.equal(command[2].shell, false);
  for (const value of ['garbage', '[]', 'null']) {
    assert.deepEqual(await readHookObservations([record()], { execute: (...args) => args[3](null, value) }), {});
  }
  assert.deepEqual(await readHookObservations([record()], { execute: (...args) => args[3](new Error('private')) }), {});
});
