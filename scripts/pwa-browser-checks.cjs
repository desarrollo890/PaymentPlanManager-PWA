// Checks only the static F1 preview; no financial data or production server is used.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const dist = path.resolve(__dirname, '../apps/pwa/dist');
const output = path.resolve(__dirname, '../artifacts/pwa-preview');
const base = '/PaymentPlanManager-PWA/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  if (!pathname.startsWith(base)) { response.writeHead(404); response.end(); return; }
  const target = path.resolve(dist, pathname.slice(base.length) || 'index.html');
  if (!target.startsWith(dist + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  response.end(fs.readFileSync(target));
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    const url = `http://127.0.0.1:${server.address().port}${base}`;
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requests.push(request.url()));
      page.on('requestfailed', request => errors.push(`Request failed: ${request.url()}`));
      page.on('response', response => { if (!response.ok()) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
      await page.goto(url);
      await page.getByRole('heading', { name: 'Tu espacio financiero', exact: true }).waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'es-MX');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No horizontal overflow');
      await page.screenshot({ path: path.join(output, `${name}-inicio.png`), fullPage: true });
      await page.getByRole('link', { name: 'Explorar mi espacio' }).click();
      await page.getByRole('heading', { name: 'Tus tarjetas', exact: true }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'Tus tarjetas', exact: true }).waitFor();
      assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Tarjetas' }).getAttribute('aria-current'), 'page');
      await page.goBack();
      await page.getByRole('heading', { name: 'Tu espacio financiero', exact: true }).waitFor();
      for (const [section, title] of [['Movimientos', 'Tus movimientos'], ['Presupuesto', 'Tu presupuesto'], ['Preferencias', 'A tu manera']]) {
        await page.getByRole('navigation').getByRole('link', { name: section, exact: true }).click();
        await page.getByRole('heading', { name: title, exact: true }).waitFor();
      }
      await page.getByRole('link', { name: 'Ir al contenido' }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
      await page.getByRole('heading', { name: 'A tu manera', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.screenshot({ path: path.join(output, `${name}-preferencias.png`), fullPage: true });
      await page.goto(url + '#/no-existe');
      await page.getByRole('heading', { name: 'Tu espacio financiero', exact: true }).waitFor();
      assert(requests.every(request => request.startsWith(url)), 'Preview must not call APIs, Google or external assets');
      assert.deepEqual(errors, [], 'No browser or asset errors');
      await context.close();
      console.log(`PASS: ${name}, navigation, direct reload, history, focus, base path and no external requests.`);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
