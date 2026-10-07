// All browser data is synthetic. Google is not authorized by this suite.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const dist = path.resolve(__dirname, '../apps/pwa/dist'), output = path.resolve(__dirname, '../artifacts/pwa-preview'), base = '/PaymentPlanManager-PWA/';
let workerRevision = 0;
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const target = path.resolve(dist, pathname.slice(base.length) || 'index.html');
  if (!pathname.startsWith(base) || !target.startsWith(dist + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  const content=fs.readFileSync(target);response.end(path.basename(target)==='service-worker.js'&&workerRevision ? content.toString().replace(/paymentplan-shell-([0-9a-f]+)/,`paymentplan-shell-$1-test-${workerRevision}`) : content);
});
const password = 'synthetic-test-password';
async function fill(page, name, value) { await page.locator(`input[name="${name}"]`).fill(String(value)); }
async function save(page) { await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
(async () => {
  fs.mkdirSync(output, { recursive:true }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    const url = process.env.PAYMENTPLAN_BROWSER_BASE_URL || `http://127.0.0.1:${server.address().port}${base}`;
    for (const [name, viewport] of [['desktop', { width:1440,height:1000 }], ['mobile',{ width:390,height:844 }]]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
      await page.goto(url); await page.getByRole('heading', { name:'Crea tu cartera', exact:true }).waitFor();
      await fill(page,'password',password); await fill(page,'confirmation',password); await page.getByRole('button',{name:'Crear cartera',exact:true}).click();
      await page.getByRole('heading',{name:'Guarda tu clave de recuperación'}).waitFor(); const recovery = await page.locator('.recovery-key').textContent();
      await page.getByRole('checkbox',{name:'Guardé la clave de recuperación en un lugar seguro'}).check(); await page.getByRole('button',{name:'Abrir mi cartera'}).click();
      await page.getByRole('button',{name:'Registrar mi primera tarjeta'}).click();
      await fill(page,'name','Tarjeta sintética'); await fill(page,'bank','Banco de pruebas'); await fill(page,'limit','20000'); await fill(page,'available','10000'); await fill(page,'debt','10000'); await save(page);
      await page.getByRole('navigation').getByRole('link',{name:'Tarjetas',exact:true}).click(); await page.locator('.credit-card').waitFor();
      assert.equal(await page.locator('.credit-limit span').textContent(),'Límite de crédito'); assert.match(await page.locator('.credit-limit strong').textContent(),/20,000/);
      await page.getByRole('button',{name:'Planes (0) →'}).click(); await page.getByRole('button',{name:'Dividir deuda',exact:true}).click();
      assert.equal(await page.locator('input[name="capital"]').inputValue(),'10000.00'); await fill(page,'capital','6000'); await fill(page,'description','Plan MSI sintético'); await fill(page,'months','14'); await save(page);
      await page.getByRole('button',{name:'Dividir deuda',exact:true}).click(); assert.equal(await page.locator('input[name="capital"]').inputValue(),'4000.00'); await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
      await page.locator('.installment-detail summary').click(); await page.getByRole('button',{name:'Editar plan',exact:true}).click(); await fill(page,'description','Plan corregido'); await save(page);
      assert.equal(await page.locator('.installment-detail').count(),1); await page.screenshot({path:path.join(output,`${name}-tarjetas.png`),fullPage:true});
      await page.getByRole('button',{name:'Registrar movimiento',exact:true}).click(); const today = await page.locator('input[name="date"]').inputValue(); await fill(page,'amount','250'); await fill(page,'description','Compra local sintética'); await save(page);
      for (const [label,title] of [['Movimientos','Tus movimientos'],['Calendario','Tu calendario de pagos'],['Presupuesto','Tu presupuesto'],['Préstamos','Préstamos de personas'],['Periodos','Tus resúmenes'],['Preferencias','A tu manera']]) {
        await page.getByRole('navigation').getByRole('link',{name:label,exact:true}).click(); await page.getByRole('heading',{name:title,exact:true,level:1}).waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${label} overflow`);
      }
      await page.getByRole('navigation').getByRole('link',{name:'Movimientos',exact:true}).click(); await page.getByRole('button',{name:'Importar CSV / Excel'}).click();
      const bankCsv = Buffer.from(`Fecha,Descripcion,Importe,Tipo,Referencia\n${today},Compra importada,125.50,Gasto,SYNTHETIC-CSV-ID`);
      await page.getByRole('dialog').locator('input[type=file]').setInputFiles({name:'synthetic-bank.csv',mimeType:'text/csv',buffer:bankCsv});
      await page.getByRole('dialog').locator('select[name="kind"]').selectOption('3');await page.getByRole('dialog').locator('select[name="reference"]').selectOption('4'); await page.getByRole('button',{name:'Previsualizar movimientos'}).click();
      await page.getByRole('button',{name:'Confirmar movimientos'}).click(); await page.getByRole('dialog').waitFor({state:'hidden'}); await page.getByRole('cell',{name:'Compra importada',exact:true}).waitFor();
      await page.getByRole('button',{name:'Importar CSV / Excel'}).click();await page.getByRole('dialog').locator('input[type=file]').setInputFiles({name:'synthetic-bank.csv',mimeType:'text/csv',buffer:bankCsv});
      await page.getByRole('dialog').locator('select[name="kind"]').selectOption('3');await page.getByRole('dialog').locator('select[name="reference"]').selectOption('4');await page.getByRole('button',{name:'Previsualizar movimientos'}).click();await page.getByText('0 movimientos seleccionados · 1 ya registrados.').waitFor(); await page.getByRole('button',{name:'Cerrar ventana'}).click();
      await page.getByRole('navigation').getByRole('link',{name:'Presupuesto',exact:true}).click(); await page.getByRole('heading',{name:'Tu presupuesto',level:1}).waitFor(); assert(await page.locator('tbody tr').count()>=26,'Full installment horizon');
      await page.getByRole('navigation').getByRole('link',{name:'Preferencias',exact:true}).click();
      const downloadEvent = page.waitForEvent('download'); await page.getByRole('button',{name:'Descargar respaldo cifrado'}).click(); const backupFile = await downloadEvent;
      const backupPath = path.join(output, `${name}-synthetic-backup.json`); await backupFile.saveAs(backupPath); const contents = fs.readFileSync(backupPath,'utf8');
      for (const secret of ['Tarjeta sintética','Banco de pruebas','Compra local sintética',password,recovery]) assert(!contents.includes(secret),'Backup contains only encrypted data');
      if(name==='desktop'){
        const restoredContext=await browser.newContext({viewport}),restored=await restoredContext.newPage();await restored.goto(url);await restored.getByRole('heading',{name:'Crea tu cartera'}).waitFor();
        await restored.locator('input[type=file]').setInputFiles(backupPath);await restored.getByRole('button',{name:'Olvidé mi contraseña'}).click();await fill(restored,'recovery',recovery);await fill(restored,'password','synthetic-backup-recovered');await fill(restored,'confirmation','synthetic-backup-recovered');await restored.getByRole('button',{name:'Importar respaldo',exact:true}).click();await restored.getByRole('button',{name:'Bloquear cartera'}).waitFor();
        await restored.getByRole('navigation').getByRole('link',{name:'Preferencias',exact:true}).click();await restored.locator('input[type=file]').filter({visible:true}).count();
        await restored.locator('.file-button').filter({hasText:'Importar respaldo cifrado'}).locator('input').setInputFiles(backupPath);await restored.getByRole('dialog').locator('input[name=password]').fill(password);await restored.getByRole('button',{name:'Verificar e importar'}).click();await restored.getByRole('dialog').waitFor({state:'hidden'});
        await restored.getByRole('navigation').getByRole('link',{name:'Tarjetas',exact:true}).click();await restored.locator('.credit-card').waitFor();assert.equal(await restored.locator('.credit-card').count(),1,'Repeated backup import cannot duplicate a card');await restoredContext.close();
      }
      const stored = await page.evaluate(async () => { const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('paymentplan-encrypted-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}); const result={};for(const name of ['meta','blocks','outbox'])result[name]=await new Promise(resolve=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result)});db.close();return JSON.stringify(result) });
      assert(!stored.includes('Compra local sintética')); assert(!stored.includes(password)); assert(!stored.includes(recovery));
      await page.getByRole('button',{name:'Bloquear cartera'}).click(); await page.getByRole('heading',{name:'Desbloquea tu cartera'}).waitFor();
      await fill(page,'password','incorrect-password'); await page.getByRole('button',{name:'Desbloquear',exact:true}).click(); await page.getByRole('alert').waitFor();
      await fill(page,'password',password); await page.getByRole('button',{name:'Desbloquear',exact:true}).click(); await page.getByRole('button',{name:'Bloquear cartera'}).waitFor();
      await page.reload(); await page.getByRole('heading',{name:'Desbloquea tu cartera'}).waitFor();
      await page.getByRole('button',{name:'Olvidé mi contraseña'}).click(); await fill(page,'recovery',recovery); await fill(page,'password','synthetic-recovered-password'); await fill(page,'confirmation','synthetic-recovered-password'); await page.getByRole('button',{name:'Cambiar contraseña y desbloquear'}).click(); await page.getByRole('button',{name:'Bloquear cartera'}).waitFor();
      await page.getByRole('navigation').getByRole('link',{name:'Tarjetas',exact:true}).click(); await page.locator('.credit-card').waitFor(); assert.equal(await page.locator('.credit-card').count(),1);
      await page.evaluate(()=>navigator.serviceWorker.ready); await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller)); await context.setOffline(true); await page.reload();
      await page.getByRole('heading',{name:'Desbloquea tu cartera'}).waitFor(); await fill(page,'password','synthetic-recovered-password'); await page.getByRole('button',{name:'Desbloquear',exact:true}).click(); await page.locator('.credit-card').waitFor();
      await page.getByRole('button',{name:'Registrar movimiento',exact:true}).click(); await fill(page,'amount','100'); await fill(page,'description','Compra sin conexión'); await save(page);
      for(let i=2;i<=4;i++){await page.getByRole('button',{name:'Agregar tarjeta',exact:true}).click();await fill(page,'name',`Tarjeta ${i}`);await fill(page,'bank','Banco sintético');await fill(page,'limit','10000');await fill(page,'available',10000-i*1000);await fill(page,'debt',i*1000);await save(page);}
      if(name==='desktop'){const boxes=await page.locator('.credit-card').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().top));assert.equal(new Set(boxes).size,1,'Four cards fit one desktop row');}
      if(await page.locator('.selected-card-plans').count()) await page.getByRole('button',{name:'Planes (1) →',exact:true}).click();
      await page.getByRole('button',{name:'Planes (1) →',exact:true}).click();
      await page.waitForFunction(()=>document.activeElement?.classList.contains('selected-card-plans')&&document.activeElement.getBoundingClientRect().top>=0&&document.activeElement.getBoundingClientRect().top<innerHeight,null,{timeout:15000});
      assert.equal(await page.locator('.selected-card-plans .installment-detail').count(),1,'Plans remain visible after navigating from a multi-card grid');
      await page.screenshot({path:path.join(output,`${name}-offline.png`),fullPage:true});
      if(name==='desktop'&&!process.env.PAYMENTPLAN_BROWSER_BASE_URL){
        await context.setOffline(false);workerRevision++;await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
        await page.getByRole('button',{name:'Actualizar aplicación'}).waitFor();await page.getByRole('button',{name:'Registrar movimiento',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Actualizar aplicación'}).isDisabled(),true,'Update must protect an open financial form');
        await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('button',{name:'Actualizar aplicación'}).click();await page.getByRole('heading',{name:'Desbloquea tu cartera'}).waitFor();
        await fill(page,'password','synthetic-recovered-password');await page.getByRole('button',{name:'Desbloquear',exact:true}).click();await page.locator('.credit-card').first().waitFor();assert.equal(await page.locator('.credit-card').count(),4,'Update retains encrypted financial data');
      }
      assert.deepEqual(errors,[],'No browser errors'); assert(requests.every(r=>r.startsWith(url)),'No external requests without authorization'); await context.close();
      console.log(`PASS: ${name}, encrypted creation, four cards, MSI/edit/free debt/full horizon, CSV import/dedup, backup, recovery, offline reload/write and safe update.`);
    }
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1});
