import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands, prepareBankImport, readCsv } from '@paymentplan/application';
import { applyChanges, emptyPortfolio } from '@paymentplan/domain';
import type { BankMapping } from '@paymentplan/application';
function fixture() { const p = emptyPortfolio(), cmd = new FinancialCommands(p, { today: '2026-10-03', now: '2026-10-03T12:00:00Z', newId: randomUUID });
  const changes = cmd.saveCard({name:'Synthetic',bank:'Bank',limitCents:2000000,cutDay:11,dueDay:25,dueMonthOffset:null,color:'#234E70',initialDebtOrigin:'currentPeriod',archived:false},{date:'2026-10-03',availableCents:1000000,debtCents:1000000});
  return applyChanges(p,changes); }
const mapping: BankMapping = {date:0,description:1,amount:2,kind:3,reference:4,dateFormat:'iso',decimalComma:false,defaultKind:'expense'};
test('CSV handles escaped quotes, embedded lines, semicolons and UTF-8 BOM; malformed input is rejected',()=>{
  assert.deepEqual(readCsv('\ufeffFecha;Detalle;Monto\r\n2026-10-03;"Compra; \"\"local\"\"\ncompleta";10.50'),[['Fecha','Detalle','Monto'],['2026-10-03','Compra; "local"\ncompleta','10.50']]);
  assert.throws(()=>readCsv('a,b\n"sin cerrar'),/sin cerrar/);
});
test('bank import converts exact cents, previews duplicates and repeats idempotently',async()=>{
  const p=fixture(),id=p.cards[0]!.id,rows=readCsv('Fecha,Descripción,Importe,Tipo,ID\n2026-10-03,Compra,"1,234.56",Gasto,A\n2026-10-03,Pago,-100.50,Pago,B');
  const preview=await prepareBankImport(p,id,rows,mapping,'2026-10-03');assert.deepEqual(preview.map(r=>r.amountCents),[123456,10050]);
  const next=applyChanges(p,preview.map(r=>r.change!)),repeat=await prepareBankImport(next,id,rows,mapping,'2026-10-03');assert(repeat.every(r=>r.duplicate&&r.change===null));
});
test('same-valued independent rows survive without IDs; ambiguous numeric values and unknown kinds fail',async()=>{
  const p=fixture(),id=p.cards[0]!.id,rows=readCsv('Fecha,Descripción,Importe,Tipo\n03/10/2026,Compra,"1.234,56",Gasto\n03/10/2026,Compra,"1.234,56",Gasto');
  const preview=await prepareBankImport(p,id,rows,{...mapping,reference:-1,dateFormat:'dmy',decimalComma:true},'2026-10-03');assert.equal(new Set(preview.map(r=>r.change!.entityId)).size,2);
  await assert.rejects(prepareBankImport(p,id,[rows[0]!,['2026-10-03','Purchase','1.001','Gasto']],mapping,'2026-10-03'),/importe/);
  await assert.rejects(prepareBankImport(p,id,[rows[0]!,['2026-10-03','Purchase','1.00','Unknown']],mapping,'2026-10-03'),/tipo/);
});
