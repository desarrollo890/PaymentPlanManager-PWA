// Executes the production packages in real IndexedDB across isolated browser devices.
const assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require('playwright');
function syntheticXlsx() {
  const xml='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Fecha</t></is></c><c r="B1" t="inlineStr"><is><t>Descripcion</t></is></c><c r="C1" t="inlineStr"><is><t>Importe</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>2026-10-03</t></is></c><c r="B2" t="inlineStr"><is><t>Synthetic Excel purchase</t></is></c><c r="C2"><v>125.50</v></c></row></sheetData></worksheet>';
  const name=Buffer.from('xl/worksheets/sheet1.xml'),raw=Buffer.from(xml),compressed=require('node:zlib').deflateRawSync(raw);let crc=0xffffffff;
  for(const byte of raw){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+compressed.length,16);
  return [...Buffer.concat([local,name,compressed,central,name,end])];
}
(async () => {
  const { createServer } = await import('vite');
  const root = path.resolve(__dirname, '..'), base = '/PaymentPlanManager-PWA/';
  const server = await createServer({ root: path.join(root,'apps/pwa'), configFile: path.join(root,'apps/pwa/vite.config.ts'), server:{host:'127.0.0.1',port:0,strictPort:false} });
  await server.listen(); let browser;
  try {
    browser = await chromium.launch({headless:true}); const contexts = await Promise.all([browser.newContext(),browser.newContext()]);
    const url = `http://127.0.0.1:${server.httpServer.address().port}${base}`;
    const files = [], requests = []; let failAfterWrite = false, counter = 0;
    for (const context of contexts) {
      await context.route('https://www.googleapis.com/**',async route => {
        const request=route.request(), parsed=new URL(request.url()); requests.push({method:request.method(),url:request.url(),body:request.postData()});
        if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'}});return;}
        const headers={'access-control-allow-origin':'*'};
        assert.equal(request.headers().authorization,'Bearer synthetic-memory-token');
        if (request.method()==='POST') {
          const raw=request.postData(), chunks=raw.split(/\r\n\r\n/), metadata=JSON.parse(chunks[1].split('\r\n--')[0]), value=JSON.parse(chunks[2].split('\r\n--')[0]);
          assert.deepEqual(metadata.parents,['appDataFolder']);const file={id:'synthetic_'+(++counter),...metadata,value};files.push(file);
          if(failAfterWrite){failAfterWrite=false;await route.abort('failed');return;}
          await route.fulfill({headers,json:{id:file.id,name:file.name,appProperties:file.appProperties}});return;
        }
        if(parsed.searchParams.get('alt')==='media'){const file=files.find(f=>f.id===parsed.pathname.split('/').at(-1));await route.fulfill({headers,json:file.value});return;}
        assert.equal(parsed.searchParams.get('spaces'),'appDataFolder');const prefix=parsed.searchParams.get('q').match(/name contains '([^']+)'/)[1];
        await route.fulfill({headers,json:{files:files.filter(f=>f.name.includes(prefix)).map(({value,...metadata})=>metadata)}});
      });
    }
    const pages=await Promise.all(contexts.map(c=>c.newPage()));
    for (const page of pages) {
      await page.route('**/harness.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Local synthetic package checks</body></html>'}));
      await page.goto(url+'harness.html');
      await page.evaluate(async ({root,base})=>{
        const module = name => import(base+'@fs/'+root.replaceAll('\\','/')+'/packages/'+name+'/src/index.ts');
        const [app,crypt,storage,sync,domain,contracts] = await Promise.all(['application','crypto','storage','sync','domain','contracts'].map(module));
        const {GoogleAccess}=await import(base+'@fs/'+root.replaceAll('\\','/')+'/apps/pwa/src/google.ts');
        const {readBankFile}=await import(base+'@fs/'+root.replaceAll('\\','/')+'/apps/pwa/src/bank-file.ts');
        globalThis.h={app,crypt,storage,sync,domain,contracts,GoogleAccess,readBankFile,store:new storage.IndexedVaultStore(),today:'2026-10-03',password:'synthetic-session-password'};
      },{root,base});
    }
    const created = await pages[0].evaluate(async ()=>{
      const h=globalThis.h,created=await h.crypt.createVault(h.password);h.recovery=created.recoveryKey;await h.store.initialize(created.header);h.session=new h.app.VaultSession(h.store,created.header,created.cipher);await h.session.refresh();
      await h.session.commit(h.session.commands(h.today).saveCard({name:'Synthetic Private Card',bank:'Synthetic Bank',limitCents:2000000,cutDay:11,dueDay:25,dueMonthOffset:null,color:'#234E70',initialDebtOrigin:'currentPeriod',archived:false},{date:h.today,availableCents:1000000,debtCents:1000000}),h.today);
      h.cardId=h.session.portfolio.cards[0].id;h.remote=new h.sync.DriveTransport(()=> 'synthetic-memory-token');await h.app.synchronizeDrive(h.session,h.remote);
      return {backup:await h.session.backup(),cardId:h.cardId};
    });
    await pages[0].evaluate(async bytes=>{const h=globalThis.h,sheets=await h.readBankFile(new File([new Uint8Array(bytes)],'synthetic.xlsx'));if(sheets.length!==1||sheets[0].rows[1][1]!=='Synthetic Excel purchase')throw Error('XLSX inflate/XML parsing mismatch');const rows=await h.app.prepareBankImport(h.session.portfolio,h.cardId,sheets[0].rows,{date:0,description:1,amount:2,kind:-1,reference:-1,dateFormat:'iso',decimalComma:false,defaultKind:'expense'},h.today);if(rows[0].amountCents!==12550)throw Error('XLSX exact money mismatch');},syntheticXlsx());
    await pages[1].evaluate(async ({backup,cardId})=>{const h=globalThis.h;await h.store.initialize(backup.header);h.session=new h.app.VaultSession(h.store,backup.header,await h.crypt.unlockVault(backup.header,h.password));await h.session.refresh();await h.session.receive(backup.blocks);h.cardId=cardId;h.remote=new h.sync.DriveTransport(()=> 'synthetic-memory-token');},created);
    for(let i=0;i<2;i++)await pages[i].evaluate(async i=>{const h=globalThis.h;await h.session.commit(h.session.commands(h.today).recordMovement({cardId:h.cardId,date:h.today,amountCents:(i+1)*10000,kind:'expense',description:'Offline device '+i,statementId:null,allocations:[]}),h.today);},i);
    failAfterWrite=true;
    await pages[0].evaluate(async()=>{const h=globalThis.h;let failed=false;try{await h.app.synchronizeDrive(h.session,h.remote)}catch{failed=true}if(!failed||h.session.pendingCount!==1)throw Error('Lost response must retain outbox');});
    for(const i of [0,1,0])await pages[i].evaluate(async()=>{const h=globalThis.h;await h.app.synchronizeDrive(h.session,h.remote)});
    const snapshots=await Promise.all(pages.map(p=>p.evaluate(()=>({debt:globalThis.h.session.view(globalThis.h.today).debtCents,movements:globalThis.h.session.portfolio.movements.length,pending:globalThis.h.session.pendingCount}))));
    assert.deepEqual(snapshots,[{debt:1030000,movements:2,pending:0},{debt:1030000,movements:2,pending:0}]);
    assert.equal(files.filter(f=>f.appProperties.blockId).length,3,'Lost-response retry does not upload a second duplicate');
    for(let i=0;i<2;i++)await pages[i].evaluate(async i=>{const h=globalThis.h,m=h.session.portfolio.movements.toSorted((a,b)=>a.id.localeCompare(b.id))[0];h.editId=m.id;await h.session.commit(h.session.commands(h.today).recordMovement({...m.value,amountCents:(i+3)*10000},m.id),h.today);},i);
    for(const i of [0,1,0])await pages[i].evaluate(async()=>{const h=globalThis.h;await h.app.synchronizeDrive(h.session,h.remote)});
    for(const page of pages)assert.equal(await page.evaluate(()=>globalThis.h.session.hasRevisionConflicts),true,'Concurrent financial edits require a decision');
    const selected=await pages[0].evaluate(async()=>{const h=globalThis.h,entity=h.session.revisions.entities.find(e=>e.entityId===h.editId);await h.session.resolve(entity.entityId,entity.heads[0].operationId,h.today);await h.app.synchronizeDrive(h.session,h.remote);return h.session.view(h.today).debtCents});
    await pages[1].evaluate(async expected=>{const h=globalThis.h;await h.app.synchronizeDrive(h.session,h.remote);if(h.session.hasRevisionConflicts||h.session.view(h.today).debtCents!==expected)throw Error('Resolution must propagate');},selected);
    await pages[0].evaluate(async()=>{
      const h=globalThis.h,old=await h.session.backup();await h.session.receive(old.blocks);const tampered=structuredClone(old.blocks[0]);tampered.ciphertextBase64= (tampered.ciphertextBase64[0]==='A'?'B':'A')+tampered.ciphertextBase64.slice(1);
      const before=(await h.store.load(old.header.vaultId)).blocks.length;let rejected=false;try{await h.session.receive([tampered])}catch{rejected=true}if(!rejected||(await h.store.load(old.header.vaultId)).blocks.length!==before)throw Error('Corrupt block must never commit');
      const concurrent=new h.app.VaultSession(h.store,h.session.header,await h.crypt.unlockVault(h.session.header,h.password));await concurrent.refresh();const change=h.session.commands(h.today).recordMovement({cardId:h.cardId,date:h.today,amountCents:500,kind:'expense',description:'CAS winner',statementId:null,allocations:[]});await h.session.commit(change,h.today);
      rejected=false;try{await concurrent.commit(concurrent.commands(h.today).recordMovement({cardId:h.cardId,date:h.today,amountCents:700,kind:'expense',description:'CAS loser',statementId:null,allocations:[]}),h.today)}catch(e){rejected=e instanceof h.storage.LocalRevisionError}if(!rejected)throw Error('Stale tab must reject atomically');
      const stored=await h.store.load(old.header.vaultId);if(stored.pending.length!==1)throw Error('Only successful CAS can queue a block');await concurrent.refresh();if(concurrent.portfolio.movements.some(m=>m.value.description==='CAS loser'))throw Error('CAS loser leaked');
      const tombstone=h.session.commands(h.today).recordMovement({cardId:h.cardId,date:h.today,amountCents:123,kind:'expense',description:'Imported annulled history',statementId:null,allocations:[]}).map(c=>({...c,voided:true}));await h.session.commit(tombstone,h.today);if(!h.session.portfolio.movements.some(m=>m.voided&&m.value.description==='Imported annulled history'))throw Error('Imported tombstone must retain payload');
      const beforeBulk=(await h.session.backup()).blocks.length;
      await h.session.commit(Array.from({length:1001},(_,i)=>({entityType:'reminderState',entityId:crypto.randomUUID(),payload:{reminderKey:'synthetic-bulk-'+i,postponedUntil:null},voided:false})),h.today);
      const after=await h.session.backup(),bulk=after.blocks.filter(b=>!old.blocks.some(o=>o.blockId===b.blockId));if(after.blocks.length!==beforeBulk+2)throw Error('Large groups must split into bounded batches');
      const large=[];for(const block of bulk){const ops=await h.app.decodeBatches(after.header,h.session.cipher,[block]);if(ops[0].groupSize===1001)large.push(block)}
      const tornStore=new h.storage.IndexedVaultStore('synthetic-incomplete-group');await tornStore.initialize(after.header);const torn=new h.app.VaultSession(tornStore,after.header,await h.crypt.unlockVault(after.header,h.password));await torn.refresh();await torn.receive([large[0]]);
      if(!torn.hasRevisionConflicts||torn.portfolio.reminderStates.length!==0)throw Error('Incomplete group must expose no partial records');await torn.receive([large[1]]);if(torn.hasRevisionConflicts||torn.portfolio.reminderStates.length!==1001)throw Error('Complete group must apply atomically');torn.lock();await tornStore.close();
      let callback,revoked=false;window.google={accounts:{oauth2:{initTokenClient(config){callback=config.callback;return{requestAccessToken(){callback({access_token:'synthetic-ui-memory-token',expires_in:3600,scope:h.sync.DRIVE_SCOPE})}}},revoke(token,callback){revoked=token==='synthetic-ui-memory-token';callback({successful:true})}}}};
      const access=new h.GoogleAccess('synthetic-public-client-id');await access.authorize();if(access.getToken()!=='synthetic-ui-memory-token')throw Error('Token missing');
      const persistence=JSON.stringify({local:{...localStorage},session:{...sessionStorage},meta:await h.store.list(),stored:await h.store.load(after.header.vaultId)});if(persistence.includes('synthetic-ui-memory-token'))throw Error('Google token must never persist');
      await access.revoke();if(!revoked||access.getToken())throw Error('Revoke must clear authorization');await access.authorize();access.forget();if(access.getToken())throw Error('Lock/disconnect must clear token');
      const unavailable=new h.sync.DriveTransport(()=>null);let expired=false;try{await unavailable.list(after.header.vaultId)}catch(e){expired=e instanceof h.sync.GoogleAuthorizationError}if(!expired)throw Error('Expired authorization must require user gesture');
      h.session.lock();let locked=false;try{h.session.portfolio}catch{locked=true}if(!locked)throw Error('Lock must clear financial state');
    });
    const wire=JSON.stringify(requests);for(const privateText of ['Synthetic Private Card','Offline device','CAS winner','synthetic-session-password'])assert(!wire.includes(privateText));
    assert(requests.every(r=>['GET','POST','OPTIONS'].includes(r.method)),'Immutable uploads only');
    for(const c of contexts)await c.close();
    console.log('PASS: isolated IndexedDB devices, encrypted Drive REST, offline/conflict convergence, lost response, tampering, CAS/outbox, 1001-operation atomic batches, tombstone history and memory-only Google token/revocation.');
  }finally{if(browser)await browser.close();await server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
