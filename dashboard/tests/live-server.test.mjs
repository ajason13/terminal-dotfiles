import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveRequestHandler } from '../src/live-server.mjs';
import { LIVE_CONSTANTS, LIVE_REQUEST_FORBIDDEN } from '../src/live-constants.mjs';
import { createLiveServer, parseServeArgs } from '../serve-live.mjs';

const TOKEN = 'a'.repeat(32);
const PORT = 4173;

const OK_SNAPSHOT = {
  schemaVersion: 2,
  source: { kind: 'tmux_oneshot', collectorVersion: '1.0.0' },
  observedAt: '2026-08-03T00:00:00.000Z',
  sessions: [],
};

const makeHandler = (overrides = {}) =>
  createLiveRequestHandler({
    token: TOKEN,
    port: PORT,
    collect: async () => OK_SNAPSHOT,
    readStaticFile: async () => ({ status: 404, headers: {}, body: 'not found' }),
    ...overrides,
  });

const snapshotRequest = (overrides = {}) => ({
  method: 'GET',
  path: LIVE_CONSTANTS.LIVE_SNAPSHOT_ROUTE,
  headers: { host: `127.0.0.1:${PORT}`, 'x-live-token': TOKEN, ...overrides.headers },
  ...overrides,
});

test('snapshot endpoint returns 200 with the collector snapshot', async () => {
  const res = await makeHandler()(snapshotRequest());
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'application/json');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(res.body), OK_SNAPSHOT);
});

test('non-GET method is 405', async () => {
  const res = await makeHandler()(snapshotRequest({ method: 'POST' }));
  assert.equal(res.status, 405);
});

test('foreign Host is 403 forbidden', async () => {
  const res = await makeHandler()(snapshotRequest({ headers: { host: 'evil.example.com', 'x-live-token': TOKEN } }));
  assert.equal(res.status, 403);
  assert.deepEqual(JSON.parse(res.body), { error: LIVE_REQUEST_FORBIDDEN });
});

test('cross-site request is 403 forbidden', async () => {
  const res = await makeHandler()(snapshotRequest({ headers: { host: `127.0.0.1:${PORT}`, 'x-live-token': TOKEN, 'sec-fetch-site': 'cross-site' } }));
  assert.equal(res.status, 403);
});

test('missing or wrong token is 403 forbidden', async () => {
  const res = await makeHandler()(snapshotRequest({ headers: { host: `127.0.0.1:${PORT}`, 'x-live-token': 'wrong' } }));
  assert.equal(res.status, 403);
});

test('localhost Host is accepted', async () => {
  const res = await makeHandler()(snapshotRequest({ headers: { host: `localhost:${PORT}`, 'x-live-token': TOKEN } }));
  assert.equal(res.status, 200);
});

test('collector failure surfaces its code as 503', async () => {
  const collect = async () => { const e = new Error('TMUX_SOCKET_REJECTED'); e.name = 'CollectorError'; e.code = 'TMUX_SOCKET_REJECTED'; throw e; };
  const res = await makeHandler({ collect })(snapshotRequest());
  assert.equal(res.status, 503);
  assert.deepEqual(JSON.parse(res.body), { error: 'TMUX_SOCKET_REJECTED' });
});

test('unexpected collector error is a generic 503, not raw text', async () => {
  const collect = async () => { throw new Error('/secret/path blew up'); };
  const res = await makeHandler({ collect })(snapshotRequest());
  assert.equal(res.status, 503);
  assert.equal(res.body.includes('secret'), false);
});

import { createStaticFileReader } from '../src/live-server.mjs';
import path from 'node:path';

const ROOT = '/dash';

const makeReader = (overrides = {}) =>
  createStaticFileReader({
    root: ROOT,
    token: TOKEN,
    realpath: async (p) => p, // no symlink escape by default
    readFile: async (abs) => {
      if (abs === path.join(ROOT, 'index.html')) return Buffer.from(`<script>window.__LIVE_TOKEN__="${LIVE_CONSTANTS.LIVE_TOKEN_PLACEHOLDER}";</script>`);
      if (abs === path.join(ROOT, 'styles.css')) return Buffer.from('body{}');
      if (abs === path.join(ROOT, 'link.css')) return Buffer.from('/* symlink */');
      const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
    },
    ...overrides,
  });

