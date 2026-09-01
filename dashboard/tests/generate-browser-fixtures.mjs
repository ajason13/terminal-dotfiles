#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { LIVE_CONSTANTS } from '../src/live-constants.mjs';

function session(index, overrides = {}) {
  return {
    id: `tmux-${index.toString(16).padStart(32, '0')}`,
    displayName: `Synthetic session ${index} · pane ${index}`,
    status: 'unknown',
    permissionState: 'unknown',
    confidence: 'none',
    provenance: 'tmux_command_candidate',
    ...overrides,
  };
}

export function browserFixturePayloads(observedAt = new Date().toISOString()) {
  if (new Date(observedAt).toISOString() !== observedAt) {
    throw new TypeError('observedAt must use exact Date.toISOString() form');
  }
  const sessions = [
    session(1, {
      displayName: 'Synthetic active · pane 1',
      status: 'active',
      confidence: 'medium',
      provenance: 'tmux_title_spinner',
    }),
    session(2, {
      displayName: 'Synthetic permission · pane 2',
      status: 'waiting_for_permission',
      permissionState: 'requested',
      confidence: 'low',
      provenance: 'tmux_title_action_required',
    }),
    session(3, { displayName: 'Synthetic unknown alpha · pane 3' }),
    session(4, {
      displayName: 'Synthetic unknown beta with a long responsive name · pane 4',
    }),
    session(5, { displayName: 'Synthetic unknown gamma · pane 5' }),
    session(6, { displayName: 'Synthetic unknown overflow · pane 6' }),
  ].map((item) => ({
    ...item,
    activity: { kind: 'observed', at: observedAt },
  }));
  return Object.freeze({
    valid: {
      schemaVersion: 2,
      source: { kind: 'tmux_oneshot', collectorVersion: LIVE_CONSTANTS.COLLECTOR_VERSION },
      observedAt,
      sessions,
    },
    invalid: {
      schemaVersion: 1,
      generatedAt: observedAt,
      sessions: [],
    },
  });
}

export async function generateBrowserFixtures(outputDirectory, observedAt = new Date().toISOString()) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    throw new TypeError('outputDirectory is required');
  }
  const payloads = browserFixturePayloads(observedAt);
  const validPath = resolve(outputDirectory, 'live-valid.json');
  const invalidPath = resolve(outputDirectory, 'live-invalid.json');
  await Promise.all([
    writeFile(validPath, `${JSON.stringify(payloads.valid, null, 2)}\n`, { flag: 'wx' }),
    writeFile(invalidPath, `${JSON.stringify(payloads.invalid, null, 2)}\n`, { flag: 'wx' }),
  ]);
  return Object.freeze({ validPath, invalidPath, observedAt });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputDirectory = process.argv[2];
  try {
    const result = await generateBrowserFixtures(outputDirectory);
    process.stdout.write(`${result.validPath}\n${result.invalidPath}\n`);
  } catch {
    process.stderr.write('BROWSER_FIXTURE_GENERATION_FAILED\n');
    process.exitCode = 1;
  }
}
