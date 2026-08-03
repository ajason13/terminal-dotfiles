import assert from 'node:assert/strict';
import { execFile as nodeExecFile } from 'node:child_process';
import {
  mkdtemp, readFile, rmdir, unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  COLLECTOR_ERROR_CODES, LENGTH_PREFIXED_FORMAT, LIVE_CONSTANTS, TMUX_FIELDS,
} from '../src/live-constants.mjs';
import { CollectorError, parseTmuxBuffer } from '../src/tmux-frame.mjs';
import {
  canonicalizeDisplayName, classifyPane, sanitizeDisplayName,
} from '../src/tmux-classifier.mjs';
import {
  buildSnapshot, collectTmuxSnapshot, defaultSocketPath, findTmuxBinary, stableTmuxId,
} from '../src/tmux-collector.mjs';
import {
  ACTIVITY_KINDS, CONFIDENCE_LEVELS, PROVENANCE_VALUES,
  ageLabel, normalizeImportedSnapshot, readImportFile,
} from '../src/import-snapshot.mjs';
import { createSourceController } from '../src/source-controller.mjs';
import { runCollectorCli } from '../src/collector-cli.mjs';
import { generateBrowserFixtures } from './generate-browser-fixtures.mjs';
import {
  PERMISSION_STATES, SESSION_STATUSES, normalizeSnapshot,
} from '../src/session-contract.mjs';
import { allocateSessions, UNKNOWN_HOLD_ANCHORS } from '../src/track-layout.mjs';

const SOCKET = '/private/tmp/tmux-501/default';
const OBSERVED = '2026-07-22T12:00:00.000Z';
const NOW = Date.parse(OBSERVED);

function raw(overrides = {}) {
  return {
    socket_path: SOCKET,
    start_time: '1784773438',
    session_id: '$0',
    window_id: '@0',
    pane_id: '%0',
    pane_index: '0',
    window_name: 'Synthetic',
    pane_title: '⠧ Working',
    pane_current_command: 'zsh',
    ...overrides,
  };
}

function frame(records) {
  return Buffer.concat(records.map((record) => {
    const fields = TMUX_FIELDS.map((field) => {
      const bytes = Buffer.from(record[field], 'utf8');
      return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
    });
    return Buffer.concat([Buffer.from('T1'), ...fields, Buffer.from('\n')]);
  }));
}

function liveSession(overrides = {}) {
  return {
    id: 'tmux-0123456789abcdef0123456789abcdef',
    displayName: 'Synthetic · pane 0',
    status: 'active',
    permissionState: 'unknown',
    confidence: 'medium',
    provenance: 'tmux_title_spinner',
    activity: { kind: 'observed', at: OBSERVED },
    ...overrides,
  };
}

function liveSnapshot(sessions = [liveSession()], overrides = {}) {
  return {
    schemaVersion: 2,
    source: { kind: 'tmux_oneshot', collectorVersion: '1.0.0' },
    observedAt: OBSERVED,
    sessions,
    ...overrides,
  };
}

test('exports every resolved constant, enum, error code, and exact tmux format', () => {
  assert.deepEqual(LIVE_CONSTANTS, {
    SCHEMA_V2: 2,
    COLLECTOR_VERSION: '1.0.0',
    MAX_IMPORT_FILE_BYTES: 262144,
    MAX_SESSION_COUNT: 64,
    MAX_IMPORT_AGE_MS: 900000,
    MAX_FUTURE_SKEW_MS: 120000,
    STALE_LABEL_TICK_MS: 60000,
    LIVE_POLL_INTERVAL_MS: 5000,
    LIVE_MAX_CONSECUTIVE_FAILURES: 3,
    LIVE_SERVER_DEFAULT_PORT: 4173,
    LIVE_SNAPSHOT_ROUTE: '/live/snapshot',
    LIVE_TOKEN_PLACEHOLDER: '__LIVE_TOKEN__',
    LIVE_TOKEN_HEADER: 'x-live-token',
    FRESH_DISPLAY_AGE_MS: 300000,
    TMUX_TIMEOUT_MS: 3000,
    TMUX_MAX_BUFFER_BYTES: 1048576,
    TMUX_KILL_SIGNAL: 'SIGKILL',
    MAX_RAW_RECORDS: 256,
    MAX_LENGTH_DIGITS: 7,
    TMUX_FIELD_COUNT: 9,
    MAX_SOCKET_BYTES: 4096,
    MAX_NAME_OR_TITLE_BYTES: 4096,
    MAX_COMMAND_BYTES: 256,
    MAX_ID_FIELD_BYTES: 64,
    MAX_DISPLAY_NAME_CODE_POINTS: 80,
    UNKNOWN_HOLD_ANCHORS: 3,
    SHA256_EMITTED_HEX_CHARS: 32,
  });
  assert.deepEqual(ACTIVITY_KINDS, ['observed', 'last_activity', 'last_response', 'unavailable']);
  assert.deepEqual(CONFIDENCE_LEVELS, ['authoritative', 'medium', 'low', 'none']);
  assert.equal(PROVENANCE_VALUES.length, 8);
  assert.deepEqual(COLLECTOR_ERROR_CODES, [
    'TMUX_BINARY_UNAVAILABLE',
    'TMUX_SOCKET_REJECTED',
    'TMUX_TIMEOUT',
    'TMUX_OUTPUT_LIMIT',
    'TMUX_NONZERO_EXIT',
    'TMUX_STDERR',
    'TMUX_FRAME_INVALID',
    'TMUX_UTF8_INVALID',
    'TMUX_FIELD_INVALID',
    'TMUX_IDENTITY_COLLISION',
  ]);
  assert.equal(LENGTH_PREFIXED_FORMAT,
    'T1#{n:socket_path}:#{socket_path}#{n:start_time}:#{start_time}'
    + '#{n:session_id}:#{session_id}#{n:window_id}:#{window_id}'
    + '#{n:pane_id}:#{pane_id}#{n:pane_index}:#{pane_index}'
    + '#{n:window_name}:#{window_name}#{n:pane_title}:#{pane_title}'
    + '#{n:pane_current_command}:#{pane_current_command}');
});

