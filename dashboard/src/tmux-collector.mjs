import { createHash } from 'node:crypto';
import { execFile as nodeExecFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { lstat, stat } from 'node:fs/promises';
import { access } from 'node:fs/promises';

import {
  LENGTH_PREFIXED_FORMAT, LIVE_CONSTANTS, TMUX_BINARIES,
} from './live-constants.mjs';
import { classifyPane, sanitizeDisplayName, windowSilenceMs } from './tmux-classifier.mjs';
import { CollectorError, parseTmuxBuffer } from './tmux-frame.mjs';

function fail(code) {
  throw new CollectorError(code);
}

export async function findTmuxBinary({
  statFile = stat,
  accessFile = access,
  uid = process.getuid(),
} = {}) {
  for (const candidate of TMUX_BINARIES) {
    try {
      const info = await statFile(candidate);
      const owned = info.uid === 0 || info.uid === uid;
      if (info.isFile() && owned && (info.mode & 0o111) !== 0 && (info.mode & 0o022) === 0) {
        await accessFile(candidate, fsConstants.X_OK);
        return candidate;
      }
    } catch {
      // Continue only through the closed candidate list.
    }
  }
  fail('TMUX_BINARY_UNAVAILABLE');
}

export function defaultSocketPath(uid = process.getuid()) {
  if (!Number.isSafeInteger(uid) || uid < 0) fail('TMUX_SOCKET_REJECTED');
  return `/private/tmp/tmux-${uid}/default`;
}

export async function validateSocket(socketPath, { lstatFile = lstat, uid = process.getuid() } = {}) {
  try {
    const info = await lstatFile(socketPath);
    if (!info.isSocket() || info.uid !== uid) fail('TMUX_SOCKET_REJECTED');
  } catch (error) {
    if (error instanceof CollectorError) throw error;
    fail('TMUX_SOCKET_REJECTED');
  }
  return socketPath;
}

export function stableTmuxId(record) {
  const digest = createHash('sha256')
    .update('dashboard-tmux-id-v1\0', 'utf8')
    .update(record.socket_path, 'utf8')
    .update('\0', 'utf8')
    .update(record.start_time, 'utf8')
    .update('\0', 'utf8')
    .update(record.pane_id, 'utf8')
    .digest('hex');
  return `tmux-${digest.slice(0, LIVE_CONSTANTS.SHA256_EMITTED_HEX_CHARS)}`;
}

function lastActivityAt(record, observedAtMs, observedAt) {
  const silence = windowSilenceMs(record, observedAtMs);
  return silence === null ? observedAt : new Date(observedAtMs - silence).toISOString();
}

export function buildSnapshot(records, observedAt = new Date().toISOString()) {
  const emittedIds = new Set();
  const sessions = [];
  const observedAtMs = Date.parse(observedAt);
  for (const record of records) {
    const classification = classifyPane(record, observedAtMs);
    if (!classification) continue;
    const id = stableTmuxId(record);
    if (emittedIds.has(id)) fail('TMUX_IDENTITY_COLLISION');
    emittedIds.add(id);
    sessions.push({
      id,
      displayName: sanitizeDisplayName(record.window_name, record.pane_index, record.session_name),
      ...classification,
      // When the epoch is unusable this falls back to the observation time, which
      // is the old behaviour: no worse a claim than the snapshot already made.
      activity: { kind: 'observed', at: lastActivityAt(record, observedAtMs, observedAt) },
    });
    if (sessions.length > LIVE_CONSTANTS.MAX_SESSION_COUNT) fail('TMUX_FIELD_INVALID');
  }
  return {
    schemaVersion: LIVE_CONSTANTS.SCHEMA_V2,
    source: { kind: 'tmux_oneshot', collectorVersion: LIVE_CONSTANTS.COLLECTOR_VERSION },
    observedAt,
    sessions,
  };
}

function runTmux(execFile, binary, socketPath) {
  return new Promise((resolve, reject) => {
    execFile(binary, [
      '-S', socketPath,
      'list-panes',
      '-a',
      '-F', LENGTH_PREFIXED_FORMAT,
    ], {
      cwd: '/',
      env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
      encoding: 'buffer',
      timeout: LIVE_CONSTANTS.TMUX_TIMEOUT_MS,
      maxBuffer: LIVE_CONSTANTS.TMUX_MAX_BUFFER_BYTES,
      killSignal: LIVE_CONSTANTS.TMUX_KILL_SIGNAL,
      windowsHide: true,
      shell: false,
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
          || /maxBuffer/i.test(String(error.code))) reject(new CollectorError('TMUX_OUTPUT_LIMIT'));
        else if (error.killed || error.code === 'ETIMEDOUT') reject(new CollectorError('TMUX_TIMEOUT'));
        else reject(new CollectorError('TMUX_NONZERO_EXIT'));
        return;
      }
      if (stderr?.length > 0) reject(new CollectorError('TMUX_STDERR'));
      else resolve(stdout);
    });
  });
}

export async function collectTmuxSnapshot(dependencies = {}) {
  const uid = dependencies.uid ?? process.getuid();
  const binary = await findTmuxBinary({
    statFile: dependencies.statFile,
    accessFile: dependencies.accessFile,
    uid,
  });
  const socketPath = defaultSocketPath(uid);
  await validateSocket(socketPath, { lstatFile: dependencies.lstatFile, uid });
  const stdout = await runTmux(dependencies.execFile ?? nodeExecFile, binary, socketPath);
  return buildSnapshot(parseTmuxBuffer(stdout, socketPath), (dependencies.now ?? (() => new Date()))().toISOString());
}
