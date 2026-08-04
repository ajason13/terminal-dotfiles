import { expect, test } from '@playwright/test';

// Mirrors app.mjs's real (non-placeholder) token gate: this is injected before any
// page script runs, then locked read-only so the page's own inline placeholder-setting
// script (sloppy-mode `window.__LIVE_TOKEN__ = "__LIVE_TOKEN__"`) silently no-ops instead
// of overwriting it. Never a real server: every request below is intercepted by page.route.
const MOCK_LIVE_TOKEN = 'playwright-mock-live-token';

async function injectLiveToken(page) {
  await page.addInitScript((token) => {
    Object.defineProperty(window, '__LIVE_TOKEN__', {
      value: token,
      writable: false,
      configurable: false,
    });
  }, MOCK_LIVE_TOKEN);
}

// A known-valid schema-v2 session tuple (status/activity/permissionState/confidence/provenance)
// taken from the validCombination allowlist in src/import-snapshot.mjs.
function mockSnapshot(observedAt) {
  return {
    schemaVersion: 2,
    source: { kind: 'tmux_oneshot', collectorVersion: '1.0.0' },
    observedAt,
    sessions: [{
      id: 'tmux-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      displayName: 'Live Mock Session',
      status: 'active',
      permissionState: 'unknown',
      confidence: 'medium',
      provenance: 'tmux_title_spinner',
      activity: { kind: 'observed', at: observedAt },
    }],
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');
});

test('Go live switches to auto-refresh and renders a mocked live session', async ({ page }) => {
  await injectLiveToken(page);
  const requestsSeen = [];
  await page.route('**/live/snapshot', async (route, request) => {
    requestsSeen.push(request.headers()['x-live-token']);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSnapshot(new Date().toISOString())),
    });
  });

  await page.reload();
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');

  const goLiveButton = page.locator('#go-live');
  await expect(goLiveButton).toBeEnabled();
  await goLiveButton.click();

  await expect(page.locator('#source-label')).toHaveText('Live · auto-refresh');
  await expect(page.locator('.session-car[data-session-id="tmux-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"]'))
    .toHaveCount(1);
  expect(requestsSeen[0]).toBe(MOCK_LIVE_TOKEN);
});

test('repeated 503s from the live endpoint fall back to fixtures with a rejection notice', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await injectLiveToken(page);
  let calls = 0;
  await page.route('**/live/snapshot', async (route) => {
    calls += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'TMUX_NONZERO_EXIT' }),
    });
  });

  await page.reload();
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');

  const goLiveButton = page.locator('#go-live');
  await expect(goLiveButton).toBeEnabled();
  await goLiveButton.click();
  await expect(page.locator('#source-label')).toHaveText('Live · auto-refresh');

  // Poller polls immediately, then every LIVE_POLL_INTERVAL_MS (5s); three consecutive
  // failures (LIVE_MAX_CONSECUTIVE_FAILURES) trip the fixtures fallback, so this waits
  // out two real intervals rather than faking timers.
  await expect(page.locator('#source-label')).toHaveText('Fixtures · Night sector', {
    timeout: 30_000,
  });
  await expect(page.locator('#source-notice')).toHaveText('Live snapshot rejected; showing fixtures.');
  expect(calls).toBeGreaterThanOrEqual(3);
});