test('parses concatenated byte-framed records containing delimiter-like and control data', () => {
  const records = [
    raw({ pane_title: 'pre⠧mid✳\u0085post', window_name: 'tab\tcolon:T1\\line\nnext' }),
    raw({ pane_id: '%1', pane_index: '1', pane_title: '◐ Thinking' }),
  ];
  assert.deepEqual(parseTmuxBuffer(frame(records), SOCKET), records);
});

test('parser rejects framing, UTF-8, fields, consistency, duplicates, and record overflow', () => {
  const malformed = [
    Buffer.alloc(0),
    Buffer.from('X1'),
    Buffer.from('T101:'),
    Buffer.from('T1-1:x'),
    Buffer.from('T1 1:x'),
  ];
  for (const value of malformed) {
    assert.throws(() => parseTmuxBuffer(value, SOCKET), { code: 'TMUX_FRAME_INVALID' });
  }
  const invalidUtf8 = frame([raw()]);
  const titleOffset = invalidUtf8.indexOf(Buffer.from('⠧'));
  invalidUtf8[titleOffset] = 0xff;
  assert.throws(() => parseTmuxBuffer(invalidUtf8, SOCKET), { code: 'TMUX_UTF8_INVALID' });
  assert.throws(() => parseTmuxBuffer(frame([raw({ session_id: '0' })]), SOCKET),
    { code: 'TMUX_FIELD_INVALID' });
  assert.throws(() => parseTmuxBuffer(frame([
    raw(), raw({ pane_id: '%1', start_time: '1784773439' }),
  ]), SOCKET), { code: 'TMUX_FIELD_INVALID' });
  assert.throws(() => parseTmuxBuffer(frame([raw(), raw()]), SOCKET),
    { code: 'TMUX_IDENTITY_COLLISION' });
  const many = Array.from({ length: 257 }, (_, index) => raw({
    pane_id: `%${index}`, pane_index: String(index),
  }));
  assert.throws(() => parseTmuxBuffer(frame(many), SOCKET), { code: 'TMUX_FRAME_INVALID' });
});

test('parser framing enforces every field byte maximum and structural edge case', () => {
  const cases = [
    ['socket_path', LIVE_CONSTANTS.MAX_SOCKET_BYTES, (length) => `/${'s'.repeat(length - 1)}`],
    ['start_time', LIVE_CONSTANTS.MAX_ID_FIELD_BYTES, (length) => '1'.repeat(length)],
    ['session_id', LIVE_CONSTANTS.MAX_ID_FIELD_BYTES, (length) => `$${'1'.repeat(length - 1)}`],
    ['window_id', LIVE_CONSTANTS.MAX_ID_FIELD_BYTES, (length) => `@${'1'.repeat(length - 1)}`],
    ['pane_id', LIVE_CONSTANTS.MAX_ID_FIELD_BYTES, (length) => `%${'1'.repeat(length - 1)}`],
    ['pane_index', LIVE_CONSTANTS.MAX_ID_FIELD_BYTES, (length) => '1'.repeat(length)],
    ['window_name', LIVE_CONSTANTS.MAX_NAME_OR_TITLE_BYTES, (length) => 'w'.repeat(length)],
    ['pane_title', LIVE_CONSTANTS.MAX_NAME_OR_TITLE_BYTES, (length) => 't'.repeat(length)],
    ['pane_current_command', LIVE_CONSTANTS.MAX_COMMAND_BYTES, (length) => 'c'.repeat(length)],
  ];
  for (const [field, limit, value] of cases) {
    const exact = raw({ [field]: value(limit) });
    const expectedSocket = field === 'socket_path' ? exact.socket_path : SOCKET;
    try {
      parseTmuxBuffer(frame([exact]), expectedSocket);
    } catch (error) {
      assert.notEqual(error.code, 'TMUX_FRAME_INVALID', `${field} exact maximum`);
    }
    assert.throws(
      () => parseTmuxBuffer(frame([raw({ [field]: value(limit + 1) })]), SOCKET),
      { code: 'TMUX_FRAME_INVALID' },
      `${field} max + 1`,
    );
  }

  const valid = frame([raw()]);
  const lengthDigits = String(Buffer.byteLength(SOCKET));
  const leadingZero = Buffer.concat([
    Buffer.from(`T10${lengthDigits}:`),
    valid.subarray(2 + lengthDigits.length + 1),
  ]);
  assert.throws(() => parseTmuxBuffer(leadingZero, SOCKET), { code: 'TMUX_FRAME_INVALID' });
  assert.throws(() => parseTmuxBuffer(Buffer.concat([valid, Buffer.from('\n')]), SOCKET),
    { code: 'TMUX_FRAME_INVALID' });
  assert.throws(() => parseTmuxBuffer(frame([raw({ window_name: 'nul\0name' })]), SOCKET),
    { code: 'TMUX_FIELD_INVALID' });
  assert.throws(() => parseTmuxBuffer(frame([raw({ socket_path: `${SOCKET}-other` })]), SOCKET),
    { code: 'TMUX_FIELD_INVALID' });
  assert.doesNotThrow(() => parseTmuxBuffer(frame([
    raw({ start_time: String(Number.MAX_SAFE_INTEGER) }),
  ]), SOCKET));
  assert.throws(() => parseTmuxBuffer(frame([
    raw({ start_time: String(Number.MAX_SAFE_INTEGER + 1) }),
  ]), SOCKET), { code: 'TMUX_FIELD_INVALID' });
});

