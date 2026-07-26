import { collectTmuxSnapshot } from './tmux-collector.mjs';
import { CollectorError } from './tmux-frame.mjs';

export async function runCollectorCli({
  collect = collectTmuxSnapshot,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const snapshot = await collect();
    stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof CollectorError ? error.code : 'TMUX_NONZERO_EXIT';
    stderr.write(`${code}\n`);
    return 1;
  }
}
