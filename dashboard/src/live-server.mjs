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