test('classifier asserts full tuples for precedence, spinner families, tokens, and commands', () => {
  const tuple = (title, command = 'zsh') => {
    const result = classifyPane(raw({ pane_title: title, pane_current_command: command }));
    return result && [
      result.status, result.permissionState, result.confidence, result.provenance,
    ];
  };
  const waiting = ['waiting_for_permission', 'requested', 'low', 'tmux_title_action_required'];
  const thinking = ['thinking', 'unknown', 'medium', 'tmux_title_thinking'];
  const spinner = ['active', 'unknown', 'medium', 'tmux_title_spinner'];
  const working = ['active', 'unknown', 'medium', 'tmux_title_working'];
  const ready = ['idle', 'unknown', 'low', 'tmux_title_ready_idle'];
  const staticProvider = ['idle', 'unknown', 'low', 'tmux_title_static_provider'];
  const command = ['unknown', 'unknown', 'none', 'tmux_command_candidate'];

  assert.deepEqual(tuple('⠧ Action Required Thinking'), waiting);
  assert.deepEqual(tuple('✳ Thinking Action Required'), waiting);
  assert.deepEqual(tuple('✳ Thinking'), thinking);
  assert.deepEqual(tuple('⠧ Ready'), spinner);
  for (const prefix of [
    '\u2800', '\u2840', '\u2880', '\u28c0',
    '◐ ', '◓ ', '◑ ', '◒ ', '- ', '\\ ', '| ', '/ ',
  ]) {
    assert.deepEqual(tuple(`${prefix}work`), spinner, prefix);
  }
  for (const token of ['Working', 'Running', 'Processing', 'Executing', 'Loading']) {
    assert.deepEqual(tuple(`[codex] ${token} | local`), working, token);
  }
  for (const token of ['Ready', 'Idle']) assert.deepEqual(tuple(`✳ ${token}`), ready, token);
  assert.deepEqual(tuple('✳ waiting'), staticProvider);
  assert.deepEqual(tuple('[codex] waiting | local'), staticProvider);
  for (const allowed of ['codex', 'claude', 'gemini', 'aider', 'opencode']) {
    assert.deepEqual(tuple('unrecognized', `/usr/local/bin/${allowed}`), command, allowed);
  }
  assert.deepEqual(tuple('✳ thinking'), staticProvider);
  assert.deepEqual(tuple('✳ NotThinkingNow'), staticProvider);
  assert.deepEqual(tuple('✳ Thinkingé'), thinking);
  assert.equal(tuple('Thinking'), null);
  assert.equal(tuple('⠧\u0085Thinking'), null);
  assert.deepEqual(tuple('✳\u0001Ready', 'claude'), command);
  assert.equal(tuple('plain', 'mycodex'), null);
});

