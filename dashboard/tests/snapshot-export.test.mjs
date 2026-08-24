import assert from 'node:assert/strict';
import { constants as fsConstants, readFileSync } from 'node:fs';
import {
  chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { normalizeImportedSnapshot } from '../src/import-snapshot.mjs';
import { LIVE_CONSTANTS } from '../src/live-constants.mjs';
import {
  SNAPSHOT_DESTINATION_INVALID,
  SNAPSHOT_EXPORT_FAILED,
  exportTmuxSnapshot,
  runSnapshotExportCli,
} from '../src/snapshot-export.mjs';
import { CollectorError } from '../src/tmux-frame.mjs';

const OBSERVED = '2026-07-31T18:00:00.000Z';

function snapshot(label = 'Synthetic') {
  return {
    schemaVersion: 2,
    source: { kind: 'tmux_oneshot', collectorVersion: LIVE_CONSTANTS.COLLECTOR_VERSION },
    observedAt: OBSERVED,
    sessions: [{
      id: 'tmux-0123456789abcdef0123456789abcdef',
      displayName: `${label} · pane 0`,
      status: 'active',
      permissionState: 'unknown',
      confidence: 'medium',
      provenance: 'tmux_title_spinner',
      activity: { kind: 'observed', at: OBSERVED },
    }],
  };
}

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'night-pass-export-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function artifacts(directory, destinationName = 'snapshot.json') {
  return (await readdir(directory)).filter((name) => name !== destinationName);
}

function capture() {
  let value = '';
  return {
    stream: { write(chunk) { value += chunk; } },
    value: () => value,
  };
}

test('one export writes one validated LF-terminated 0600 snapshot and collects exactly once', async () => {
  await withDirectory(async (directory) => {
    const destination = join(directory, 'snapshot.json');
    let calls = 0;
    await exportTmuxSnapshot(destination, {
      collect: async () => { calls += 1; return snapshot(); },
    });

    const payload = await readFile(destination, 'utf8');
    const info = await lstat(destination);
    assert.equal(calls, 1);
    assert.equal(payload, `${JSON.stringify(snapshot(), null, 2)}\n`);
    assert.equal(payload.endsWith('\n'), true);
    assert.equal(info.mode & 0o7777, 0o600);
    assert.doesNotThrow(() => normalizeImportedSnapshot(JSON.parse(payload), Date.parse(OBSERVED)));
    assert.deepEqual(await artifacts(directory), []);
  });
});

test('atomic replacement installs a complete new regular snapshot', async () => {
  await withDirectory(async (directory) => {
    const destination = join(directory, 'snapshot.json');
    await writeFile(destination, 'previous-valid-snapshot\n', { mode: 0o600 });
    await exportTmuxSnapshot(destination, { collect: async () => snapshot('Replacement') });
    assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), snapshot('Replacement'));
    assert.equal((await lstat(destination)).mode & 0o7777, 0o600);
    assert.deepEqual(await artifacts(directory), []);
  });
});

test('collector, serialization, access, open, write, chmod, stat, sync, close, and rename failures fail closed', async () => {
  const cases = [
    ['collector', () => ({ collect: async () => { throw new Error('raw collector detail'); } })],
    ['serialization', () => ({ collect: async () => { const value = {}; value.self = value; return value; } })],
    ['access', () => ({ accessFile: async () => { throw new Error('denied'); } })],
    ['open', () => ({ openFile: async () => { throw new Error('open'); } })],
    ['write', (wrap) => ({ openFile: wrap('writeFile') })],
    ['chmod', (wrap) => ({ openFile: wrap('chmod') })],
    ['stat', (wrap) => ({ openFile: wrap('stat') })],
    ['sync', (wrap) => ({ openFile: wrap('sync') })],
    ['close', (wrap) => ({ openFile: wrap('close') })],
    ['rename', () => ({ renameFile: async () => { throw new Error('rename'); } })],
  ];

  for (const [name, injected] of cases) {
    await withDirectory(async (directory) => {
      const destination = join(directory, 'snapshot.json');
      const previous = 'previous-valid-snapshot\n';
      await writeFile(destination, previous, { mode: 0o600 });
      const wrap = (failedMethod) => async (...args) => {
        const actual = await open(...args);
        let failed = false;
        return {
          chmod: async (...methodArgs) => {
            if (failedMethod === 'chmod' && !failed) { failed = true; throw new Error('chmod'); }
            return actual.chmod(...methodArgs);
          },
          stat: async (...methodArgs) => {
            if (failedMethod === 'stat' && !failed) { failed = true; throw new Error('stat'); }
            return actual.stat(...methodArgs);
          },
          writeFile: async (...methodArgs) => {
            if (failedMethod === 'writeFile' && !failed) { failed = true; throw new Error('write'); }
            return actual.writeFile(...methodArgs);
          },
          sync: async (...methodArgs) => {
            if (failedMethod === 'sync' && !failed) { failed = true; throw new Error('sync'); }
            return actual.sync(...methodArgs);
          },
          close: async () => {
            if (failedMethod === 'close' && !failed) {
              failed = true;
              await actual.close();
              throw new Error('close');
            }
            return actual.close();
          },
        };
      };

      await assert.rejects(
        exportTmuxSnapshot(destination, { collect: async () => snapshot(), ...injected(wrap) }),
        { code: SNAPSHOT_EXPORT_FAILED },
        name,
      );
      assert.equal(await readFile(destination, 'utf8'), previous, name);
      assert.deepEqual(await artifacts(directory), [], name);
    });
  }
});

