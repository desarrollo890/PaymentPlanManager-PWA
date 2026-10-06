import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function createProbeServer(clientId = '') {
  if (clientId && !/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Invalid public web Client ID');
  const routes = new Map([
    ['/', ['text/html; charset=utf-8', new URL('./index.html', import.meta.url)]],
    ['/main.mjs', ['text/javascript; charset=utf-8', new URL('./main.mjs', import.meta.url)]],
    ['/drive-probe.mjs', ['text/javascript; charset=utf-8', new URL('./drive-probe.mjs', import.meta.url)]],
    ['/architecture/crypto-proof.mjs', ['text/javascript; charset=utf-8', new URL('../architecture/crypto-proof.mjs', import.meta.url)]],
  ]);
  return createServer((request, response) => {
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.url === '/config.json') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ clientId: clientId || null })); return;
    }
    const route = routes.get(request.url);
    if (!route) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': route[0] }); response.end(readFileSync(route[1]));
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.GOOGLE_PROBE_PORT || 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Google probe port');
  const configured = JSON.parse(readFileSync(new URL('../../config/google-oauth.json', import.meta.url), 'utf8'));
  const server = createProbeServer(process.env.GOOGLE_WEB_CLIENT_ID || configured.web.clientId);
  server.on('error', () => { console.error('No se pudo iniciar la prueba local. Comprueba que el puerto esté libre.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Prueba Google F0: http://localhost:${port}/ (solo datos sintéticos)`));
}
