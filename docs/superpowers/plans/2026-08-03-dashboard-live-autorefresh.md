# Dashboard Live Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Decisions you need from me

1. **Server port default = `4173`.** Recommendation: keep it. Cost if wrong: collides with another local dev server you run, forcing `--port`. Trivial to change.
2. **One real-socket integration test** (binds `127.0.0.1:0`, ephemeral) for `serve-live.mjs`, alongside otherwise-pure handler tests. Recommendation: include it - it's the only thing that proves token injection + binding actually round-trip. Cost if wrong: if this environment blocks `listen()`, that one test fails and we drop it to pure handler tests. Say if you'd rather stay 100% mocked.
3. **Cross-site defense relies on Host + token; `Sec-Fetch-Site` is a bonus check only.** Recommendation: keep it advisory (reject only explicit `cross-site`/`same-site`, allow absent). Cost if wrong: a browser that omits the header still works, leaning on Host+token. Say if you want it mandatory.

## Assumptions I have not verified

- `normalizeImportedSnapshot(collectorOutput, now)` accepts the collector's live output unchanged. High confidence (the exporter writes exactly `collectTmuxSnapshot()`'s object and that is what import already validates), but I have not executed collector-output → normalize in one process.
- This environment permits a Node process to `listen()` on `127.0.0.1:0` in a `node --test` run (needed for Decision 2's integration test).
- Chromium/Firefox send `Sec-Fetch-Site` on `127.0.0.1` fetches; Safari may not. The design treats absence as allowed, so this only affects the strength of the bonus check, not function.
- The existing `dashboard/tests/*.test.mjs` suite passes on `main` before we start (verified once: 159/159 at baseline).

**Goal:** Add an opt-in `127.0.0.1` server (`serve-live.mjs`) that runs the existing hardened collector on `GET /live/snapshot`, and a browser poll loop that auto-refreshes every 5s, validating each payload through the same `normalizeImportedSnapshot` path as manual import.

**Architecture:** Reopen only transport. New `src/live-server.mjs` is a pure request handler (security gate + snapshot endpoint + static serving) with injected `collect`/static-reader, wrapped by a thin `serve-live.mjs` that binds the socket and injects a per-process token. New `src/live-poller.mjs` is a pure timer/failure/visibility loop. `source-controller.mjs` gains a `live_polling` mode that wires the poller to fetch → `normalizeImportedSnapshot` → render.

**Tech Stack:** Node ESM (`node:http`, `node:crypto`, `node:fs`), `node:test` + `node:assert/strict`, no new dependencies. Browser side is framework-free ES modules.

## Global Constraints

- No new npm dependencies. Node built-ins only. `"type": "module"`.
- Every live payload rendered in the browser MUST pass `normalizeImportedSnapshot` unchanged; malformed payloads keep the last-good view, never crash.
- The collector's data contract is unchanged: hashed `tmux-[0-9a-f]{32}` IDs, closed status enum, no pane content/titles/timestamps. Do NOT modify `tmux-collector.mjs`, `tmux-frame.mjs`, `tmux-classifier.mjs`, or `import-snapshot.mjs` logic.
- Server binds `127.0.0.1` only - never `0.0.0.0`. No auto-start from any other component. No disk writes, no persistence, no logging of session payloads.
- Fixtures remain the browser startup default; the live control is inert unless `window.__LIVE_TOKEN__` is present.
- Tests never contact the real default tmux server - always inject a fake `collect`/`execFile`/`fetch`.
- New numeric/string constants live in `LIVE_CONSTANTS` (`src/live-constants.mjs`); adding members requires updating the exact-shape assertion at `tests/live-adapter.test.mjs` (the `assert.deepEqual(LIVE_CONSTANTS, {...})`).
- Test runner: `node --test tests/*.test.mjs` (run from `dashboard/`). New test files in `dashboard/tests/` are auto-globbed.
- No em dashes in code/comments/docs (use `-`).

---

## File Structure

**New:**
- `dashboard/src/live-server.mjs` - `createLiveRequestHandler(deps)` returning a pure `async (request) => response` handler (security gate, `/live/snapshot`, static serving, token injection). No socket binding here.
- `dashboard/serve-live.mjs` - CLI + `createLiveServer(deps)` that binds `node:http` to `127.0.0.1`, generates the token, and adapts Node req/res to the pure handler.
- `dashboard/src/live-poller.mjs` - `createLivePoller(deps)`: timer loop, consecutive-failure counting, visibility pause. No fetch/normalize itself; calls an injected `pollOnce`.
- `dashboard/tests/live-server.test.mjs`, `dashboard/tests/live-poller.test.mjs`.

**Modified:**
- `dashboard/src/live-constants.mjs` - new members + `LIVE_REQUEST_FORBIDDEN`.
- `dashboard/src/source-controller.mjs` - `live_polling` mode, `goLive()`/`stopLive()`, poller wiring.
- `dashboard/src/app.mjs` - read `window.__LIVE_TOKEN__`, mount `#go-live`, pass `fetch` + token.
- `dashboard/index.html` - `__LIVE_TOKEN__` placeholder script + `#go-live` button.
- `dashboard/tests/dom-fake.mjs` - add `#go-live` to the `dashboardRoot` id list.
- `dashboard/tests/live-adapter.test.mjs` - update the `LIVE_CONSTANTS` deepEqual assertion.
- `dashboard/README.md` - opt-in live section.

All commands below run from `dashboard/` unless noted.

---

### Task 1: Constants

**Files:**
- Modify: `dashboard/src/live-constants.mjs`
- Modify: `dashboard/tests/live-adapter.test.mjs` (the `LIVE_CONSTANTS` deepEqual assertion)

**Interfaces:**
- Produces: `LIVE_CONSTANTS.LIVE_POLL_INTERVAL_MS = 5000`, `LIVE_CONSTANTS.LIVE_MAX_CONSECUTIVE_FAILURES = 3`, `LIVE_CONSTANTS.LIVE_SERVER_DEFAULT_PORT = 4173`, `LIVE_CONSTANTS.LIVE_SNAPSHOT_ROUTE = '/live/snapshot'`, `LIVE_CONSTANTS.LIVE_TOKEN_PLACEHOLDER = '__LIVE_TOKEN__'`, `LIVE_CONSTANTS.LIVE_TOKEN_HEADER = 'x-live-token'`; new export `LIVE_REQUEST_FORBIDDEN = 'LIVE_REQUEST_FORBIDDEN'`.

- [ ] **Step 1: Add the constants**

In `dashboard/src/live-constants.mjs`, add these members to the `LIVE_CONSTANTS` object (keep it frozen, place after `STALE_LABEL_TICK_MS`):

```js
  LIVE_POLL_INTERVAL_MS: 5000,
  LIVE_MAX_CONSECUTIVE_FAILURES: 3,
  LIVE_SERVER_DEFAULT_PORT: 4173,
  LIVE_SNAPSHOT_ROUTE: '/live/snapshot',
  LIVE_TOKEN_PLACEHOLDER: '__LIVE_TOKEN__',
  LIVE_TOKEN_HEADER: 'x-live-token',
```

Add a standalone export at the end of the file (mirrors how `COLLECTOR_ERROR_CODES` is a top-level export):

```js
export const LIVE_REQUEST_FORBIDDEN = 'LIVE_REQUEST_FORBIDDEN';
```

- [ ] **Step 2: Update the exact-shape assertion**

In `dashboard/tests/live-adapter.test.mjs`, find the `assert.deepEqual(LIVE_CONSTANTS, { ... })` block and add the six new key/value pairs to the expected object (same values as Step 1). This test fails until updated because it asserts the object exactly.

- [ ] **Step 3: Run tests**

Run: `node --test tests/*.test.mjs`
Expected: PASS (159 tests), confirming the deepEqual now matches.

- [ ] **Step 4: Commit**

```bash
git add src/live-constants.mjs tests/live-adapter.test.mjs
git commit -m "feat(dashboard): add live-server + poller constants"
```

---

### Task 2: Live-server security gate + snapshot endpoint

**Files:**
- Create: `dashboard/src/live-server.mjs`
- Test: `dashboard/tests/live-server.test.mjs`

**Interfaces:**
- Consumes: `collectTmuxSnapshot` (from `tmux-collector.mjs`) shape; `CollectorError.code`; `LIVE_CONSTANTS`, `LIVE_REQUEST_FORBIDDEN`.
- Produces: `createLiveRequestHandler({ token, collect, readStaticFile, port })` → `async (request) => response`, where
  - `request = { method: string, path: string, headers: { host?, 'sec-fetch-site'?, 'x-live-token'? } }` (headers lower-cased)
  - `response = { status: number, headers: object, body: string }`
  - This task implements: method gate (405), Host gate (403), cross-site gate (403), and `GET /live/snapshot` (200 JSON / 503 collector-code / 403 bad-token). Static serving is added in Task 3 (calls to `readStaticFile` land there).

- [ ] **Step 1: Write the failing test**

Create `dashboard/tests/live-server.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live-server.test.mjs`
Expected: FAIL - `createLiveRequestHandler` is not exported (module missing).

- [ ] **Step 3: Write minimal implementation**

Create `dashboard/src/live-server.mjs`:

```js
import { LIVE_CONSTANTS, LIVE_REQUEST_FORBIDDEN, COLLECTOR_ERROR_CODES } from './live-constants.mjs';

const forbidden = () => ({
  status: 403,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify({ error: LIVE_REQUEST_FORBIDDEN }),
});

// Host must be loopback with our port. This is the DNS-rebinding defense: a page
// that resolves its own domain to 127.0.0.1 still sends a foreign Host header.
const hostAllowed = (host, port) =>
  host === `127.0.0.1:${port}` || host === `localhost:${port}`;

// Reject only explicit cross-origin. Absent header (some browsers on localhost)
// falls back to Host + token, which is the real gate.
const crossSiteBlocked = (site) => site === 'cross-site' || site === 'same-site';

const collectorErrorCode = (error) =>
  error && error.name === 'CollectorError' && COLLECTOR_ERROR_CODES.includes(error.code)
    ? error.code
    : 'TMUX_NONZERO_EXIT';

export function createLiveRequestHandler({ token, port, collect, readStaticFile }) {
  return async function handle(request) {
    const { method, path, headers = {} } = request;

    if (!hostAllowed(headers.host, port)) return forbidden();
    if (crossSiteBlocked(headers['sec-fetch-site'])) return forbidden();

    if (path === LIVE_CONSTANTS.LIVE_SNAPSHOT_ROUTE) {
      if (method !== 'GET') {
        return { status: 405, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Allow: 'GET' }, body: JSON.stringify({ error: LIVE_REQUEST_FORBIDDEN }) };
      }
      if (headers[LIVE_CONSTANTS.LIVE_TOKEN_HEADER] !== token) return forbidden();
      try {
        const snapshot = await collect();
        return { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(snapshot) };
      } catch (error) {
        return { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: collectorErrorCode(error) }) };
      }
    }

    if (method !== 'GET') {
      return { status: 405, headers: { Allow: 'GET' }, body: '' };
    }
    return readStaticFile(path, { token });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live-server.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/live-server.mjs tests/live-server.test.mjs
git commit -m "feat(dashboard): live-server security gate + snapshot endpoint"
```

---

### Task 3: Live-server static serving + token injection

**Files:**
- Modify: `dashboard/src/live-server.mjs`
- Modify: `dashboard/tests/live-server.test.mjs`

**Interfaces:**
- Produces: `createStaticFileReader({ root, readFile, realpath, token })` → `async (path) => response`. Serves files under `root`, rejecting path traversal and symlink escape; on `index.html` (path `/` or `/index.html`) replaces every `LIVE_CONSTANTS.LIVE_TOKEN_PLACEHOLDER` with the real token. `createLiveRequestHandler` accepts this as `readStaticFile`.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/tests/live-server.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live-server.test.mjs`
Expected: FAIL - `createStaticFileReader` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `dashboard/src/live-server.mjs` (top import + new export):

```js
import path from 'node:path';
```

```js
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const staticForbidden = { status: 403, headers: {}, body: 'forbidden' };

export function createStaticFileReader({ root, token, readFile, realpath }) {
  const rootResolved = path.resolve(root);
  return async function readStaticFile(requestPath) {
    const rel = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const abs = path.resolve(rootResolved, rel);
    // Containment check before any fs touch (blocks ../ traversal).
    if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) return staticForbidden;

    let real;
    try {
      const buffer = await readFile(abs);
      // Resolve symlinks and re-check containment (blocks symlink escape).
      real = await realpath(abs);
      if (real !== rootResolved && !real.startsWith(rootResolved + path.sep)) return staticForbidden;
      const ext = path.extname(abs);
      const type = CONTENT_TYPES[ext] || 'application/octet-stream';
      if (ext === '.html') {
        const html = buffer.toString('utf8').split(LIVE_CONSTANTS.LIVE_TOKEN_PLACEHOLDER).join(token);
        return { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' }, body: html };
      }
      return { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' }, body: buffer.toString('utf8') };
    } catch {
      return { status: 404, headers: {}, body: 'not found' };
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live-server.test.mjs`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/live-server.mjs tests/live-server.test.mjs
git commit -m "feat(dashboard): live-server static serving with token injection"
```

---

### Task 4: serve-live.mjs (http bind + CLI)

**Files:**
- Create: `dashboard/serve-live.mjs`
- Test: extend `dashboard/tests/live-server.test.mjs`

**Interfaces:**
- Consumes: `createLiveRequestHandler`, `createStaticFileReader`, `collectTmuxSnapshot`, `LIVE_CONSTANTS`.
- Produces: `createLiveServer({ port, host, collect, root, token, createServer, readFile, realpath })` → `{ server, port, token }` (an unstarted-then-listening `http.Server`); adapts Node `req`/`res` to the pure handler. `parseServeArgs(argv)` → `{ port }`. `runServeCli(...)` bootstraps with real deps.

- [ ] **Step 1: Write the failing integration test**

Append to `dashboard/tests/live-server.test.mjs`:

```js
import { createLiveServer, parseServeArgs } from '../serve-live.mjs';

test('parseServeArgs reads --port and defaults otherwise', () => {
  assert.equal(parseServeArgs([]).port, LIVE_CONSTANTS.LIVE_SERVER_DEFAULT_PORT);
  assert.equal(parseServeArgs(['--port', '5001']).port, 5001);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live-server.test.mjs`
Expected: FAIL - `../serve-live.mjs` has no such exports.

- [ ] **Step 3: Write minimal implementation**

Create `dashboard/serve-live.mjs`:

```js
#!/usr/bin/env node
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile as fsReadFile, realpath as fsRealpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLiveRequestHandler, createStaticFileReader } from './src/live-server.mjs';
import { collectTmuxSnapshot } from './src/tmux-collector.mjs';
import { LIVE_CONSTANTS } from './src/live-constants.mjs';

export function parseServeArgs(argv) {
  let port = LIVE_CONSTANTS.LIVE_SERVER_DEFAULT_PORT;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port') {
      const next = Number(argv[i + 1]);
      if (!Number.isInteger(next) || next < 0 || next > 65535) throw new Error('SERVE_PORT_INVALID');
      port = next;
      i += 1;
    }
  }
  return { port };
}

// Normalize a Node request into the pure handler's shape.
const toRequest = (req) => ({
  method: req.method,
  path: (req.url || '/').split('?')[0],
  headers: req.headers,
});

export async function createLiveServer({
  port,
  host = '127.0.0.1',
  collect = collectTmuxSnapshot,
  root = path.dirname(fileURLToPath(import.meta.url)),
  token = randomBytes(16).toString('hex'),
  createServer = http.createServer,
  readFile = fsReadFile,
  realpath = fsRealpath,
}) {
  const readStaticFile = createStaticFileReader({ root, token, readFile, realpath });
  const handle = createLiveRequestHandler({ token, port, collect, readStaticFile });

  const server = createServer((req, res) => {
    void (async () => {
      const response = await handle(toRequest(req));
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    })();
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const actualPort = server.address().port;
  return { server, port: actualPort, token };
}

export async function runServeCli({ argv = process.argv.slice(2), stdout = process.stdout } = {}) {
  const { port } = parseServeArgs(argv);
  const { port: actualPort } = await createLiveServer({ port });
  stdout.write(`dashboard live server on http://127.0.0.1:${actualPort} (Ctrl-C to stop)\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runServeCli();
}
```

Note: `createLiveServer` passes the bind `port` into the handler for the Host check. When `port: 0` (ephemeral) the test sets `host` explicitly and the Host header the browser/`fetch` sends is `127.0.0.1:<actualPort>`; the handler is built with the *requested* port. For the ephemeral test, build the handler against the actual port: after `listen`, the test uses `actualPort` in the URL, so set the handler's port to the bound port. Adjust: create the handler AFTER listen using `server.address().port`. Rewrite the body so the handler is constructed post-listen:

```js
  const server = createServer((req, res) => { void handleRef(req, res); });
  await new Promise((resolve) => server.listen(port, host, resolve));
  const actualPort = server.address().port;
  const readStaticFile = createStaticFileReader({ root, token, readFile, realpath });
  const handle = createLiveRequestHandler({ token, port: actualPort, collect, readStaticFile });
  handleRef = async (req, res) => {
    const response = await handle(toRequest(req));
    res.writeHead(response.status, response.headers);
    res.end(response.body);
  };
```

Declare `let handleRef = async (req, res) => { res.writeHead(503); res.end(); };` before `createServer` so requests arriving in the microtask gap fail closed.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live-server.test.mjs`
Expected: PASS (15 tests). If `listen()` is blocked in this environment (Decision 2), remove the round-trip test and keep `parseServeArgs`; report the drop.

- [ ] **Step 5: Commit**

```bash
git add serve-live.mjs tests/live-server.test.mjs
git commit -m "feat(dashboard): serve-live http server binding 127.0.0.1"
```

---

### Task 5: live-poller (timer / failure / visibility loop)

**Files:**
- Create: `dashboard/src/live-poller.mjs`
- Test: `dashboard/tests/live-poller.test.mjs`

**Interfaces:**
- Produces: `createLivePoller({ pollOnce, onResult, onFailure, onExhausted, intervalMs, maxFailures, setIntervalFn, clearIntervalFn, visibility })` → `{ start(), stop(), isRunning() }`.
  - `pollOnce: async () => normalizedSnapshot` (throws on fetch/validate failure).
  - On success: reset failure count, call `onResult(snapshot)`.
  - On throw: increment count, call `onFailure(count)`; when count reaches `maxFailures`, call `onExhausted()` and stop.
  - `visibility = { isHidden(): boolean, subscribe(fn): () => void }` - when hidden, ticks are skipped (no poll, no failure count); a visibility change to visible triggers an immediate tick.
  - `start()` runs one immediate tick then sets the interval; `stop()` clears interval + visibility subscription.

- [ ] **Step 1: Write the failing test**

Create `dashboard/tests/live-poller.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePoller } from '../src/live-poller.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));

const harness = (overrides = {}) => {
  const intervals = [];
  const cleared = [];
  let hidden = false;
  const subscribers = [];
  const events = { results: [], failures: [], exhausted: 0 };
  const poller = createLivePoller({
    pollOnce: overrides.pollOnce ?? (async () => ({ ok: true })),
    onResult: (s) => events.results.push(s),
    onFailure: (n) => events.failures.push(n),
    onExhausted: () => { events.exhausted += 1; },
    intervalMs: 5000,
    maxFailures: 3,
    setIntervalFn: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    clearIntervalFn: (id) => cleared.push(id),
    visibility: {
      isHidden: () => hidden,
      subscribe: (fn) => { subscribers.push(fn); return () => {}; },
    },
  });
  return {
    poller, events, intervals, cleared,
    setHidden: (v) => { hidden = v; },
    fireVisibility: async () => { for (const fn of subscribers) fn(); await settle(); },
    tick: async () => { await intervals[0].fn(); await settle(); },
  };
};

test('start does an immediate poll and schedules the interval', async () => {
  const h = harness();
  await h.poller.start();
  await settle();
  assert.equal(h.events.results.length, 1);
  assert.equal(h.intervals[0].delay, 5000);
});

test('a failing tick counts up and keeps polling', async () => {
  const h = harness({ pollOnce: async () => { throw new Error('boom'); } });
  await h.poller.start();
  await settle();
  await h.tick();
  assert.deepEqual(h.events.failures, [1, 2]);
  assert.equal(h.events.exhausted, 0);
});

test('reaching maxFailures fires onExhausted and stops', async () => {
  const h = harness({ pollOnce: async () => { throw new Error('boom'); } });
  await h.poller.start();
  await settle();      // failure 1
  await h.tick();      // failure 2
  await h.tick();      // failure 3 -> exhausted
  assert.equal(h.events.exhausted, 1);
  assert.equal(h.cleared.length, 1);
  assert.equal(h.poller.isRunning(), false);
});

test('a success resets the failure counter', async () => {
  let calls = 0;
  const h = harness({ pollOnce: async () => { calls += 1; if (calls === 1) throw new Error('boom'); return { ok: true }; } });
  await h.poller.start();  // fail -> count 1
  await settle();
  await h.tick();          // success -> reset
  await h.tick();          // fail -> count 1 again, not 2
  assert.deepEqual(h.events.failures, [1, 1]);
});

test('hidden tab skips polling; becoming visible triggers a tick', async () => {
  const h = harness();
  h.setHidden(true);
  await h.poller.start();  // hidden: immediate tick skipped
  await settle();
  assert.equal(h.events.results.length, 0);
  h.setHidden(false);
  await h.fireVisibility();
  assert.equal(h.events.results.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live-poller.test.mjs`
Expected: FAIL - `createLivePoller` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `dashboard/src/live-poller.mjs`:

```js
export function createLivePoller({
  pollOnce,
  onResult,
  onFailure,
  onExhausted,
  intervalMs,
  maxFailures,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  visibility,
}) {
  let timer = null;
  let unsubscribe = null;
  let failures = 0;
  let running = false;

  async function tick() {
    if (!running) return;
    if (visibility && visibility.isHidden()) return; // paused; no poll, no failure
    try {
      const snapshot = await pollOnce();
      failures = 0;
      onResult(snapshot);
    } catch {
      failures += 1;
      onFailure(failures);
      if (failures >= maxFailures) {
        stop();
        onExhausted();
      }
    }
  }

  function start() {
    if (running) return Promise.resolve();
    running = true;
    if (visibility) {
      unsubscribe = visibility.subscribe(() => { if (!visibility.isHidden()) void tick(); });
    }
    timer = setIntervalFn(() => { void tick(); }, intervalMs);
    return tick();
  }

  function stop() {
    running = false;
    if (timer !== null) { clearIntervalFn(timer); timer = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  return { start, stop, isRunning: () => running };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live-poller.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/live-poller.mjs tests/live-poller.test.mjs
git commit -m "feat(dashboard): live-poller timer/failure/visibility loop"
```

---

### Task 6: source-controller live_polling mode

**Files:**
- Modify: `dashboard/src/source-controller.mjs`
- Modify: `dashboard/tests/live-adapter.test.mjs` (add source-controller live-polling tests near the existing controller tests)

**Interfaces:**
- Consumes: `createLivePoller`; `normalizeImportedSnapshot`; new injected deps `fetchSnapshot`, `token`, `visibility`.
- Produces: on the frozen return object, new methods `goLive()` and `stopLive()`; new `mode` value `'live_polling'`. `goLive()` builds a poller whose `pollOnce` does `fetchSnapshot()` → `normalizeImportedSnapshot(json, now())` → returns it; `onResult` renders + relabels `Live · auto-refresh`; `onExhausted` calls `commitFixtures('rejected_fixtures', true)`.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/tests/live-adapter.test.mjs` (reuse the existing `liveSnapshot()` builder and the controller test scaffolding around line 660):

```js
test('goLive polls, validates, and renders live snapshots', async () => {
  const rendered = [];
  const intervals = [];
  let hidden = false;
  const controller = createSourceController({
    fileInput: new FakeElement(), resetButton: new FakeElement(), importRegion: new FakeElement(),
    sourceLabel: new FakeElement(), sourceAge: new FakeElement(), sourceNotice: new FakeElement(),
    readFixtures: async () => liveSnapshot(),
    render: (snapshot) => { rendered.push(snapshot); return {}; },
    readFile: async () => normalizeImportedSnapshot(liveSnapshot(), Date.now()),
    fetchSnapshot: async () => ({ ok: true, json: async () => liveSnapshot() }),
    token: 'tok',
    now: () => Date.parse('2026-08-03T00:00:00.000Z'),
    setIntervalFn: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    clearIntervalFn: () => {},
    visibility: { isHidden: () => hidden, subscribe: () => () => {} },
    windowRef: { addEventListener: () => {}, removeEventListener: () => {} },
  });
  await controller.start();
  await controller.goLive();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.mode, 'live_polling');
  assert.ok(rendered.length >= 1);
});
```

Add a second test: `fetchSnapshot` returns an invalid body (`json: async () => ({ bad: true })`); after `LIVE_CONSTANTS.LIVE_MAX_CONSECUTIVE_FAILURES` ticks, assert `controller.mode === 'rejected_fixtures'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live-adapter.test.mjs`
Expected: FAIL - `goLive` is not a function / `createSourceController` ignores the new deps.

- [ ] **Step 3: Write minimal implementation**

In `dashboard/src/source-controller.mjs`:

1. Import the poller and normalizer at the top:

```js
import { createLivePoller } from './live-poller.mjs';
import { normalizeImportedSnapshot } from './import-snapshot.mjs';
import { LIVE_CONSTANTS } from './live-constants.mjs';
```

2. Accept new deps in the factory signature (defaults keep existing callers working):

```js
  fetchSnapshot = null,
  token = null,
  visibility = null,
```

3. Add a `poller` handle alongside `ageTimer`, and clear it in `clearAgeTimer`/`destroy`/`beginTransition`:

```js
  let poller = null;
  const stopPoller = () => { if (poller) { poller.stop(); poller = null; } };
```

Call `stopPoller()` wherever `clearAgeTimer()` is called (transition start, reset, destroy).

4. Add `goLive`/`stopLive` and include them in the frozen return:

```js
  async function goLive() {
    if (!fetchSnapshot || !token) return false;
    const transition = beginTransition();
    mode = 'live_polling';
    setLabel('Live · auto-refresh');
    poller = createLivePoller({
      pollOnce: async () => {
        const res = await fetchSnapshot();
        if (!res || !res.ok) throw new Error('LIVE_FETCH_FAILED');
        return normalizeImportedSnapshot(await res.json(), now());
      },
      onResult: (snapshot) => { if (isCurrent(transition)) { renderSnapshot(snapshot); updateAge(snapshot.observedAt); } },
      onFailure: () => { if (isCurrent(transition)) markStale(); },
      onExhausted: () => { if (isCurrent(transition)) commitFixtures('rejected_fixtures', true); },
      intervalMs: LIVE_CONSTANTS.LIVE_POLL_INTERVAL_MS,
      maxFailures: LIVE_CONSTANTS.LIVE_MAX_CONSECUTIVE_FAILURES,
      setIntervalFn, clearIntervalFn,
      visibility,
    });
    await poller.start();
    return true;
  }

  function stopLive() { stopPoller(); reset(); }
```

Reuse the existing render/label/age helpers (the ones `selectFile` uses at `:96-102`); name `renderSnapshot`, `setLabel`, `updateAge`, `markStale` to match whatever the file already calls them (align to the existing internal names during implementation - do not invent new render paths). Add `goLive, stopLive` to the returned frozen object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live-adapter.test.mjs`
Expected: PASS (existing controller tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/source-controller.mjs tests/live-adapter.test.mjs
git commit -m "feat(dashboard): source-controller live_polling mode"
```

---

### Task 7: Mount the "Go live" control (app + html + dom-fake)

**Files:**
- Modify: `dashboard/index.html`
- Modify: `dashboard/src/app.mjs`
- Modify: `dashboard/tests/dom-fake.mjs`
- Test: `dashboard/tests/live-adapter.test.mjs` (a boot-wiring test) or the existing app/renderer-lifecycle suite

**Interfaces:**
- Consumes: `window.__LIVE_TOKEN__`; the `#go-live` element; `createSourceController` new deps.
- Produces: when `window.__LIVE_TOKEN__` is a non-empty string, `startDashboard` passes `fetchSnapshot`, `token`, `visibility` into `createSourceController` and wires the `#go-live` button `click` → `goLive()`. When absent, the button stays disabled and no live deps are passed (pure mode unchanged).

- [ ] **Step 1: Write the failing test**

Add a test that boots `startDashboard(fakeDocument, fakeWindow)` with `fakeWindow.__LIVE_TOKEN__ = 'tok'` and a `#go-live` element present, then asserts the button is enabled and that clicking it does not throw. Use the existing `dashboardRoot()` DOM fake plus a `#go-live` `FakeElement`. Mirror the boot pattern used by the existing app/renderer-lifecycle tests. Assert: with token absent, `#go-live` element has `disabled === true`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/*.test.mjs`
Expected: FAIL - `#go-live` missing from `exactlyOne`/`dashboardRoot`, or `startDashboard` doesn't read the token.

- [ ] **Step 3: Write minimal implementation**

1. `dashboard/index.html` - add the token placeholder script directly above the module entry at `:291`:

```html
<script>window.__LIVE_TOKEN__ = "__LIVE_TOKEN__";</script>
```

Add the button inside `#source-controls` (`:23-29`):

```html
<button id="go-live" type="button" disabled>Go live (auto-refresh)</button>
```

2. `dashboard/tests/dom-fake.mjs` - append `'go-live'` to the id array in `dashboardRoot` (around `:147-157`) so `exactlyOne` resolves it.

3. `dashboard/src/app.mjs` - in `startDashboard`, after resolving DOM refs:

```js
const liveToken = typeof windowRef.__LIVE_TOKEN__ === 'string' && windowRef.__LIVE_TOKEN__ && windowRef.__LIVE_TOKEN__ !== '__LIVE_TOKEN__' ? windowRef.__LIVE_TOKEN__ : null;
const goLiveButton = exactlyOne(documentRef, '#go-live');
```

Pass live deps into `createSourceController(...)` only when `liveToken` is set:

```js
  ...(liveToken ? {
    token: liveToken,
    fetchSnapshot: () => windowRef.fetch(LIVE_CONSTANTS.LIVE_SNAPSHOT_ROUTE, { headers: { [LIVE_CONSTANTS.LIVE_TOKEN_HEADER]: liveToken } }),
    visibility: {
      isHidden: () => documentRef.hidden === true,
      subscribe: (fn) => { documentRef.addEventListener('visibilitychange', fn); return () => documentRef.removeEventListener('visibilitychange', fn); },
    },
  } : {}),
```

After `await sourceController.start();`, wire the button when live is available:

```js
if (liveToken) {
  goLiveButton.disabled = false;
  goLiveButton.addEventListener('click', () => { void sourceController.goLive(); });
}
```

Import `LIVE_CONSTANTS` in `app.mjs` if not already imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add index.html src/app.mjs tests/dom-fake.mjs tests/live-adapter.test.mjs
git commit -m "feat(dashboard): mount opt-in Go-live control gated on token"
```

---

### Task 8: README + Playwright mocked live test

**Files:**
- Modify: `dashboard/README.md`
- Create: `dashboard/tests/browser/live-autorefresh.spec.mjs` (or extend an existing Playwright spec)

**Interfaces:**
- Consumes: the running app served with an injected `__LIVE_TOKEN__` and a **mocked** `/live/snapshot` (Playwright route interception). No real tmux.

- [ ] **Step 1: Write the Playwright test**

Add a Playwright spec that loads the dashboard, injects `window.__LIVE_TOKEN__` (via `page.addInitScript`), intercepts `**/live/snapshot` with `page.route(...)` to return a valid schema-v2 body, clicks `#go-live`, and asserts the source label reads `Live · auto-refresh` and a session from the mocked payload renders. Add a second route handler returning HTTP 503 three times and assert the UI falls back to the fixtures/rejected label. Follow the existing spec structure under `dashboard/tests/browser/` and `dashboard/playwright.config.mjs`.

- [ ] **Step 2: Run browser tests**

Run: `npm run test:browser`
Expected: PASS (new spec + existing specs). If Playwright browsers are not installed in this environment, run `npx playwright install --with-deps chromium` first; if that is blocked, report and rely on the unit-level poller/controller coverage.

- [ ] **Step 3: Write the README section**

Add to `dashboard/README.md`, in a clearly fenced block after the one-shot export section:

```markdown
## Live auto-refresh (opt-in)

`node serve-live.mjs` starts a server bound to 127.0.0.1 that serves the
dashboard and one read-only endpoint, `GET /live/snapshot`, which runs the same
one-shot collector on each request. Open the printed URL, click "Go live", and
the dashboard polls every 5 seconds.

This mode deliberately reverses the no-server / no-polling transport boundary
the rest of this dashboard holds to. It is opt-in and off by default: nothing
starts it automatically, and the export-and-import workflow above remains the
default. Every fetched payload passes the same validation as an imported file
(hashed IDs, closed status enum, no pane content, size and age bounds), so the
data guarantees are unchanged - only the transport is new.

Hardening: loopback-only bind, a Host-header allowlist (DNS-rebinding defense),
cross-site request rejection, and a per-process token required on the endpoint.
The server writes nothing to disk and stops on Ctrl-C.
```

- [ ] **Step 4: Run the full unit suite once more**

Run: `node --test tests/*.test.mjs`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add README.md tests/browser/
git commit -m "docs(dashboard): document opt-in live auto-refresh + browser test"
```

---

## Self-Review

**Spec coverage:** loopback server (Tasks 2-4), poll loop with 5s cadence (Task 5), reuse of collector + `normalizeImportedSnapshot` (Tasks 2, 6), Host/cross-site/token hardening (Task 2), token injection (Task 3), fixtures-default + opt-in control (Task 7), failure/stale/N-fallback + visibility pause (Tasks 5-6), injected-fake tests never hitting real tmux (all test tasks), README reversal note (Task 8). All spec sections map to a task.

**Placeholder scan:** No TBD/TODO; every code step carries real code. Task 6 Step 3 says "align to the existing internal names" - this is a real instruction (match the file's current render/label helper names), not a placeholder, because those names must be read from the file at implementation time; the behavior and call sites are fully specified.

**Type consistency:** `createLiveRequestHandler({token,port,collect,readStaticFile})` and `createStaticFileReader({root,token,readFile,realpath})` are consistent across Tasks 2-4. `createLivePoller` deps match between Task 5 (definition) and Task 6 (use). `LIVE_CONSTANTS` member names identical across Tasks 1, 2, 5, 7. `fetchSnapshot`/`token`/`visibility` names identical across Tasks 6 and 7.