test('path shape, missing parent, unsafe parent, directory, symlink, and special targets fail before collection', async () => {
  await withDirectory(async (directory) => {
    const regular = join(directory, 'regular.json');
    const directoryTarget = join(directory, 'directory-target');
    const symlinkTarget = join(directory, 'symlink-target');
    await writeFile(regular, '{}', { mode: 0o600 });
    await mkdir(directoryTarget);
    await symlink(regular, symlinkTarget);
    let calls = 0;
    const collect = async () => { calls += 1; return snapshot(); };
    const missing = join(directory, 'missing', 'snapshot.json');

    for (const destination of ['relative.json', `${directory}/`, '/tmp/.', '/tmp/..', missing,
      directoryTarget, symlinkTarget]) {
      await assert.rejects(exportTmuxSnapshot(destination, { collect }), {
        code: SNAPSHOT_DESTINATION_INVALID,
      });
    }

    const parent = await realpath(directory);
    const parentInfo = await lstat(parent);
    const specialTarget = join(parent, 'special');
    const fakeSpecial = { isFile: () => false, uid: process.getuid(), mode: fsConstants.S_IFIFO };
    await assert.rejects(exportTmuxSnapshot(specialTarget, {
      collect,
      lstatFile: async (path) => (path === parent ? parentInfo : fakeSpecial),
    }), { code: SNAPSHOT_DESTINATION_INVALID });

    const foreignDirectory = { ...parentInfo, isDirectory: () => true, uid: process.getuid() + 1 };
    await assert.rejects(exportTmuxSnapshot(join(parent, 'foreign-parent.json'), {
      collect,
      lstatFile: async () => foreignDirectory,
    }), { code: SNAPSHOT_DESTINATION_INVALID });

    const unsafeDirectory = {
      ...parentInfo,
      isDirectory: () => true,
      uid: process.getuid(),
      mode: 0o040777,
    };
    await assert.rejects(exportTmuxSnapshot(join(parent, 'unsafe-parent.json'), {
      collect,
      lstatFile: async () => unsafeDirectory,
    }), { code: SNAPSHOT_DESTINATION_INVALID });

    const stickyDirectory = { ...unsafeDirectory, mode: 0o041777 };
    await exportTmuxSnapshot(join(parent, 'sticky-parent.json'), {
      collect: async () => { calls += 1; return snapshot(); },
      lstatFile: async (path) => {
        if (path === parent) return stickyDirectory;
        return lstat(path);
      },
    });
    await rm(join(parent, 'sticky-parent.json'));
    assert.equal(calls, 1);
  });
});

test('foreign-owned regular target and final-component swap fail closed', async () => {
  await withDirectory(async (directory) => {
    const destination = join(directory, 'snapshot.json');
    const parent = await realpath(directory);
    const parentInfo = await lstat(parent);
    const regular = { isFile: () => true, uid: process.getuid(), mode: 0o100600 };
    const foreign = { ...regular, uid: process.getuid() + 1 };
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect: async () => snapshot(),
      lstatFile: async (path) => (path === parent ? parentInfo : foreign),
    }), { code: SNAPSHOT_DESTINATION_INVALID });

    let targetChecks = 0;
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect: async () => snapshot(),
      lstatFile: async (path) => {
        if (path === parent) return parentInfo;
        targetChecks += 1;
        if (targetChecks === 1) throw Object.assign(new Error('absent'), { code: 'ENOENT' });
        return { isFile: () => false, uid: process.getuid(), mode: fsConstants.S_IFLNK };
      },
    }), { code: SNAPSHOT_DESTINATION_INVALID });
    assert.deepEqual(await readdir(directory), []);
  });
});

