// scripts/e2e-fixture-server.py feeds the import E2E flow its Safari download.
// The single-threaded server it replaced stalled the download at 0% whenever
// Safari held a connection open without sending a request (run 39645448024,
// mezzanine-import: "Review Import" never showed because the picker only had a
// .download placeholder). These tests start the real script and reproduce that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hasPython = spawnSync('python3', ['--version']).status === 0;

const freePort = () => new Promise(resolve => {
  const s = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

const get = (host, port) => new Promise((resolve, reject) => {
  const req = http.get({ host, port, path: '/mezzanine-import.json', timeout: 3000 }, res => {
    let body = '';
    res.on('data', c => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('timeout', () => req.destroy(new Error(`no response from ${host}:${port} within 3 s`)));
  req.on('error', reject);
});

async function startServer(t) {
  const port = await freePort();
  const proc = spawn('python3', ['-I', join(root, 'scripts/e2e-fixture-server.py'), String(port), join(root, '.maestro/fixtures')], { stdio: 'ignore' });
  t.after(() => proc.kill());
  for (let i = 0; i < 50; i++) {
    try { await get('127.0.0.1', port); return port; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('fixture server did not start');
}

test('serves the fixture as an attachment', { skip: !hasPython && 'python3 not installed' }, async t => {
  const port = await startServer(t);
  const res = await get('127.0.0.1', port);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-disposition'], /^attachment; filename="mezzanine-import\.json"$/);
  assert.ok(JSON.parse(res.body));
});

test('a connection that sends nothing does not block the download', { skip: !hasPython && 'python3 not installed' }, async t => {
  const port = await startServer(t);
  const idle = net.connect(port, '127.0.0.1');
  t.after(() => idle.destroy());
  await new Promise(r => idle.on('connect', r));
  const res = await get('127.0.0.1', port);
  assert.equal(res.status, 200);
});

test('answers on ::1 too, where Safari tries first', { skip: !hasPython && 'python3 not installed' }, async t => {
  const ipv6 = spawnSync('python3', ['-I', '-c', 'import socket; socket.socket(socket.AF_INET6).bind(("::1", 0))']).status === 0;
  if (!ipv6) return t.skip('no IPv6 on this host');
  const port = await startServer(t);
  assert.equal((await get('::1', port)).status, 200);
});

test('maestro-e2e.yml runs this server, not an inline single-threaded one', () => {
  const wf = readFileSync(join(root, '.github/workflows/maestro-e2e.yml'), 'utf8');
  assert.match(wf, /python3 scripts\/e2e-fixture-server\.py 8931 \.maestro\/fixtures/);
  assert.doesNotMatch(wf, /socketserver\.TCPServer|http\.server\.HTTPServer\(/);
});
