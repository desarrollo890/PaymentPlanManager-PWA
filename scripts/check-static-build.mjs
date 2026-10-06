import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = '/PaymentPlanManager-PWA/', dist = fileURLToPath(new URL('../apps/pwa/dist/', import.meta.url));
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
assert(html.includes('lang="es-MX"')); assert(!html.includes('/src/'));
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
assert(assets.length >= 4);
for (const url of assets) { assert(url.startsWith(base)); assert(existsSync(path.join(dist, url.slice(base.length)))); }
assert(!/<script[^>]*src="https:\/\/accounts\.google\.com/.test(html), 'Google loads only after a user action');
assert(existsSync(path.join(dist, 'service-worker.js'))); const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.start_url, base); assert.equal(manifest.scope, base);
console.log(`PASS: ${assets.length} static assets, manifest and scoped offline worker.`);
