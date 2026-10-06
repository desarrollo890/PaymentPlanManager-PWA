// Browser validation uses intercepted Google endpoints and synthetic tokens only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const { createProbeServer } = await import('./server.mjs');
  const server = createProbeServer('123-synthetic.apps.googleusercontent.com');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    page.setDefaultTimeout(30000);
    const errors = [], files = []; let scriptCalls = 0, driveCalls = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://accounts.google.com/gsi/client', route => {
      scriptCalls++;
      return route.fulfill({ contentType: 'text/javascript', body: `window.google = { accounts: { oauth2: {
        initTokenClient: config => {
          window.syntheticOAuthConfig = { scope: config.scope, includeGranted: config.include_granted_scopes };
          return { requestAccessToken: () => config.callback({ access_token: 'synthetic-browser-token', expires_in: 3600, scope: config.scope }) };
        },
        hasGrantedAllScopes: (response, scope) => response.scope === scope
      } } };` });
    });
    await page.route('https://www.googleapis.com/**', async route => {
      driveCalls++;
      const request = route.request(), url = new URL(request.url());
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      assert.equal(request.headers().authorization, 'Bearer synthetic-browser-token');
      let data;
      if (request.method() === 'POST') {
        const boundary = request.headers()['content-type'].split('boundary=')[1];
        const parts = request.postData().split('--' + boundary);
        const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
        const encrypted = JSON.parse(parts[2].split('\r\n\r\n')[1].trim());
        assert.deepEqual(metadata.parents, ['appDataFolder']);
        const file = { id: 'synthetic_browser_' + (files.length + 1), name: metadata.name, encrypted }; files.push(file);
        data = { id: file.id, name: file.name };
      } else if (url.searchParams.get('alt') === 'media') data = files.find(file => file.id === url.pathname.split('/').at(-1)).encrypted;
      else { assert.equal(url.searchParams.get('spaces'), 'appDataFolder'); data = { files: files.map(({ id, name }) => ({ id, name })) }; }
      await route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { DriveProbeClient } = await import('/drive-probe.mjs');
      const original = DriveProbeClient.prototype.create;
      DriveProbeClient.prototype.create = async function (...args) {
        try { return await original.apply(this, args); }
        catch (error) { window.syntheticProbeFailure = error.message; throw error; }
      };
    });
    await page.getByRole('button', { name: 'Preparar autorización Google' }).waitFor();
    assert.equal(scriptCalls, 0); assert.equal(driveCalls, 0);
    await page.getByRole('button', { name: 'Preparar autorización Google' }).click();
    await page.getByRole('button', { name: 'Autorizar Drive', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.syntheticOAuthConfig), { scope: 'https://www.googleapis.com/auth/drive.appdata', includeGranted: false });
    await page.getByRole('button', { name: 'Crear y verificar archivo sintético' }).click();
    await page.waitForFunction(() => document.getElementById('result').textContent.includes('listedInAppDataFolder')).catch(async error => {
      console.error('Synthetic probe result:', await page.locator('#result').textContent());
      console.error('Synthetic browser failure:', await page.evaluate(() => window.syntheticProbeFailure || null)); throw error;
    });
    const result = JSON.parse(await page.locator('#result').textContent()); assert.equal(result.integrityVerified, true); assert.equal(result.androidInteroperability, 'pending');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar paquete de prueba Android' }).click();
    const download = await downloadEvent, saved = await download.path();
    const packet = JSON.parse(fs.readFileSync(saved, 'utf8')); assert.equal(packet.synthetic, true);
    assert.equal(packet.syntheticKeyBase64.length, 44);
    await page.locator('#packet').setInputFiles({ name: 'synthetic-probe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
    await page.waitForFunction(() => { const data = JSON.parse(document.getElementById('result').textContent); return data.integrityVerified && !('androidInteroperability' in data); });
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert(!(await page.locator('body').innerText()).includes('synthetic-browser-token'));
    const output = path.resolve(__dirname, '../../artifacts/google-probe'); fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'synthetic-web-check.png'), fullPage: true });
    await page.getByRole('button', { name: 'Desconectar esta sesión' }).click();
    assert.equal(await page.getByRole('button', { name: 'Crear y verificar archivo sintético' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Descargar paquete de prueba Android' }).isDisabled(), true);
    await page.reload();
    assert.equal(await page.getByRole('button', { name: 'Autorizar Drive', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: browser authorization flow, encrypted synthetic create/read, packet verification, memory-only token and disconnect. Google endpoints were mocked; real access is pending.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