test('parent path errors use a closed structural classification before collection', async () => {
  let collectorCalls = 0;
  const collect = async () => { collectorCalls += 1; return snapshot(); };
  const destination = '/synthetic/parent/snapshot.json';

  for (const code of ['ENOENT', 'ENOTDIR', 'ELOOP', 'ENAMETOOLONG']) {
    const structural = Object.assign(new Error('private structural detail'), { code });
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect,
      realpathFile: async () => { throw structural; },
    }), { code: SNAPSHOT_DESTINATION_INVALID });
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect,
      realpathFile: async () => '/synthetic/parent',
      lstatFile: async () => { throw structural; },
    }), { code: SNAPSHOT_DESTINATION_INVALID });
  }

  for (const code of ['EACCES', 'EPERM', 'EIO', 'UNKNOWN_FILESYSTEM_CODE']) {
    const operational = Object.assign(new Error('private operational detail'), { code });
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect,
      realpathFile: async () => { throw operational; },
    }), { code: SNAPSHOT_EXPORT_FAILED });
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect,
      realpathFile: async () => '/synthetic/parent',
      lstatFile: async () => { throw operational; },
    }), { code: SNAPSHOT_EXPORT_FAILED });
  }
  assert.equal(collectorCalls, 0);
});

test('exclusive-name collisions make exactly eight attempts and never alter the collision', async () => {
  await withDirectory(async (directory) => {
    const destination = join(directory, 'snapshot.json');
    const token = 'ab'.repeat(16);
    const collision = join(directory, `.snapshot.json.${token}.tmp`);
    await writeFile(collision, 'belongs-to-another-export', { mode: 0o600 });
    let tokenCalls = 0;
    let collectorCalls = 0;
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect: async () => { collectorCalls += 1; return snapshot(); },
      randomBytes: () => { tokenCalls += 1; return Buffer.from(token, 'hex'); },
    }), { code: SNAPSHOT_EXPORT_FAILED });
    assert.equal(tokenCalls, 8);
    assert.equal(collectorCalls, 0);
    assert.equal(await readFile(collision, 'utf8'), 'belongs-to-another-export');
  });
});

test('invalid injected token fails before collection and does not create an artifact', async () => {
  await withDirectory(async (directory) => {
    let calls = 0;
    await assert.rejects(exportTmuxSnapshot(join(directory, 'snapshot.json'), {
      collect: async () => { calls += 1; return snapshot(); },
      randomBytes: () => Buffer.from('not-sixteen-bytes'),
    }), { code: SNAPSHOT_EXPORT_FAILED });
    assert.equal(calls, 0);
    assert.deepEqual(await readdir(directory), []);
  });
});

test('concurrent commits remain complete and the last rename wins', async () => {
  await withDirectory(async (directory) => {
    const destination = join(directory, 'snapshot.json');
    let releaseFirst;
    let firstStarted;
    const firstReady = new Promise((resolve) => { firstStarted = resolve; });
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const first = exportTmuxSnapshot(destination, {
      collect: async () => { firstStarted(); await firstGate; return snapshot('First'); },
    });
    await firstReady;
    await exportTmuxSnapshot(destination, { collect: async () => snapshot('Second') });
    assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), snapshot('Second'));
    releaseFirst();
    await first;
    assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), snapshot('First'));
    assert.deepEqual(await artifacts(directory), []);
  });
});

test('collector code pass-through is allowlisted and cleanup failure overrides all primary errors', async () => {
  await withDirectory(async (directory) => {
    const destination = join(directory, 'snapshot.json');
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect: async () => { throw new CollectorError('TMUX_TIMEOUT'); },
    }), { code: 'TMUX_TIMEOUT' });
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect: async () => { throw new CollectorError('PRIVATE_UNKNOWN_CODE'); },
    }), { code: SNAPSHOT_EXPORT_FAILED });
    await assert.rejects(exportTmuxSnapshot(destination, {
      collect: async () => { throw new CollectorError('TMUX_TIMEOUT'); },
      unlinkFile: async () => { throw new Error('cleanup detail'); },
    }), { code: SNAPSHOT_EXPORT_FAILED });

    await assert.rejects(exportTmuxSnapshot(destination, {
      collect: async () => { throw new CollectorError('TMUX_TIMEOUT'); },
      openFile: async (...args) => {
        const actual = await open(...args);
        let closed = false;
        return {
          chmod: (...methodArgs) => actual.chmod(...methodArgs),
          stat: (...methodArgs) => actual.stat(...methodArgs),
          writeFile: (...methodArgs) => actual.writeFile(...methodArgs),
          sync: (...methodArgs) => actual.sync(...methodArgs),
          close: async () => {
            if (!closed) { closed = true; await actual.close(); }
            throw new Error('cleanup close detail');
          },
        };
      },
    }), { code: SNAPSHOT_EXPORT_FAILED });
  });
});

