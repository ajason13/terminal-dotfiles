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
  // Fail closed: requests that land before the real handler is wired below get a 503.
  let handleRef = async (req, res) => { res.writeHead(503); res.end(); };

  const server = createServer((req, res) => { void handleRef(req, res); });

  await new Promise((resolve) => server.listen(port, host, resolve));
  // Build the handler against the actual bound port (not the requested one) so the
  // Host check matches what the client sends, which matters for ephemeral port 0.
  const actualPort = server.address().port;
  const readStaticFile = createStaticFileReader({ root, token, readFile, realpath });
  const handle = createLiveRequestHandler({ token, port: actualPort, collect, readStaticFile });
  handleRef = async (req, res) => {
    const response = await handle(toRequest(req));
    res.writeHead(response.status, response.headers);
    res.end(response.body);
  };

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
