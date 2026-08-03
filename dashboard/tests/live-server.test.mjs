import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveRequestHandler } from '../src/live-server.mjs';
import { LIVE_CONSTANTS, LIVE_REQUEST_FORBIDDEN } from '../src/live-constants.mjs';

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