test('display sanitization and stable identity preserve privacy and server epochs', () => {
  assert.equal(sanitizeDisplayName(' \u0001 Project\t\n Name \u0085 ', '2'), 'Project Name · pane 2');
  assert.equal(canonicalizeDisplayName(' A\u2003B '), 'A B');
  assert.equal(sanitizeDisplayName('\u0001\u0085', '7'), 'Pane 7');
  assert.equal([...sanitizeDisplayName('x'.repeat(100), '12')].length, 80);
  const first = stableTmuxId(raw());
  assert.match(first, /^tmux-[0-9a-f]{32}$/);
  assert.equal(first, stableTmuxId(raw()));
  assert.notEqual(first, stableTmuxId(raw({ start_time: '1784773439' })));
  assert.notEqual(first, stableTmuxId(raw({ pane_id: '%1' })));
  const output = buildSnapshot([raw()], OBSERVED);
  assert.deepEqual(Object.keys(output).sort(), ['observedAt', 'schemaVersion', 'sessions', 'source']);
  const serialized = JSON.stringify(output);
  for (const forbidden of [SOCKET, '1784773438', '%0', '⠧ Working', '"zsh"',
    'socket_path', 'start_time', 'pane_title', 'pane_current_command']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('snapshot emission accepts 64 admitted sessions and fails closed at 65', () => {
  const records = Array.from({ length: 65 }, (_, index) => raw({
    pane_id: `%${index}`,
    pane_index: String(index),
    window_name: `Synthetic ${index}`,
    pane_title: '⠧ Working',
  }));
  assert.equal(buildSnapshot(records.slice(0, 64), OBSERVED).sessions.length, 64);
  assert.throws(() => buildSnapshot(records, OBSERVED), { code: 'TMUX_FIELD_INVALID' });
});

test('collector makes exactly one hardened execFile call through injected boundaries', async () => {
  const calls = [];
  const snapshot = await collectTmuxSnapshot({
    uid: 501,
    now: () => new Date(OBSERVED),
    statFile: async (path) => ({
      uid: 501, mode: 0o100755, isFile: () => path === '/opt/homebrew/bin/tmux',
    }),
    accessFile: async () => {},
    lstatFile: async () => ({ uid: 501, isSocket: () => true }),
    execFile: (...args) => {
      calls.push(args);
      args.at(-1)(null, frame([raw()]), Buffer.alloc(0));
    },
  });
  assert.equal(calls.length, 1);
  const [binary, args, options] = calls[0];
  assert.equal(binary, '/opt/homebrew/bin/tmux');
  assert.deepEqual(args, ['-S', SOCKET, 'list-panes', '-a', '-F', LENGTH_PREFIXED_FORMAT]);
  assert.deepEqual(options, {
    cwd: '/',
    env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    encoding: 'buffer',
    timeout: 3000,
    maxBuffer: 1048576,
    killSignal: 'SIGKILL',
    windowsHide: true,
    shell: false,
  });
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(defaultSocketPath(501), SOCKET);
});

test('binary validation requires trusted ownership, hardened mode, and fs X_OK access', async () => {
  for (const uid of [501, 0]) {
    assert.equal(await findTmuxBinary({
      uid: 501,
      statFile: async () => ({ uid, mode: 0o100755, isFile: () => true }),
      accessFile: async (path, mode) => {
        assert.equal(path, '/opt/homebrew/bin/tmux');
        assert.equal(mode, 1);
      },
    }), '/opt/homebrew/bin/tmux');
  }
  for (const info of [
    { uid: 502, mode: 0o100755, isFile: () => true },
    { uid: 501, mode: 0o100644, isFile: () => true },
    { uid: 501, mode: 0o100775, isFile: () => true },
    { uid: 501, mode: 0o100757, isFile: () => true },
    { uid: 501, mode: 0o040755, isFile: () => false },
  ]) {
    await assert.rejects(findTmuxBinary({
      uid: 501,
      statFile: async () => info,
      accessFile: async () => {
        assert.fail('access must not run after rejected stat metadata');
      },
    }), { code: 'TMUX_BINARY_UNAVAILABLE' });
  }
  let accessAttempts = 0;
  await assert.rejects(findTmuxBinary({
    uid: 501,
    statFile: async () => ({ uid: 501, mode: 0o100755, isFile: () => true }),
    accessFile: async () => {
      accessAttempts += 1;
      throw new Error('private access failure');
    },
  }), { code: 'TMUX_BINARY_UNAVAILABLE' });
  assert.equal(accessAttempts, 2);
});

test('collector errors are closed and output-limit differs from parser record-count failure', async () => {
  const base = {
    uid: 501,
    statFile: async () => ({ uid: 0, mode: 0o100755, isFile: () => true }),
    accessFile: async () => {},
    lstatFile: async () => ({ uid: 501, isSocket: () => true }),
  };
  await assert.rejects(collectTmuxSnapshot({
    ...base,
    execFile: (...args) => args.at(-1)(
      Object.assign(new Error('private raw details'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }),
      Buffer.from('partial private output'),
      Buffer.alloc(0),
    ),
  }), { code: 'TMUX_OUTPUT_LIMIT' });
  await assert.rejects(collectTmuxSnapshot({
    ...base,
    execFile: (...args) => args.at(-1)(null, frame([raw()]), Buffer.from('warning')),
  }), { code: 'TMUX_STDERR' });
  assert.throws(() => parseTmuxBuffer(frame(Array.from({ length: 257 }, (_, index) => raw({
    pane_id: `%${index}`, pane_index: String(index),
  }))), SOCKET), { code: 'TMUX_FRAME_INVALID' });
});

test('native child-process maxBuffer enforcement maps to TMUX_OUTPUT_LIMIT', async () => {
  const generator = String.raw`
    const socket = '/private/tmp/tmux-501/default';
    const record = (index) => {
      const values = [
        socket, '1784773438', '$0', '@0', '%' + index, String(index),
        'w'.repeat(4096), '⠧' + 't'.repeat(4093), 'c'.repeat(256),
      ];
      const fields = values.map((value) => {
        const bytes = Buffer.from(value, 'utf8');
        return Buffer.concat([Buffer.from(String(bytes.length) + ':'), bytes]);
      });
      return Buffer.concat([Buffer.from('T1'), ...fields, Buffer.from('\n')]);
    };
    for (let index = 0; index < 128; index += 1) process.stdout.write(record(index));
  `;
  let callbackError;
  await assert.rejects(collectTmuxSnapshot({
    uid: 501,
    statFile: async () => ({ uid: 501, mode: 0o100755, isFile: () => true }),
    accessFile: async () => {},
    lstatFile: async () => ({ uid: 501, isSocket: () => true }),
    execFile: (ignoredBinary, ignoredArguments, options, callback) => {
      nodeExecFile(process.execPath, ['-e', generator], options, (error, stdout, stderr) => {
        callbackError = error;
        callback(error, stdout, stderr);
      });
    },
  }), { code: 'TMUX_OUTPUT_LIMIT' });
  assert.equal(callbackError?.code, 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
});

test('binary, socket, timeout, nonzero, and emitted-identity failures use closed codes', async () => {
  const executable = async () => ({ uid: 501, mode: 0o100755, isFile: () => true });
  const accessible = async () => {};
  const socket = async () => ({ uid: 501, isSocket: () => true });

  await assert.rejects(collectTmuxSnapshot({
    uid: 501,
    statFile: async () => { throw new Error('private binary path'); },
  }), { code: 'TMUX_BINARY_UNAVAILABLE' });

  await assert.rejects(collectTmuxSnapshot({
    uid: 501,
    statFile: executable,
    accessFile: accessible,
    lstatFile: async () => ({ uid: 501, isSocket: () => false }),
  }), { code: 'TMUX_SOCKET_REJECTED' });

  await assert.rejects(collectTmuxSnapshot({
    uid: 501,
    statFile: executable,
    accessFile: accessible,
    lstatFile: socket,
    execFile: (...args) => args.at(-1)(
      Object.assign(new Error('private timeout details'), { killed: true }),
      Buffer.from('partial private output'),
      Buffer.alloc(0),
    ),
  }), { code: 'TMUX_TIMEOUT' });

  await assert.rejects(collectTmuxSnapshot({
    uid: 501,
    statFile: executable,
    accessFile: accessible,
    lstatFile: socket,
    execFile: (...args) => args.at(-1)(
      Object.assign(new Error('private nonzero details'), { code: 1 }),
      Buffer.from('partial private output'),
      Buffer.alloc(0),
    ),
  }), { code: 'TMUX_NONZERO_EXIT' });

  assert.throws(() => buildSnapshot([
    raw(),
    raw({ window_name: 'Different synthetic label' }),
  ], OBSERVED), { code: 'TMUX_IDENTITY_COLLISION' });
});

test('CLI emits complete JSON only on success and never partial stdout on failure', async () => {
  const capture = () => {
    let value = '';
    return { stream: { write: (chunk) => { value += chunk; } }, value: () => value };
  };
  const successOut = capture();
  const successErr = capture();
  assert.equal(await runCollectorCli({
    collect: async () => liveSnapshot(),
    stdout: successOut.stream,
    stderr: successErr.stream,
  }), 0);
  assert.deepEqual(JSON.parse(successOut.value()), liveSnapshot());
  assert.equal(successErr.value(), '');

  const failedOut = capture();
  const failedErr = capture();
  assert.equal(await runCollectorCli({
    collect: async () => { throw new CollectorError('TMUX_FRAME_INVALID'); },
    stdout: failedOut.stream,
    stderr: failedErr.stream,
  }), 1);
  assert.equal(failedOut.value(), '');
  assert.equal(failedErr.value(), 'TMUX_FRAME_INVALID\n');
});

test('schema-v2 accepts every compatibility row and normalizes tmux-only identity', () => {
  const rows = [
    ['active', 'unknown', 'medium', 'tmux_title_spinner'],
    ['active', 'unknown', 'medium', 'tmux_title_working'],
    ['thinking', 'unknown', 'medium', 'tmux_title_thinking'],
    ['waiting_for_permission', 'requested', 'low', 'tmux_title_action_required'],
    ['idle', 'unknown', 'low', 'tmux_title_ready_idle'],
    ['idle', 'unknown', 'low', 'tmux_title_static_provider'],
    ['unknown', 'unknown', 'none', 'tmux_command_candidate'],
  ];
  const sessions = rows.map(([status, permissionState, confidence, provenance], index) => liveSession({
    id: `tmux-${index.toString(16).padStart(32, '0')}`,
    status, permissionState, confidence, provenance,
  }));
  const normalized = normalizeImportedSnapshot(liveSnapshot(sessions), NOW);
  assert.equal(normalized.sessions.length, rows.length);
  assert.equal(normalized.sessions.every((item) => item.sourceKind === 'tmux_oneshot'), true);
  assert.equal(normalized.sessions.every((item) => /^tmux-[0-9a-f]{32}$/.test(item.id)), true);

  const fixture = normalizeSnapshot({
    schemaVersion: 1,
    generatedAt: '2026-07-19T20:30:00Z',
    sessions: [{
      id: 'fixture-id-exempt',
      displayName: 'Fixture',
      status: 'idle',
      lastActivityAt: '2026-07-19T20:29:00Z',
      permissionState: 'not_required',
    }],
  });
  assert.equal(fixture.sessions[0].id, 'fixture-id-exempt');
  assert.equal(/^tmux-[0-9a-f]{32}$/.test(fixture.sessions[0].id), false);
});

test('tmux schema compatibility matrix accepts exactly seven exhaustive combinations', () => {
  const accepted = new Set([
    'active|observed|unknown|medium|tmux_title_spinner',
    'active|observed|unknown|medium|tmux_title_working',
    'thinking|observed|unknown|medium|tmux_title_thinking',
    'waiting_for_permission|observed|requested|low|tmux_title_action_required',
    'idle|observed|unknown|low|tmux_title_ready_idle',
    'idle|observed|unknown|low|tmux_title_static_provider',
    'unknown|observed|unknown|none|tmux_command_candidate',
  ]);
  let acceptedCount = 0;
  let testedCount = 0;
  for (const status of SESSION_STATUSES) {
    for (const activityKind of ACTIVITY_KINDS) {
      for (const permissionState of PERMISSION_STATES) {
        for (const confidence of CONFIDENCE_LEVELS) {
          for (const provenance of PROVENANCE_VALUES) {
            const key = [
              status, activityKind, permissionState, confidence, provenance,
            ].join('|');
            const activity = activityKind === 'unavailable'
              ? { kind: activityKind }
              : { kind: activityKind, at: OBSERVED };
            const candidate = liveSnapshot([liveSession({
              status, permissionState, confidence, provenance, activity,
            })]);
            let didAccept = true;
            try {
              normalizeImportedSnapshot(candidate, NOW);
            } catch {
              didAccept = false;
            }
            assert.equal(didAccept, accepted.has(key), key);
            if (didAccept) acceptedCount += 1;
            testedCount += 1;
          }
        }
      }
    }
  }
  assert.equal(testedCount, 4480);
  assert.equal(acceptedCount, 7);
});

test('schema-v2 rejects extra keys, v1, duplicate IDs, timestamps, and invalid combinations', () => {
  const invalid = [
    { ...liveSnapshot(), schemaVersion: 1 },
    { ...liveSnapshot(), generatedAt: OBSERVED },
    liveSnapshot([{ ...liveSession(), title: 'private' }]),
    liveSnapshot([liveSession(), liveSession()]),
    liveSnapshot([liveSession({ permissionState: 'requested' })]),
    liveSnapshot([liveSession({ activity: { kind: 'unavailable' } })]),
    liveSnapshot([liveSession({ activity: { kind: 'observed', at: '2026-07-22T12:00:00Z' } })]),
    liveSnapshot([liveSession({ id: 'fixture-id' })]),
    liveSnapshot([liveSession({ displayName: ' <img src=x onerror=alert(1)>  Name' })]),
    liveSnapshot([liveSession({ displayName: 'A\u2003B' })]),
  ];
  for (const value of invalid) {
    assert.throws(() => normalizeImportedSnapshot(value, NOW), /LIVE_SNAPSHOT_INVALID/);
  }
  assert.throws(() => normalizeImportedSnapshot(liveSnapshot(), NOW + 900001), /LIVE_SNAPSHOT_INVALID/);
  assert.throws(() => normalizeImportedSnapshot(liveSnapshot(), NOW - 120001), /LIVE_SNAPSHOT_INVALID/);
  assert.doesNotThrow(() => normalizeImportedSnapshot(liveSnapshot(), NOW + 900000));
  assert.doesNotThrow(() => normalizeImportedSnapshot(liveSnapshot(), NOW - 120000));
});

test('file size is checked before FileReader creation and schema-v1 imports reject', async () => {
  let readers = 0;
  class Reader {
    constructor() { readers += 1; }
    readAsText() {}
  }
  await assert.rejects(readImportFile({ size: 0 }, { FileReaderClass: Reader }), /LIVE_SNAPSHOT_INVALID/);
  await assert.rejects(readImportFile(
    { size: LIVE_CONSTANTS.MAX_IMPORT_FILE_BYTES + 1 },
    { FileReaderClass: Reader },
  ), /LIVE_SNAPSHOT_INVALID/);
  assert.equal(readers, 0);

  class V1Reader {
    readAsText() {
      this.result = '{"schemaVersion":1,"generatedAt":"2026-07-19T20:30:00Z","sessions":[]}';
      this.onload();
    }
  }
  await assert.rejects(readImportFile(
    { size: 80 }, { FileReaderClass: V1Reader, importNow: NOW },
  ), /LIVE_SNAPSHOT_INVALID/);
});

test('browser fixture generator emits same-clock valid and invalid inputs and cleans up', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dashboard-browser-test-'));
  try {
    const generated = await generateBrowserFixtures(directory, OBSERVED);
    const valid = JSON.parse(await readFile(generated.validPath, 'utf8'));
    const invalid = JSON.parse(await readFile(generated.invalidPath, 'utf8'));
    assert.equal(generated.observedAt, OBSERVED);
    assert.equal(normalizeImportedSnapshot(valid, NOW).observedAt, OBSERVED);
    assert.throws(() => normalizeImportedSnapshot(invalid, NOW), /LIVE_SNAPSHOT_INVALID/);
    assert.equal(valid.sessions.filter((item) => item.status === 'unknown').length, 4);
    await unlink(generated.validPath);
    await unlink(generated.invalidPath);
  } finally {
    await rmdir(directory);
  }
});

test('age labels use fresh, aging, stale bands and clamp future age to zero', () => {
  assert.equal(ageLabel(OBSERVED, NOW - 120000), 'fresh · observed 0 minutes ago');
  assert.equal(ageLabel(OBSERVED, NOW + 299999), 'fresh · observed 4 minutes ago');
  assert.equal(ageLabel(OBSERVED, NOW + 300000), 'aging · observed 5 minutes ago');
  assert.equal(ageLabel(OBSERVED, NOW + 900000), 'aging · observed 15 minutes ago');
  assert.equal(ageLabel(OBSERVED, NOW + 900001), 'stale · observed 15 minutes ago');
});

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.files = [];
    this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
}

function deferred() {
  const value = {};
  value.promise = new Promise((resolve, reject) => {
    value.resolve = resolve;
    value.reject = reject;
  });
  return value;
}

test('source lifecycle guards reentry and tears down renders and the sole timer', async () => {
  const fileInput = new FakeElement();
  const resetButton = new FakeElement();
  const region = new FakeElement();
  const sourceLabel = new FakeElement();
  const sourceAge = new FakeElement();
  const sourceNotice = new FakeElement();
  const renders = [];
  const intervals = [];
  const clears = [];
  const pending = [];
  let fixtureEpoch = 0;
  const controller = createSourceController({
    fileInput,
    resetButton,
    importRegion: region,
    sourceLabel,
    sourceAge,
    sourceNotice,
    readFixtures: async () => ({ kind: 'fixture', epoch: ++fixtureEpoch }),
    readFile: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    render: (snapshot) => {
      const record = { snapshot, destroyed: 0, cleared: 0 };
      renders.push(record);
      return {
        destroy: () => { record.destroyed += 1; },
        clearInteraction: () => { record.cleared += 1; },
      };
    },
    now: () => NOW,
    setIntervalFn: (fn, delay) => {
      intervals.push({ fn, delay });
      return intervals.length;
    },
    clearIntervalFn: (id) => clears.push(id),
    windowRef: new FakeElement(),
  });

  await controller.start();
  assert.equal(controller.mode, 'fixtures');
  const first = controller.selectFile({ size: 100 });
  assert.equal(controller.mode, 'validating');
  assert.equal(fileInput.disabled, true);
  assert.equal(region.getAttribute('aria-busy'), 'true');
  const second = await controller.selectFile({ size: 100 });
  assert.equal(second, false);
  assert.equal(pending.length, 1);
  pending[0].resolve(normalizeImportedSnapshot(liveSnapshot(), NOW));
  assert.equal(await first, true);
  assert.equal(controller.mode, 'live');
  assert.equal(intervals.length, 1);

  const replaceLive = controller.selectFile({ size: 100 });
  pending[1].resolve(normalizeImportedSnapshot(liveSnapshot([], {
    observedAt: OBSERVED,
  }), NOW));
  await replaceLive;
  assert.equal(controller.mode, 'live');
  assert.equal(intervals.length, 2);
  assert.deepEqual(clears, [1]);

  const reject = controller.selectFile({ size: 100 });
  pending[2].reject(new Error('private filename'));
  await reject;
  assert.equal(controller.mode, 'rejected_fixtures');
  assert.equal(sourceNotice.textContent, 'Live snapshot rejected; showing fixtures.');
  assert.equal(renders.at(-1).snapshot.kind, 'fixture');
  assert.equal(renders.at(-1).snapshot.epoch, 2);
  assert.equal(fileInput.disabled, false);
  assert.equal(region.getAttribute('aria-busy'), undefined);

  await controller.reset();
  assert.equal(controller.mode, 'fixtures');
  assert.equal(sourceNotice.textContent, '');
  assert.equal(renders.at(-1).snapshot.epoch, 3);
  assert.equal(renders.slice(0, -1).every((item) => item.destroyed === 1), true);
  controller.destroy();
  assert.equal(renders.at(-1).destroyed, 1);
});

test('programmatic change while validating creates only one read attempt', async () => {
  const fileInput = new FakeElement();
  const resetButton = new FakeElement();
  const region = new FakeElement();
  const deferred = {};
  let reads = 0;
  const controller = createSourceController({
    fileInput,
    resetButton,
    importRegion: region,
    sourceLabel: new FakeElement(),
    sourceAge: new FakeElement(),
    sourceNotice: new FakeElement(),
    readFixtures: async () => ({ kind: 'fixture' }),
    readFile: () => {
      reads += 1;
      return new Promise((resolve) => { deferred.resolve = resolve; });
    },
    render: () => ({ destroy() {}, clearInteraction() {} }),
    windowRef: new FakeElement(),
  });
  await controller.start();
  fileInput.files = [{ size: 100 }];
  fileInput.dispatchEvent(new Event('change'));
  fileInput.dispatchEvent(new Event('change'));
  assert.equal(fileInput.disabled, true);
  assert.equal(reads, 1);
  deferred.resolve(normalizeImportedSnapshot(liveSnapshot(), NOW));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.mode, 'live');
  controller.destroy();
});

test('destroy invalidates in-flight import resolve and reject without later commits', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const fileInput = new FakeElement();
    const region = new FakeElement();
    const sourceLabel = new FakeElement();
    const sourceAge = new FakeElement();
    const sourceNotice = new FakeElement();
    const pending = deferred();
    const renders = [];
    const intervals = [];
    let fixtureReads = 0;
    const controller = createSourceController({
      fileInput,
      resetButton: new FakeElement(),
      importRegion: region,
      sourceLabel,
      sourceAge,
      sourceNotice,
      readFixtures: async () => ({ kind: 'fixture', epoch: ++fixtureReads }),
      readFile: () => pending.promise,
      render: (snapshot) => {
        const record = { snapshot, destroyed: 0 };
        renders.push(record);
        return { destroy: () => { record.destroyed += 1; }, clearInteraction() {} };
      },
      setIntervalFn: (fn) => {
        intervals.push(fn);
        return intervals.length;
      },
      clearIntervalFn() {},
      windowRef: new FakeElement(),
    });
    await controller.start();
    const transition = controller.selectFile({ size: 100 });
    assert.equal(controller.mode, 'validating');
    controller.destroy();
    if (outcome === 'resolve') pending.resolve(normalizeImportedSnapshot(liveSnapshot(), NOW));
    else pending.reject(new Error('private rejected file'));
    assert.equal(await transition, false);
    assert.equal(renders.length, 1, outcome);
    assert.equal(renders[0].destroyed, 1, outcome);
    assert.equal(intervals.length, 0, outcome);
    assert.equal(fixtureReads, 1, outcome);
    assert.equal(controller.mode, 'validating', outcome);
    assert.equal(fileInput.disabled, true, outcome);
    assert.equal(region.getAttribute('aria-busy'), 'true', outcome);
    assert.equal(sourceLabel.textContent, 'Validating live snapshot…', outcome);
    assert.equal(sourceAge.textContent, '', outcome);
    assert.equal(sourceNotice.textContent, '', outcome);
  }
});