test('actual workflow destination errors remain distinct at the CLI boundary', async () => {
  const stderr = capture();
  assert.equal(await runSnapshotExportCli({
    argv: ['relative.json'],
    stderr: stderr.stream,
  }), 1);
  assert.equal(stderr.value(), `${SNAPSHOT_DESTINATION_INVALID}\n`);
});

test('CLI is silent on success and emits only one closed code on failure', async () => {
  const successError = capture();
  assert.equal(await runSnapshotExportCli({
    argv: ['/tmp/synthetic.json'],
    stderr: successError.stream,
    exportSnapshot: async () => {},
  }), 0);
  assert.equal(successError.value(), '');

  for (const [argv, error, expected] of [
    [[], null, SNAPSHOT_DESTINATION_INVALID],
    [['one', 'two'], null, SNAPSHOT_DESTINATION_INVALID],
    [['/tmp/synthetic.json'], new CollectorError('TMUX_FRAME_INVALID'), 'TMUX_FRAME_INVALID'],
    [['/tmp/synthetic.json'], new CollectorError('PRIVATE'), SNAPSHOT_EXPORT_FAILED],
    [['/tmp/synthetic.json'], new Error('/private/raw/path'), SNAPSHOT_EXPORT_FAILED],
  ]) {
    const stderr = capture();
    const code = await runSnapshotExportCli({
      argv,
      stderr: stderr.stream,
      exportSnapshot: async () => { if (error) throw error; },
    });
    assert.equal(code, 1);
    assert.equal(stderr.value(), `${expected}\n`);
  }
});

test('export source has no shell, child-process, environment destination, network, or recurring runtime API', () => {
  const exporter = readFileSync(new URL('../src/snapshot-export.mjs', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../export-tmux.mjs', import.meta.url), 'utf8');
  const source = `${exporter}\n${entry}`;
  assert.doesNotMatch(source, /child_process|execFile|spawn\(|shell\s*:|process\.env|TMUX_PANE|TMUX_TMPDIR/);
  assert.doesNotMatch(source, /fetch\(|WebSocket|http:|https:|setInterval|setTimeout|watch\(/);
});

test('serialized output contains none of the protected raw observations', async () => {
  await withDirectory(async (directory) => {
    const protectedValues = [
      'RAW_TITLE_SECRET', 'RAW_COMMAND_SECRET', '/private/tmp/tmux-501/default',
      '$99', '@88', '%77', '1785520800', '/secret/cwd', 'pid-1234',
    ];
    await exportTmuxSnapshot(join(directory, 'snapshot.json'), {
      collect: async () => snapshot('Sanitized'),
    });
    const payload = await readFile(join(directory, 'snapshot.json'), 'utf8');
    for (const value of protectedValues) assert.equal(payload.includes(value), false, value);
  });
});

test('temporary open uses exclusive no-follow write-only flags and requested 0600 mode', async () => {
  await withDirectory(async (directory) => {
    const actualOpen = open;
    let observed;
    await exportTmuxSnapshot(join(directory, 'snapshot.json'), {
      collect: async () => snapshot(),
      openFile: async (path, flags, mode) => {
        observed = { flags, mode };
        return actualOpen(path, flags, mode);
      },
    });
    assert.equal(observed.mode, 0o600);
    assert.equal(observed.flags & fsConstants.O_CREAT, fsConstants.O_CREAT);
    assert.equal(observed.flags & fsConstants.O_EXCL, fsConstants.O_EXCL);
    assert.equal(observed.flags & fsConstants.O_WRONLY, fsConstants.O_WRONLY);
    assert.equal(observed.flags & fsConstants.O_NOFOLLOW, fsConstants.O_NOFOLLOW);
  });
});
