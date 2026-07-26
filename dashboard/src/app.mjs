import { FixtureSessionAdapter } from './fixture-adapter.mjs';
import { FIXTURE_SNAPSHOT } from './fixture-sessions.mjs';
import { renderDashboard, renderDashboardError } from './render-dashboard.mjs';
import { normalizeSnapshot } from './session-contract.mjs';
import { createSourceController } from './source-controller.mjs';

async function startDashboard() {
  try {
    const adapter = new FixtureSessionAdapter(FIXTURE_SNAPSHOT);
    const controller = createSourceController({
      fileInput: document.querySelector('#snapshot-file'),
      resetButton: document.querySelector('#reset-source'),
      importRegion: document.querySelector('#source-controls'),
      sourceLabel: document.querySelector('#source-label'),
      sourceAge: document.querySelector('#source-age'),
      sourceNotice: document.querySelector('#source-notice'),
      readFixtures: async () => normalizeSnapshot(await adapter.readSnapshot()),
      render: (snapshot) => renderDashboard(snapshot),
    });
    await controller.start();
  } catch (error) {
    renderDashboardError(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDashboard, { once: true });
} else {
  startDashboard();
}
