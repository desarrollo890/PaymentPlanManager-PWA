// Synthetic UI and encrypted v2 interoperability only; no real Google authorization.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {createServer}=await import('vite'),root=path.resolve(__dirname,'..'),base='/PaymentPlanManager-PWA/';
 const server=await createServer({root:path.join(root,'apps/pwa'),configFile:path.join(root,'apps/pwa/vite.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:false}});
 await server.listen();let browser;
 try{
  browser=await chromium.launch({headless:true});const url=`http://127.0.0.1:${server.httpServer.address().port}${base}`;
  for(const viewport of [{width:1440,height:1050},{width:390,height:844}]){
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
   const fill=(name,value)=>page.locator(`input[name="${name}"]`).fill(value),nav=name=>page.getByRole('navigation').getByRole('link',{name,exact:true}).click();
   const save=async()=>{await page.getByRole('dialog').getByRole('button',{name:'Guardar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog'));};
   await page.getByRole('heading',{name:'Crea tu cartera',exact:true}).waitFor();await fill('password','synthetic-planning-password');await fill('confirmation','synthetic-planning-password');await page.getByRole('button',{name:'Crear cartera',exact:true}).click();
   await page.getByRole('checkbox',{name:'Guardé la clave de recuperación en un lugar seguro'}).check();await page.getByRole('button',{name:'Abrir mi cartera',exact:true}).click();
   await page.getByRole('button',{name:'Registrar mi primera tarjeta'}).click();await fill('name','Tarjeta sintética');await fill('bank','Banco');await fill('limit','10000');await fill('available','9000');await fill('debt','1000');const today=await page.locator('input[name="date"]').inputValue();await save();
   await nav('Categorías');await page.getByRole('button',{name:'Nueva categoría',exact:true}).click();await fill('name','Comida');await save();await page.getByRole('button',{name:'Nueva regla',exact:true}).click();await page.locator('select[name="categoryId"]').selectOption({label:'Comida'});await fill('contains','café');await save();
   await nav('Cuentas');await page.getByRole('button',{name:'Nueva cuenta',exact:true}).click();await fill('name','Débito sintético');await fill('opening','1000');await save();
   await page.getByRole('button',{name:'Nueva cuenta',exact:true}).click();await fill('name','Efectivo sintético');await page.locator('select[name="kind"]').selectOption('cash');await save();
   await nav('Metas');await page.getByRole('button',{name:'Nueva meta',exact:true}).click();await fill('name','Fondo sintético');await page.locator('select[name="accountId"]').selectOption({label:'Débito sintético'});await fill('target','2000');await fill('targetDate','2027-11-30');await save();
   await page.getByRole('button',{name:'Reservar / liberar',exact:true}).click();await fill('amount','600');await fill('description','Reserva sintética');await save();assert.match(await page.locator('progress').getAttribute('value'),/60000/);
   await nav('Cuentas');const debit=page.locator('article').filter({has:page.getByRole('heading',{name:'Débito sintético',exact:false})});await debit.getByRole('button',{name:'Registrar',exact:true}).click();await page.locator('select[name="kind"]').selectOption('transfer');await page.locator('select[name="toAccountId"]').selectOption({label:'Efectivo sintético'});await fill('amount','500');await fill('description','Transferencia sintética');await page.getByRole('dialog').getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'Libera'}).waitFor();await fill('amount','200');await save();
   assert.match(await debit.textContent(),/800/);await debit.getByRole('button',{name:'Registrar',exact:true}).click();await page.locator('select[name="kind"]').selectOption('cardPayment');await page.locator('select[name="cardId"]').selectOption({label:'Tarjeta sintética'});await fill('amount','100');await fill('description','Pago sintético');await save();assert.match(await debit.textContent(),/700/);
   await nav('Recurrencias');await page.getByRole('button',{name:'Nueva recurrencia',exact:true}).click();await page.locator('select[name="cardId"]').selectOption({label:'Tarjeta sintética'});await fill('description','Café mensual');await fill('amount','10');await fill('start',today);await fill('end',today);await save();await page.getByRole('button',{name:'Registrar como realizado',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Registrar como realizado',exact:true}).count(),1);await page.getByRole('button',{name:'Registrar como realizado',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Registrar como realizado'));
   await page.getByRole('button',{name:'Preparar propuestas',exact:true}).click();await page.waitForTimeout(700);assert.equal(await page.getByRole('button',{name:'Registrar como realizado',exact:true}).count(),0);
   await nav('Categorías');await page.getByRole('button',{name:'Clasificar',exact:true}).click();await page.locator('select[name="categoryId"]').selectOption({label:'Comida'});await save();assert.match(await page.locator('.planning-card').textContent(),/10/);
   await nav('Presupuesto');await page.getByRole('heading',{name:'Ahorro sugerido por quincena',exact:true}).waitFor();assert.match(await page.locator('main').textContent(),/2027/);
   await page.getByRole('button',{name:'Bloquear cartera',exact:true}).click();await fill('password','synthetic-planning-password');await page.getByRole('button',{name:'Desbloquear',exact:true}).click();await nav('Metas');await page.locator('progress').waitFor();assert.equal(await page.locator('progress').getAttribute('value'),'60000');assert.deepEqual(errors,[]);await context.close();
   console.log('PASS: '+viewport.width+'px categories, ambiguous rule review, protected reservations, transfers, cash-funded card payment, recurrence realization/idempotence, goal horizon and encrypted reload.');
  }
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(const page of pages){await page.route('**/harness.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Synthetic encrypted v2 tests</body></html>'}));await page.goto(url+'harness.html');await page.evaluate(async({root,base})=>{
   const module=name=>import(base+'@fs/'+root.replaceAll('\\','/')+'/packages/'+name+'/src/index.ts');window.h={app:await module('application'),crypto:await module('crypto'),domain:await module('domain'),storage:await module('storage')};
  },{root,base});}
  const backup=await pages[0].evaluate(async()=>{
   const h=window.h,v=await h.crypto.createVault('synthetic-v2-backup-password');h.syntheticRecoveryKey=v.recoveryKey;h.store=new h.storage.IndexedVaultStore();await h.store.initialize(v.header);h.session=new h.app.VaultSession(h.store,v.header,v.cipher);await h.session.refresh();const date=new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
   await h.session.commit(h.session.commands(date).saveCashAccount({name:'Private synthetic cash',kind:'cash',openingDate:date,openingCents:10000,color:'#123456',archived:false}),date);
   const id=h.session.portfolio.cashAccounts[0].id;await h.session.commit(h.session.commands(date).saveSavingsGoal({accountId:id,name:'Private synthetic goal',targetCents:10000,targetDate:null,color:'#123456',archived:false}),date);
   const goalId=h.session.portfolio.savingsGoals[0].id;await h.session.commit(h.session.commands(date).saveSavingsEntry({goalId,date,amountCents:5000,direction:'allocate',description:'Private reservation'}),date);
   return await h.session.backup();
  });assert(!JSON.stringify(backup).includes('Private synthetic'));
  const recoveryKey=await pages[0].evaluate(()=>window.h.syntheticRecoveryKey);
  await pages[1].evaluate(async({backup,recoveryKey})=>{
   const h=window.h,cipher=await h.crypto.unlockVault(backup.header,'synthetic-v2-backup-password'),store=new h.storage.IndexedVaultStore();await store.initialize(backup.header);const session=new h.app.VaultSession(store,backup.header,cipher);await session.refresh();await session.receive(backup.blocks);await session.receive(backup.blocks);const date=new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'}),view=h.domain.cashView(session.portfolio,date);
   if(view.totalCents!==10000||view.reservedCents!==5000||session.portfolio.savingsEntries.length!==1)throw Error('Mixed backup duplicated or lost new records');
   const recovered=await h.crypto.recoverVault(backup.header,recoveryKey,'synthetic-new-password');
   const operations=await h.app.decodeBatches(recovered.header,recovered.cipher,backup.blocks);if(operations.length!==3)throw Error('Recovery lost extension records');
   const altered=structuredClone(backup.blocks[0]);altered.ciphertextBase64=(altered.ciphertextBase64[0]==='A'?'B':'A')+altered.ciphertextBase64.slice(1);let rejected=false;
   try{await session.receive([altered]);}catch{rejected=true;}if(!rejected||session.revisions.operations.length!==3)throw Error('Tampering modified the restored portfolio');
   recovered.cipher.lock();session.lock();await store.close();
  },{backup,recoveryKey});
  for(const c of contexts)await c.close();console.log('PASS: encrypted v2 cross-profile backup, complete account/goal/reservation restoration and duplicate import rejection.');
 }finally{if(browser)await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