test('destroy invalidates an in-flight fixture start before render or control mutation', async () => {
  const fixture = deferred();
  const sourceLabel = new FakeElement();
  const sourceAge = new FakeElement();
  const sourceNotice = new FakeElement();
  const renders = [];
  const controller = createSourceController({
    fileInput: new FakeElement(),
    resetButton: new FakeElement(),
    importRegion: new FakeElement(),
    sourceLabel,
    sourceAge,
    sourceNotice,
    readFixtures: () => fixture.promise,
    render: (snapshot) => renders.push(snapshot),
    windowRef: new FakeElement(),
  });
  const start = controller.start();
  controller.destroy();
  fixture.resolve({ kind: 'fixture' });
  assert.equal(await start, false);
  assert.deepEqual(renders, []);
  assert.equal(sourceLabel.textContent, '');
  assert.equal(sourceAge.textContent, '');
  assert.equal(sourceNotice.textContent, '');
});

test('repeated failure transitions render fresh fixtures before a later successful import', async () => {
  const pending = [];
  const renders = [];
  const intervals = [];
  let fixtureEpoch = 0;
  const sourceNotice = new FakeElement();
  const controller = createSourceController({
    fileInput: new FakeElement(),
    resetButton: new FakeElement(),
    importRegion: new FakeElement(),
    sourceLabel: new FakeElement(),
    sourceAge: new FakeElement(),
    sourceNotice,
    readFixtures: async () => ({ kind: 'fixture', epoch: ++fixtureEpoch }),
    readFile: () => {
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
    render: (snapshot) => {
      const record = { snapshot, destroyed: 0 };
      renders.push(record);
      return {
        destroy: () => { record.destroyed += 1; },
        clearInteraction() {},
      };
    },
    setIntervalFn: (fn, delay) => {
      intervals.push({ fn, delay });
      return intervals.length;
    },
    clearIntervalFn() {},
    windowRef: new FakeElement(),
  });
  await controller.start();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const transition = controller.selectFile({ size: 100 });
    pending[attempt].reject(new Error('private invalid input'));
    assert.equal(await transition, false);
    assert.equal(controller.mode, 'rejected_fixtures');
    assert.equal(sourceNotice.textContent, 'Live snapshot rejected; showing fixtures.');
  }
  const success = controller.selectFile({ size: 100 });
  pending[2].resolve(normalizeImportedSnapshot(liveSnapshot(), NOW));
  assert.equal(await success, true);
  assert.equal(controller.mode, 'live');
  assert.equal(fixtureEpoch, 3);
  assert.deepEqual(renders.map((item) => item.snapshot.kind ?? 'live'), [
    'fixture', 'fixture', 'fixture', 'live',
  ]);
  assert.equal(renders.slice(0, -1).every((item) => item.destroyed === 1), true);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, LIVE_CONSTANTS.STALE_LABEL_TICK_MS);
  assert.equal(sourceNotice.textContent, '');
  controller.destroy();
});

