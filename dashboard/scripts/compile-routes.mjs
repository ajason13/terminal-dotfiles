import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compileRoutes } from './lib/route-compiler.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const GENERATED_TARGETS = Object.freeze([
  Object.freeze({ path: resolve(ROOT, 'src/generated/route-geometry.mjs'), key: 'mjs' }),
  Object.freeze({ path: resolve(ROOT, 'generated/route-motion.css'), key: 'css' }),
]);

export function sourceDigest(entries) {
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(entry.path, 'utf8');
    hash.update('\0');
    hash.update(entry.contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function validateRouteFileNames(trackOrder, routeNames) {
  const wanted = trackOrder.map((id) => `${id}.route.mjs`);
  if (routeNames.length !== wanted.length || routeNames.some((name) => !wanted.includes(name))) {
    throw new TypeError('routes directory contains a missing or extra route source');
  }
}

async function loadDefault(path) {
  const module = await import(`${pathToFileURL(path).href}?route-compile=${Date.now()}-${Math.random()}`);
  if (!('default' in module) || Object.keys(module).length !== 1) {
    throw new TypeError(`${relative(ROOT, path)} must export only default`);
  }
  return module.default;
}

export async function prepareCompilation(io = fs) {
  const configPath = resolve(ROOT, 'routes/route-config.mjs');
  const configBytes = await io.readFile(configPath);
  const config = await loadDefault(configPath);
  const routeNames = (await io.readdir(resolve(ROOT, 'routes')))
    .filter((name) => name.endsWith('.route.mjs'))
    .sort();
  validateRouteFileNames(config.trackOrder, routeNames);
  const entries = [{ path: 'routes/route-config.mjs', contents: configBytes }];
  const routes = [];
  for (const id of config.trackOrder) {
    const path = resolve(ROOT, `routes/${id}.route.mjs`);
    const contents = await io.readFile(path);
    entries.push({ path: `routes/${id}.route.mjs`, contents });
    routes.push(await loadDefault(path));
  }
  return compileRoutes(config, routes, sourceDigest(entries));
}

export async function checkArtifacts(outputs, {
  io = fs,
  targets = GENERATED_TARGETS,
  write = (value) => process.stdout.write(value),
  writeError = (value) => process.stderr.write(value),
} = {}) {
  const drift = [];
  for (const target of targets) {
    try {
      if ((await io.readFile(target.path, 'utf8')) !== outputs[target.key]) {
        drift.push(relative(ROOT, target.path));
      }
    } catch (error) {
      if (error.code === 'ENOENT') drift.push(relative(ROOT, target.path));
      else throw error;
    }
  }
  if (drift.length) {
    for (const path of drift) writeError(`${path}\n`);
    return 1;
  }
  write('routes: generated artifacts are current\n');
  return 0;
}

export async function writeArtifacts(outputs, {
  io = fs,
  targets = GENERATED_TARGETS,
  pid = process.pid,
  write = (value) => process.stdout.write(value),
} = {}) {
  let changed = false;
  for (const target of targets) {
    try {
      if ((await io.readFile(target.path, 'utf8')) !== outputs[target.key]) changed = true;
    } catch (error) {
      if (error.code === 'ENOENT') changed = true;
      else throw error;
    }
  }
  if (!changed) {
    write('routes: up to date\n');
    return 0;
  }
  const staged = targets.map((target) => ({
    ...target,
    temporary: `${target.path}.${pid}.tmp`,
    backup: `${target.path}.${pid}.bak`,
    hadOriginal: false,
    installed: false,
  }));
  try {
    for (const target of staged) {
      await io.writeFile(target.temporary, outputs[target.key], { flag: 'wx' });
    }
    try {
      for (const target of staged) {
        try {
          await io.rename(target.path, target.backup);
          target.hadOriginal = true;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    } catch (backupError) {
      for (const target of [...staged].reverse()) {
        if (target.hadOriginal) await io.rename(target.backup, target.path);
      }
      throw backupError;
    }
    try {
      for (const target of staged) {
        await io.rename(target.temporary, target.path);
        target.installed = true;
      }
    } catch (installError) {
      for (const target of [...staged].reverse()) {
        if (target.installed) await io.rm(target.path, { force: true });
        if (target.hadOriginal) await io.rename(target.backup, target.path);
      }
      throw installError;
    }
    for (const target of staged) {
      if (target.hadOriginal) await io.rm(target.backup, { force: true });
    }
  } finally {
    for (const target of staged) {
      await io.rm(target.temporary, { force: true }).catch(() => {});
      await io.rm(target.backup, { force: true }).catch(() => {});
    }
  }
  write('routes: wrote 2 artifacts\n');
  return 0;
}

export async function run(argv = process.argv.slice(2), options = {}) {
  if (argv.length !== 1 || !['--write', '--check'].includes(argv[0])) return 64;
  try {
    const outputs = await prepareCompilation(options.io);
    return argv[0] === '--check'
      ? await checkArtifacts(outputs, options)
      : await writeArtifacts(outputs, options);
  } catch (error) {
    (options.writeError ?? ((value) => process.stderr.write(value)))(`routes: ${error.message}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run();
}
