import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = '/PaymentPlanManager-PWA/';
const dist = fileURLToPath(new URL('../apps/pwa/dist/', import.meta.url));
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
assert(html.includes('lang="es-MX"'));
assert(!html.includes('/src/'), 'Build must not reference development source');
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
assert(assets.length >= 3, 'Expected JS, CSS and favicon');
for (const url of assets) {
  assert(url.startsWith(base), `Asset missing Pages base: ${url}`);
  assert(existsSync(path.join(dist, url.slice(base.length))), `Missing asset: ${url}`);
}
assert(!html.includes('accounts.google.com'), 'F1 must not load Google authorization');
console.log(`PASS: ${assets.length} static assets use the Pages project path.`);