const LIVE_POLL_SENTINEL_ID = 'tmux-abcdef0123456789abcdef0123456789';
const LIVE_POLL_SENTINEL_NAME = 'Live poll · sentinel';

function livePollSnapshot() {
  return liveSnapshot([liveSession({
    id: LIVE_POLL_SENTINEL_ID,
    displayName: LIVE_POLL_SENTINEL_NAME,
  })]);
}

test('goLive polls, validates, and renders live snapshots', async () => {
  const rendered = [];
  const intervals = [];
  const hidden = false;
  const controller = createSourceController({
    fileInput: new FakeElement(),
    resetButton: new FakeElement(),
    importRegion: new FakeElement(),
    sourceLabel: new FakeElement(),
    sourceAge: new FakeElement(),
    sourceNotice: new FakeElement(),
    readFixtures: async () => liveSnapshot(),
    render: (snapshot) => {
      rendered.push(snapshot);
      return { destroy() {}, clearInteraction() {} };
    },
    fetchSnapshot: async () => ({ ok: true, json: async () => livePollSnapshot() }),
    token: 'tok',
    now: () => NOW,
    setIntervalFn: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    clearIntervalFn: () => {},
    visibility: { isHidden: () => hidden, subscribe: () => () => {} },
    windowRef: new FakeElement(),
  });
  await controller.start();
  assert.equal(rendered[0].sessions[0].displayName, 'Synthetic · pane 0');
  const went = await controller.goLive();
  assert.equal(went, true);
  assert.equal(controller.mode, 'live_polling');
  assert.equal(rendered.length, 2);
  // The distinguishing sentinel proves this render came from the live poll,
  // not a repeat of the initial fixtures render (both fixtures do exist in liveSnapshot() shape).
  assert.equal(rendered.at(-1).sessions[0].displayName, LIVE_POLL_SENTINEL_NAME);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, LIVE_CONSTANTS.LIVE_POLL_INTERVAL_MS);
  controller.destroy();
});

