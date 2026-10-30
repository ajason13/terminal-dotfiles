import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HOOK_COLLECTOR_VERSION, HOOK_SCHEMA_VERSION, HOOK_TTL_MS } from './observation-contract.mjs';
export { HOOK_COLLECTOR_VERSION, HOOK_SCHEMA_VERSION };

const HELPER = fileURLToPath(new URL('../../bin/tmux-agent-observation', import.meta.url));

// Called only by explicitly enabled local collection. No pane content, legacy
// markers, session stores or remote file paths are passed to this helper.
export function readHookObservations(records, { execute = execFile } = {}) {
  if (!records.length) return Promise.resolve({});
  const args = ['read', '--socket', records[0].socket_path,
    '--server-start', records[0].start_time,
    ...records.flatMap((record) => ['--pane', record.pane_id])];
  return new Promise((resolve) => {
    execute(HELPER, args, {
      timeout: 5000, maxBuffer: 65536, encoding: 'utf8', shell: false,
      // Inherit HOME/PATH for the private store and Python interpreter. The
      // helper itself uses fixed tmux paths and a closed subprocess environment.
    }, (error, stdout) => {
      if (error) { resolve({}); return; }
      try {
        const value = JSON.parse(stdout);
        resolve(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      } catch { resolve({}); }
    });
  });
}


// Validate the helper boundary again before building an export. No arbitrary
// helper strings/identifiers are copied into a snapshot.
export function hookClassification(value, observedAtMs) {
  if (!value || !Number.isSafeInteger(value.at) || value.at > observedAtMs
    || observedAtMs - value.at >= HOOK_TTL_MS || value.at <= 0) return null;
  const meanings = {
    permission: ['waiting_for_permission', 'requested', 'tmux_hook_permission'],
    question: ['waiting_for_input', 'unknown', 'tmux_hook_question'],
    active: ['active', 'unknown', 'tmux_hook_active'],
    ended: ['turn_ended', 'unknown', 'tmux_hook_turn_ended'],
  };
  if (!Object.hasOwn(meanings, value.state)) return null;
  const [status, permissionState, provenance] = meanings[value.state];
  return {
    status, permissionState, provenance, confidence: 'medium',
    evidence: { kind: 'hook', eventAt: new Date(value.at).toISOString(),
      expiresAt: new Date(value.at + HOOK_TTL_MS).toISOString() },
  };
}
