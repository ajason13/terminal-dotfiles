import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access, lstat, open, realpath, rename, unlink,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';

import { COLLECTOR_ERROR_CODES } from './live-constants.mjs';
import { collectTmuxSnapshot } from './tmux-collector.mjs';
import { CollectorError } from './tmux-frame.mjs';

export const SNAPSHOT_DESTINATION_INVALID = 'SNAPSHOT_DESTINATION_INVALID';
export const SNAPSHOT_EXPORT_FAILED = 'SNAPSHOT_EXPORT_FAILED';

const TEMP_ATTEMPTS = 8;
const TEMP_MODE = 0o600;
const STICKY_BIT = 0o1000;
const TEMP_OPEN_FLAGS = fsConstants.O_CREAT
  | fsConstants.O_EXCL
  | fsConstants.O_WRONLY
  | fsConstants.O_NOFOLLOW;
const ALLOWED_COLLECTOR_CODES = new Set(COLLECTOR_ERROR_CODES);
const STRUCTURAL_PATH_ERROR_CODES = new Set([
  'ENOENT', 'ENOTDIR', 'ELOOP', 'ENAMETOOLONG',
]);

class DestinationError extends Error {}
class SnapshotExportError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function destinationInvalid() {
  throw new DestinationError(SNAPSHOT_DESTINATION_INVALID);
}

function rethrowParentPathError(error) {
  if (STRUCTURAL_PATH_ERROR_CODES.has(error?.code)) destinationInvalid();
  throw error;
}

function validPath(destination) {
  if (typeof destination !== 'string'
    || destination.includes('\0')
    || destination.endsWith('/')
    || !isAbsolute(destination)) destinationInvalid();
  const name = basename(destination);
  if (name === '.' || name === '..' || name.length === 0) destinationInvalid();
  return name;
}

function requireSafeDirectory(info, uid) {
  if (!info.isDirectory() || (info.uid !== 0 && info.uid !== uid)) destinationInvalid();
  if ((info.mode & 0o022) !== 0 && (info.mode & STICKY_BIT) === 0) {
    destinationInvalid();
  }
}

function requireSafeDestination(info, uid) {
  if (!info.isFile() || info.uid !== uid) destinationInvalid();
}

async function inspectDestination(path, uid, lstatFile) {
  try {
    requireSafeDestination(await lstatFile(path), uid);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    if (error instanceof DestinationError) throw error;
    throw error;
  }
}

function requireSafeTemporary(info, uid) {
  if (!info.isFile()
    || info.uid !== uid
    || info.nlink !== 1
    || (info.mode & 0o7777) !== TEMP_MODE) throw new Error(SNAPSHOT_EXPORT_FAILED);
}

function primaryErrorCode(error) {
  if (error instanceof DestinationError) return SNAPSHOT_DESTINATION_INVALID;
  if (error instanceof SnapshotExportError) return error.code;
  if (error instanceof CollectorError && ALLOWED_COLLECTOR_CODES.has(error.code)) return error.code;
  return SNAPSHOT_EXPORT_FAILED;
}

function defaultDependencies() {
  return {
    accessFile: access,
    collect: collectTmuxSnapshot,
    lstatFile: lstat,
    openFile: open,
    randomBytes: nodeRandomBytes,
    realpathFile: realpath,
    renameFile: rename,
    unlinkFile: unlink,
    uid: process.getuid(),
  };
}

async function resolveDestination(destination, dependencies) {
  const name = validPath(destination);
  const requestedParent = dirname(destination);
  let resolvedParent;
  try {
    resolvedParent = await dependencies.realpathFile(requestedParent);
  } catch (error) {
    rethrowParentPathError(error);
  }

  let parentInfo;
  try {
    parentInfo = await dependencies.lstatFile(resolvedParent);
  } catch (error) {
    rethrowParentPathError(error);
  }
  requireSafeDirectory(parentInfo, dependencies.uid);
  await dependencies.accessFile(resolvedParent, fsConstants.W_OK | fsConstants.X_OK);

  const resolvedDestination = join(resolvedParent, name);
  await inspectDestination(resolvedDestination, dependencies.uid, dependencies.lstatFile);
  return { name, resolvedDestination, resolvedParent };
}

async function createTemporary({ name, resolvedParent }, dependencies) {
  for (let attempt = 0; attempt < TEMP_ATTEMPTS; attempt += 1) {
    const token = dependencies.randomBytes(16).toString('hex');
    if (!/^[0-9a-f]{32}$/.test(token)) throw new Error(SNAPSHOT_EXPORT_FAILED);
    const temporaryName = `.${name}.${token}.tmp`;
    if (temporaryName === name) throw new Error(SNAPSHOT_EXPORT_FAILED);
    const temporaryPath = join(resolvedParent, temporaryName);
    try {
      return { handle: await dependencies.openFile(temporaryPath, TEMP_OPEN_FLAGS, TEMP_MODE), temporaryPath };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(SNAPSHOT_EXPORT_FAILED);
}

export async function exportTmuxSnapshot(destination, injected = {}) {
  const dependencies = { ...defaultDependencies(), ...injected };
  let handle;
  let handleOpen = false;
  let temporaryPath;
  let primaryError;

  try {
    const resolved = await resolveDestination(destination, dependencies);
    ({ handle, temporaryPath } = await createTemporary(resolved, dependencies));
    handleOpen = true;

    await handle.chmod(TEMP_MODE);
    requireSafeTemporary(await handle.stat(), dependencies.uid);

    const snapshot = await dependencies.collect();
    const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
    await handle.writeFile(payload, { encoding: 'utf8' });
    await handle.chmod(TEMP_MODE);
    requireSafeTemporary(await handle.stat(), dependencies.uid);
    await handle.sync();
    await handle.close();
    handleOpen = false;

    await inspectDestination(
      resolved.resolvedDestination,
      dependencies.uid,
      dependencies.lstatFile,
    );
    await dependencies.renameFile(temporaryPath, resolved.resolvedDestination);
    temporaryPath = undefined;
    return;
  } catch (error) {
    primaryError = error;
  }

  let cleanupFailed = false;
  if (handleOpen) {
    try {
      await handle.close();
      handleOpen = false;
    } catch {
      cleanupFailed = true;
    }
  }
  if (temporaryPath !== undefined) {
    try {
      await dependencies.unlinkFile(temporaryPath);
      temporaryPath = undefined;
    } catch {
      cleanupFailed = true;
    }
  }

  throw new SnapshotExportError(
    cleanupFailed ? SNAPSHOT_EXPORT_FAILED : primaryErrorCode(primaryError),
  );
}

export async function runSnapshotExportCli({
  argv = process.argv.slice(2),
  stderr = process.stderr,
  exportSnapshot = exportTmuxSnapshot,
} = {}) {
  try {
    if (argv.length !== 1) destinationInvalid();
    await exportSnapshot(argv[0]);
    return 0;
  } catch (error) {
    stderr.write(`${primaryErrorCode(error)}\n`);
    return 1;
  }
}
