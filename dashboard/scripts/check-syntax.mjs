import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
function modules(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'test-results', 'playwright-report'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? modules(path) : entry.name.endsWith('.mjs') ? [path] : [];
  });
}
const files = process.argv.length > 2 ? process.argv.slice(2).map((file) => resolve(file)) : modules(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