test('serves index.html with the token injected', async () => {
  const res = await makeReader()('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(res.body.includes(`"${TOKEN}"`), true);
  assert.equal(res.body.includes(LIVE_CONSTANTS.LIVE_TOKEN_PLACEHOLDER), false);
  // The property name window.__LIVE_TOKEN__ must survive: the placeholder must
  // only match the value, not the property, or app.mjs reads an undefined token.
  assert.equal(res.body.includes(`window.__LIVE_TOKEN__="${TOKEN}"`), true);
});

test('serves a css file with the right content type', async () => {
  const res = await makeReader()('/styles.css');
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'text/css; charset=utf-8');
});

test('path traversal is rejected with 403', async () => {
  const res = await makeReader()('/../../etc/passwd');
  assert.equal(res.status, 403);
});

test('symlink escaping the root is rejected with 403', async () => {
  const res = await makeReader({ realpath: async () => '/etc/shadow' })('/link.css');
  assert.equal(res.status, 403);
});

test('missing file is 404', async () => {
  const res = await makeReader()('/nope.js');
  assert.equal(res.status, 404);
});

test('node_modules path is 403 forbidden, not served', async () => {
  const res = await makeReader()('/node_modules/some-pkg/index.mjs');
  assert.equal(res.status, 403);
});

test('tests/ path is 403 forbidden, not served', async () => {
  const res = await makeReader()('/tests/live-server.test.mjs');
  assert.equal(res.status, 403);
});

test('uppercase-cased excluded segment is 403 forbidden, not served (case-insensitive filesystem bypass)', async () => {
  const reader = makeReader({
    readFile: async () => { throw new Error('readFile must not be reached for an excluded segment'); },
  });
  const upper = await reader('/NODE_MODULES/x.mjs');
  assert.equal(upper.status, 403);
  const mixed = await reader('/Tests/y.mjs');
  assert.equal(mixed.status, 403);
});

test('uppercase extension on an otherwise-excluded/unknown type is 403 forbidden', async () => {
  const res = await makeReader({
    readFile: async () => { throw new Error('readFile must not be reached for an unknown extension'); },
  })('/secret.PEM');
  assert.equal(res.status, 403);
});

test('dotfile path is 403 forbidden, not served', async () => {
  const res = await makeReader()('/.env');
  assert.equal(res.status, 403);
});

test('unknown extension is 403 forbidden (no octet-stream fallback)', async () => {
  const res = await makeReader({
    readFile: async (abs) => {
      if (abs === path.join(ROOT, 'secret.pem')) return Buffer.from('should never be reached');
      const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
    },
  })('/secret.pem');
  assert.equal(res.status, 403);
});

test('index.html, styles.css, and an .mjs file still serve 200 through the allowlist', async () => {
  const reader = makeReader({
    readFile: async (abs) => {
      if (abs === path.join(ROOT, 'index.html')) return Buffer.from('<html></html>');
      if (abs === path.join(ROOT, 'styles.css')) return Buffer.from('body{}');
      if (abs === path.join(ROOT, 'src', 'app.mjs')) return Buffer.from('export const x = 1;');
      const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
    },
  });
  assert.equal((await reader('/')).status, 200);
  assert.equal((await reader('/styles.css')).status, 200);
  assert.equal((await reader('/src/app.mjs')).status, 200);
});

test('parseServeArgs reads --port and defaults otherwise', () => {
  assert.equal(parseServeArgs([]).port, LIVE_CONSTANTS.LIVE_SERVER_DEFAULT_PORT);
  assert.equal(parseServeArgs(['--port', '5001']).port, 5001);
});

test('parseServeArgs rejects a non-integer --port', () => {
  assert.throws(() => parseServeArgs(['--port', 'abc']));
});

test('parseServeArgs rejects a negative --port', () => {
  assert.throws(() => parseServeArgs(['--port', '-1']));
});

test('parseServeArgs rejects a --port above 65535', () => {
  assert.throws(() => parseServeArgs(['--port', '70000']));
});

test('live server round-trips /live/snapshot over a real loopback socket', async () => {
  const { server, port, token } = await createLiveServer({
    port: 0,
    host: '127.0.0.1',
    token: TOKEN,
    collect: async () => OK_SNAPSHOT,
    root: '/dash',
    readFile: async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; },
    realpath: async (p) => p,
  });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/live/snapshot`, { headers: { 'x-live-token': token } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), OK_SNAPSHOT);

    const bad = await fetch(`http://127.0.0.1:${port}/live/snapshot`);
    assert.equal(bad.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
