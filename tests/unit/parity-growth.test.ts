import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands, prepareBankImport } from '@paymentplan/application';
import { activityReport, applyChanges, assertPortfolio, emptyPortfolio, financeView, simulatePayoff, sumCents } from '@paymentplan/domain';
import type { Portfolio } from '@paymentplan/domain';
const context = {today:'2026-10-06', now:'2026-10-06T12:00:00Z', newId:randomUUID};
function fixture() { let p: Portfolio = emptyPortfolio(); const commit = (changes: ReturnType<FinancialCommands['saveCard']>) => {p=applyChanges(p,changes);};
  commit(new FinancialCommands(p,context).saveCard({name:'Sintética',bank:'Banco',limitCents:2000000,cutDay:11,dueDay:25,dueMonthOffset:null,color:'#234E70',initialDebtOrigin:'currentPeriod',archived:false},{date:context.today,debtCents:1000000,availableCents:1000000}));
  const cardId=p.cards[0]!.id;
  return {get p(){return p;},get cmd(){return new FinancialCommands(p,context);}, commit,cardId}; }
test('allocation-only edit allows a reconciled payment without changing its amount or bank balance, protects closed history', async()=>{
  const h=fixture(); h.commit(h.cmd.savePlan({cardId:h.cardId,description:'MSI',principalCents:600000,months:3,interestCents:0,startDate:context.today,firstCutDate:'2026-10-11',cutDay:11,purchaseId:null,interestIncludedInDebt:false,amortization:null}));
  const planId=h.p.installments[0]!.id;
  h.commit(h.cmd.recordMovement({cardId:h.cardId,date:context.today,amountCents:20000,kind:'payment',description:'Pago',statementId:null,allocations:[]}));
  const id=h.p.movements[0]!.id;h.commit(h.cmd.reconcile(h.cardId,{date:context.today,debtCents:980000,availableCents:1020000}));
  const before=financeView(h.p,context.today).debtCents;
  h.commit(h.cmd.assignPayment(id,[{planId,quotaNumber:1,principalCents:10000,interestCents:0},{planId,quotaNumber:2,principalCents:10000,interestCents:0}]));
  assert.equal(h.p.movements[0]!.value.amountCents,20000); assert(h.p.movements[0]!.value.reconciled);assert.equal(financeView(h.p,context.today).debtCents,before);
  assert.throws(()=>h.cmd.assignPayment(id,[{planId,quotaNumber:1,principalCents:20001,interestCents:0}]),/importe|pago/);
  h.commit(await h.cmd.closePeriod(h.cardId,context.today,context.today,null,null));assert.throws(()=>h.cmd.assignPayment(id,[]),/Reabre/);
});
test('card deletion atomically tombstones every related live record, keeps another card and original payloads', async()=>{
  const h=fixture();h.commit(h.cmd.recordMovement({cardId:h.cardId,date:context.today,amountCents:10000,kind:'expense',description:'Compra',statementId:null,allocations:[]}));
  h.commit(await h.cmd.closePeriod(h.cardId,context.today,context.today,null,null));
  h.commit(h.cmd.saveCard({...h.p.cards[0]!.value,name:'Otra'},{date:context.today,debtCents:0,availableCents:2000000}));
  const changes=h.cmd.deleteCard(h.cardId);h.commit(changes);assertPortfolio(h.p,context.today);
  assert(h.p.cards.find(c=>c.id===h.cardId)!.voided);assert(h.p.movements[0]!.voided);assert(h.p.closures[0]!.voided);assert(!h.p.cards.find(c=>c.id!==h.cardId)!.voided);
  assert.equal(financeView(h.p,context.today).cards.length,1);assert.equal(h.p.movements[0]!.value.description,'Compra');
});
test('loan deletion preserves the old no-history guard, even when an abono was cancelled',()=>{
  const h=fixture();h.commit(h.cmd.saveLoan({person:'Persona',description:'Préstamo',principalCents:100000,balanceDate:context.today,dueDate:null,includeReceivedMoney:false,archived:false}));const id=h.p.loans[0]!.id;
  assert.equal(h.cmd.deleteLoan(id).length,1);h.commit(h.cmd.loanPayment(id,context.today,1000,'Abono'));h.commit(h.cmd.changeLoanPayment(h.p.loanPayments[0]!.id,'void'));
  assert.throws(()=>h.cmd.deleteLoan(id),/historial/);
});
test('all-card activity summaries work before known balances and separate planned and voided entries',()=>{
  const h=fixture();h.commit(h.cmd.recordMovement({cardId:h.cardId,date:context.today,amountCents:1200,kind:'expense',description:'Compra',statementId:null,allocations:[]}));h.commit(h.cmd.recordMovement({cardId:h.cardId,date:'2026-10-08',amountCents:2000,kind:'payment',description:'Futuro',statementId:null,allocations:[]}));
  const row=activityReport(h.p,'2026-10-01','2026-10-31',context.today)[0]!;assert.equal(row.expensesCents,1200);assert.equal(row.paymentsCents,0);assert.equal(row.realCount,1);assert.equal(row.plannedCount,1);
  h.commit(h.cmd.changeMovement(h.p.movements[0]!.id,'void'));assert.equal(activityReport(h.p,'2026-10-01','2026-10-31',context.today)[0]!.expensesCents,0);
});
test('bank preview preserves valid rows alongside errors and warns about manual duplicates and calculated plan interest',async()=>{
  const h=fixture();h.commit(h.cmd.recordMovement({cardId:h.cardId,date:context.today,amountCents:1234,kind:'expense',description:'  Compra  local ',statementId:null,allocations:[]}));
  h.commit(h.cmd.savePlan({cardId:h.cardId,description:'MCI',principalCents:30000,months:3,interestCents:3000,startDate:context.today,firstCutDate:'2026-10-11',cutDay:11,purchaseId:null,interestIncludedInDebt:false,amortization:null}));
  const result=await prepareBankImport(h.p,h.cardId,[['Fecha','Detalle','Importe','Tipo'],[context.today,'compra local','12.34','Gasto'],['2026-10-11','Cuota interés','10.00','Interés'],['bad','Bad','bad','Gasto'],[context.today,'Otra','10.00','Gasto']],{date:0,description:1,amount:2,kind:3,reference:-1,dateFormat:'iso',decimalComma:false,defaultKind:'expense'},context.today);
  assert.match(result[0]!.warning!,/manual/);assert.match(result[1]!.warning!,/plan/);assert(result[2]!.error);assert.equal(result[2]!.change,null);assert(result[3]!.change);assert.equal(result[3]!.warning,null);
});
test('payoff has exact cent conservation, reuses freed minimums, and handles zero interest and insufficient cash',()=>{
  const debts=[{id:'a',name:'A',balanceCents:10001,minimumCents:1000,monthlyRate:'0'},{id:'b',name:'B',balanceCents:20000,minimumCents:1000,monthlyRate:'0'}];
  const r=simulatePayoff(debts,5000,'snowball');assert(r.complete);assert.equal(r.schedule.length,7);assert.equal(r.paidCents,30001);assert.equal(r.interestCents,0);assert.equal(r.schedule.at(-1)!.paidCents,1);
  let opening=30001;for(const m of r.schedule){assert.equal(opening+m.interestCents-m.paidCents,m.balanceCents);assert.equal(sumCents(m.debts.map(d=>d.paidCents)),m.paidCents);opening=m.balanceCents;}
  assert.equal(simulatePayoff(debts,1999,'avalanche').complete,false);assert.equal(simulatePayoff(debts,1999,'avalanche').schedule.length,0);
  assert.throws(()=>simulatePayoff([{...debts[0]!,monthlyRate:'101'}],5000,'avalanche'),/100/);
});
test('Excel 1900 and 1904 date systems describe the same civil day without time-zone drift',async()=>{
  const h=fixture(), mapping={date:0,description:1,amount:2,kind:-1,reference:-1,dateFormat:'excel' as const,decimalComma:false,defaultKind:'expense' as const};
  const serial=Math.round((Date.UTC(2026,9,6)-Date.UTC(1899,11,30))/86400000);
  const a=await prepareBankImport(h.p,h.cardId,[['Date','Description','Amount'],[String(serial),'Excel','1.00']],mapping,context.today);
  const b=await prepareBankImport(h.p,h.cardId,[['Date','Description','Amount'],[String(serial-1462),'Excel','1.00']],{...mapping,dateFormat:'excel1904'},context.today);
  assert.equal(a[0]!.date,context.today);assert.equal(b[0]!.date,context.today);assert.equal(a[0]!.change!.entityId,b[0]!.change!.entityId);
});
test('avalanche pays the higher monthly rate first, exposes negative amortization and caps the horizon',()=>{
  const debts=[{id:'a',name:'A',balanceCents:100000,minimumCents:1000,monthlyRate:'2'},{id:'b',name:'B',balanceCents:50000,minimumCents:1000,monthlyRate:'0.5'}];
  const a=simulatePayoff(debts,10000,'avalanche'),s=simulatePayoff(debts,10000,'snowball');assert(a.complete&&s.complete);assert(a.interestCents<=s.interestCents);assert.equal(a.schedule[0]!.debts[0]!.paidCents,9000);
  assert.match(simulatePayoff(debts,2000,'avalanche').reason!,/no reducen/);assert.match(simulatePayoff(debts,10000,'avalanche',1).reason!,/1 meses/);
});
