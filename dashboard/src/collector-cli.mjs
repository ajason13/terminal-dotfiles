import { collectTmuxSnapshot } from './tmux-collector.mjs';
import { CollectorError } from './tmux-frame.mjs';

export async function runCollectorCli({
  collect = collectTmuxSnapshot,
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    if (argv.some((arg) => arg !== '--hook-evidence') || argv.length > 1) throw new CollectorError('TMUX_FIELD_INVALID');
    const snapshot = argv.includes('--hook-evidence') ? await collect({ hookEvidence: true }) : await collect();
    stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof CollectorError ? error.code : 'TMUX_NONZERO_EXIT';
    stderr.write(`${code}\n`);
    return 1;
  }
}
