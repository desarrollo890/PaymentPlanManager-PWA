import { argon2, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { argon2id } from 'hash-wasm';
import { derivePbkdf2, passwordParameters } from './crypto-proof.mjs';

const password = 'Synthetic benchmark password only', salt = new Uint8Array(16).fill(7);
const argon = promisify(argon2);
async function measure(label, fn, parameters) {
  await fn();
  const samples = [];
  for (let i = 0; i < 3; i++) { const start = performance.now(); await fn(); samples.push(Math.round((performance.now() - start) * 100) / 100); }
  return { label, parameters, samplesMs: samples, medianMs: [...samples].sort((a, b) => a - b)[1] };
}
const profiles = [{ memoryKiB: 19456, passes: 2, parallelism: 1 }, { memoryKiB: 65536, passes: 3, parallelism: 1 }];
const results = [];
for (const p of profiles) {
  const native = () => argon('argon2id', { message: password, nonce: salt, memory: p.memoryKiB, passes: p.passes, parallelism: p.parallelism, tagLength: 32 });
  const wasm = () => argon2id({ password, salt, memorySize: p.memoryKiB, iterations: p.passes, parallelism: p.parallelism, hashLength: 32, outputType: 'binary' });
  assert.deepEqual(new Uint8Array(await native()), await wasm(), 'WASM and native Argon2 must derive the same key');
  results.push(await measure('Node native Argon2id', native, p));
  results.push(await measure('Node WASM Argon2id', wasm, p));
}
results.push(await measure('Node WebCrypto PBKDF2', () => derivePbkdf2(password, { ...passwordParameters(), saltBase64: Buffer.from(salt).toString('base64') }), { iterations: 600000 }));

const require = createRequire(import.meta.url), { chromium } = require('playwright');
const routes = new Map([
  ['/', { type: 'text/html', data: '<!doctype html><title>Synthetic F0 crypto checks</title>' }],
  ['/crypto.mjs', { type: 'text/javascript', data: readFileSync(new URL('./crypto-proof.mjs', import.meta.url)) }],
  ['/hash-wasm.mjs', { type: 'text/javascript', data: readFileSync(new URL('./node_modules/hash-wasm/dist/index.esm.js', import.meta.url)) }]
]);
const server = createServer((request, response) => {
  const route = routes.get(request.url);
  response.writeHead(route ? 200 : 404, { 'Content-Type': route?.type ?? 'text/plain' }); response.end(route?.data ?? 'Not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const web = await page.evaluate(async ({ profiles, password }) => {
    const { argon2id } = await import('/hash-wasm.mjs');
    const { derivePbkdf2, importDataKey, passwordParameters, seal, open } = await import('/crypto.mjs');
    const measure = async (label, fn, parameters) => {
      await fn(); const samples = [];
      for (let i = 0; i < 3; i++) { const start = performance.now(); await fn(); samples.push(Math.round((performance.now() - start) * 100) / 100); }
      return { label, parameters, samplesMs: samples, medianMs: [...samples].sort((a, b) => a - b)[1] };
    };
    const results = [], salt = new Uint8Array(16).fill(7);
    for (const p of profiles) results.push(await measure('Chromium WASM Argon2id', () => argon2id({ password, salt,
      memorySize: p.memoryKiB, iterations: p.passes, parallelism: p.parallelism, hashLength: 32, outputType: 'binary' }), p));
    const kdf = passwordParameters();
    results.push(await measure('Chromium WebCrypto PBKDF2', () => derivePbkdf2(password, kdf), { iterations: kdf.iterations }));
    const nativeCompatible = await argon2id({ password, salt, memorySize: 19456, iterations: 2, parallelism: 1, hashLength: 32, outputType: 'binary' });
    const key = await importDataKey(nativeCompatible), h = { vaultId: crypto.randomUUID(), keyId: crypto.randomUUID(), blockId: crypto.randomUUID(), purpose: 'batch' };
    const data = new Uint8Array(200000).fill(9), encrypted = await seal(key, data, h), decrypted = await open(key, encrypted, h);
    if (decrypted.length !== data.length || decrypted.some(b => b !== 9)) throw new Error('Large browser block did not roundtrip');
    let rejectsTampering = false;
    try { await open(key, { ...encrypted, purpose: 'snapshot' }, { ...h, purpose: 'snapshot' }); } catch { rejectsTampering = true; }
    if (!rejectsTampering) throw new Error('Browser accepted altered authenticated metadata');
    const raw = crypto.getRandomValues(new Uint8Array(32)), kek = await derivePbkdf2(password, kdf);
    const wrap = { ...h, blockId: crypto.randomUUID(), purpose: 'dataKeyWrap', kdf };
    const wrapped = await seal(kek, raw, wrap);
    if ((await open(kek, wrapped, wrap)).some((b, i) => b !== raw[i])) throw new Error('Browser key wrapping failed');
    return { results, interoperableKey: Array.from(nativeCompatible), checks: ['large encrypted block', 'authenticated metadata rejection', 'password key wrapping'],
      secureContext: isSecureContext, crossOriginIsolated };
  }, { profiles, password });
  assert.deepEqual(errors, []);
  assert.deepEqual(new Uint8Array(await argon('argon2id', { message: password, nonce: salt, memory: 19456, passes: 2, parallelism: 1, tagLength: 32 })), new Uint8Array(web.interoperableKey));
  const report = { synthetic: true, runtime: process.version, chromium: browser.version(), measuredAt: new Date().toISOString(),
    node: results, browser: web.results, browserChecks: web.checks, secureContext: web.secureContext,
    crossOriginIsolated: web.crossOriginIsolated, android: 'not-tested', note: 'Desktop feasibility measurements; not mobile acceptance or cryptographic audit.' };
  const folder = fileURLToPath(new URL('../../artifacts/architecture/', import.meta.url));
  mkdirSync(folder, { recursive: true }); writeFileSync(`${folder}/crypto-benchmark.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log('PASS: native/WASM/browser interoperability, WebCrypto roundtrip and authenticated key wrapping.');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