test('goLive marks the view stale on a single failed poll without falling back to fixtures', async () => {
  const rendered = [];
  const intervals = [];
  const sourceNotice = new FakeElement();
  let callCount = 0;
  const controller = createSourceController({
    fileInput: new FakeElement(),
    resetButton: new FakeElement(),
    importRegion: new FakeElement(),
    sourceLabel: new FakeElement(),
    sourceAge: new FakeElement(),
    sourceNotice,
    readFixtures: async () => liveSnapshot(),
    render: (snapshot) => {
      rendered.push(snapshot);
      return { destroy() {}, clearInteraction() {} };
    },
    fetchSnapshot: async () => {
      callCount += 1;
      if (callCount === 1) return { ok: false };
      return { ok: true, json: async () => livePollSnapshot() };
    },
    token: 'tok',
    now: () => NOW,
    setIntervalFn: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    clearIntervalFn: () => {},
    windowRef: new FakeElement(),
  });
  await controller.start();
  const lastGoodRender = rendered.at(-1);
  await controller.goLive();
  assert.equal(controller.mode, 'live_polling');
  assert.equal(sourceNotice.textContent, 'Live update failed; retrying…');
  assert.equal(rendered.at(-1), lastGoodRender);
  assert.equal(rendered.length, 1);
  controller.destroy();
});

