import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('syntax gate rejects a broken second module', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'syntax-gate-'));
  try {
    const first = join(directory, 'first.mjs');
    const second = join(directory, 'second.mjs');
    const checker = fileURLToPath(new URL('../scripts/check-syntax.mjs', import.meta.url));
    await writeFile(first, 'export const valid = true;');
    await writeFile(second, 'export const = ;');
    const bad = spawnSync(process.execPath, [checker, first, second], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /second\.mjs/);
    await writeFile(second, 'export const alsoValid = true;');
    assert.equal(spawnSync(process.execPath, [checker, first, second]).status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