test('goLive falls back to rejected fixtures after max consecutive failures', async () => {
  const rendered = [];
  const intervals = [];
  const controller = createSourceController({
    fileInput: new FakeElement(),
    resetButton: new FakeElement(),
    importRegion: new FakeElement(),
    sourceLabel: new FakeElement(),
    sourceAge: new FakeElement(),
    sourceNotice: new FakeElement(),
    readFixtures: async () => liveSnapshot(),
    render: (snapshot) => {
      rendered.push(snapshot);
      return { destroy() {}, clearInteraction() {} };
    },
    fetchSnapshot: async () => ({ ok: true, json: async () => ({ bad: true }) }),
    token: 'tok',
    now: () => NOW,
    setIntervalFn: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    clearIntervalFn: () => {},
    windowRef: new FakeElement(),
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  await controller.start();
  await controller.goLive();
  assert.equal(controller.mode, 'live_polling');
  for (let attempt = 0; attempt < LIVE_CONSTANTS.LIVE_MAX_CONSECUTIVE_FAILURES - 1; attempt += 1) {
    intervals[0].fn();
    await flush();
    await flush();
  }
  await flush();
  assert.equal(controller.mode, 'rejected_fixtures');
  assert.equal(rendered.at(-1).sessions.length, 1);
  controller.destroy();
});

test('unknown hold has independent 0/1/3/4 capacity and canonical probing', () => {
  assert.equal(UNKNOWN_HOLD_ANCHORS.length, 3);
  for (const count of [0, 1, 3, 4]) {
    const sessions = Array.from({ length: count }, (_, index) => ({
      ...liveSession({
        id: `tmux-${index.toString(16).padStart(32, '0')}`,
        displayName: `Unknown ${index}`,
        status: 'unknown',
        confidence: 'none',
        provenance: 'tmux_command_candidate',
      }),
      sourceKind: 'tmux_oneshot',
      generatedAt: OBSERVED,
      lastActivityAt: OBSERVED,
      mapCode: `S${index + 1}`,
    }));
    const placements = allocateSessions(sessions);
    assert.equal(placements.filter((item) => !item.overflow).length, Math.min(3, count));
    assert.equal(placements.filter((item) => item.overflow).length, Math.max(0, count - 3));
    assert.equal(placements.every((item) => item.pool === 'unknown'), true);
    const reversed = allocateSessions([...sessions].reverse());
    assert.deepEqual(
      Object.fromEntries(placements.map((item) => [item.id, item.slotIndex])),
      Object.fromEntries(reversed.map((item) => [item.id, item.slotIndex])),
    );
  }
});

test('browser sources omit unsafe APIs and contain exactly one interval call site', async () => {
  const sources = await Promise.all([
    '../src/app.mjs', '../src/import-snapshot.mjs', '../src/source-controller.mjs',
    '../src/render-dashboard.mjs', '../index.html',
  ].map(async (path) => (await import('node:fs/promises')).readFile(new URL(path, import.meta.url), 'utf8')));
  const joined = sources.join('\n');
  assert.doesNotMatch(joined, /\.innerHTML\s*=|insertAdjacentHTML|fetch\(|WebSocket|EventSource/);
  assert.doesNotMatch(joined, /capture-pane|send-keys|run-shell|wezterm\s+cli/);
  assert.doesNotMatch(joined, /chat|terminal façade|terminal-facade|session-card/);
  assert.equal((joined.match(/setIntervalFn\(/g) ?? []).length, 1);
});

test('source controls preserve 44px targets and visible keyboard focus on the import label', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const controls = styles.match(/\.import-label,\s*\.source-controls button\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(controls, /display:\s*inline-flex/);
  assert.match(controls, /min-height:\s*44px/);
  assert.match(
    styles,
    /\.source-controls:has\(#snapshot-file:focus-visible\)\s+\.import-label[\s\S]*outline:\s*3px solid var\(--color-focus\)/,
  );
});
