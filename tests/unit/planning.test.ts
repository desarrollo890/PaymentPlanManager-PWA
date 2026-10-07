import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands, portfolioFromRevisions } from '@paymentplan/application';
import { historyIssues } from '../../packages/application/src/coherence.ts';
import { applyChanges, cashBalance, cashView, emptyPortfolio, recurrenceDates, financeView, categorySpending, categorySuggestions, portfolioIssues, goalSaved } from '@paymentplan/domain';
import type { Change, Portfolio } from '@paymentplan/domain';
import type { Operation, Recurrence } from '@paymentplan/contracts';
import { assertOperation, assertBatch, assertPayload, operationVersion } from '@paymentplan/contracts';
import { mergeRevisions } from '@paymentplan/sync';
const today = '2026-10-07';
function harness() {
  let state: Portfolio = emptyPortfolio(); const context = { today, now: today + 'T18:00:00Z', newId: randomUUID };
  return { get p() { return state; }, get cmd() { return new FinancialCommands(state, context); }, commit(changes: Change[]) { state = applyChanges(state, changes); },
    card() { this.commit(this.cmd.saveCard({ name:'Tarjeta',bank:'Banco',limitCents:2000000,cutDay:11,dueDay:25,dueMonthOffset:null,color:'#123456',initialDebtOrigin:'currentPeriod',archived:false },{date:today,availableCents:1000000,debtCents:1000000})); return state.cards.at(-1)!.id; },
    account(amount = 100000) { this.commit(this.cmd.saveCashAccount({ name:'Cuenta',kind:'debit',openingDate:today,openingCents:amount,color:'#123456',archived:false })); return state.cashAccounts.at(-1)!.id; },
  };
}
function ops(changes: Change[], vaultId: string, deviceId: string, parents: readonly Operation[] = []): Operation[] {
  return changes.map((c,i) => ({schemaVersion:operationVersion(c.entityType),vaultId,operationId:randomUUID(),entityId:c.entityId,entityType:c.entityType,deviceId,deviceSequence:i+1,
    groupId:null,groupIndex:0,groupSize:1,parentRevisionIds:parents.filter(p=>p.entityId===c.entityId).map(p=>p.operationId),dependencyOperationIds:[],updatedAt:today+'T18:00:00Z',action:parents.some(p=>p.entityId===c.entityId)?'replace':'create',payload:c.payload}) as Operation);
}
test('v2 accepts extensions and mixed batches while v1 and encrypted container stay frozen', () => {
  const h=harness(); const account=h.cmd.saveCashAccount({name:'Cuenta',kind:'cash',openingDate:today,openingCents:0,color:'#FFFFFF',archived:false});
  const operation=ops(account,randomUUID(),randomUUID())[0]!;assertOperation(operation);
  assert.throws(()=>assertOperation({...operation,schemaVersion:1})); assert.throws(()=>assertOperation({...operation,schemaVersion:3}));
  assert.throws(()=>assertPayload('cashAccount',{...account[0]!.payload,openingCents:-1}));assert.throws(()=>assertPayload('cashAccount',{...account[0]!.payload,secret:'extra'}));
  const batch={schemaVersion:2,vaultId:operation.vaultId,batchId:randomUUID(),deviceId:operation.deviceId,operations:[operation]};assertBatch(batch);assert.throws(()=>assertBatch({...batch,schemaVersion:1}));
});
test('transfers conserve total cash, goals reserve existing money and release before spending', () => {
  const h=harness(), a=h.account(),b=h.account(0);h.commit(h.cmd.saveCashEntry({accountId:a,toAccountId:b,cardMovementId:null,date:today,amountCents:40000,kind:'transfer',description:'Mover',categoryId:null}));
  assert.equal(cashBalance(h.p,a,today),60000);assert.equal(cashBalance(h.p,b,today),40000);assert.equal(cashView(h.p,today).totalCents,100000);
  h.commit(h.cmd.saveSavingsGoal({accountId:b,name:'Emergencias',targetCents:60000,targetDate:'2027-11-30',color:'#FFFFFF',archived:false})); const g=h.p.savingsGoals[0]!;
  h.commit(h.cmd.saveSavingsEntry({goalId:g.id,date:today,amountCents:30000,direction:'allocate',description:'Apartar'}));assert.equal(cashView(h.p,today).freeCents,70000);
  assert.equal(goalSaved(h.p,g.id,today),30000);assert.equal(cashView(h.p,today).goals[0]!.paydays.at(-1),'2027-11-30');
  assert.throws(()=>h.cmd.saveCashEntry({accountId:b,toAccountId:null,cardMovementId:null,date:today,amountCents:20000,kind:'expense',description:'Compra',categoryId:null}),/Libera/);
  assert.throws(()=>h.cmd.saveSavingsEntry({goalId:g.id,date:today,amountCents:30001,direction:'release',description:'Exceso'}),/liberar/);
  h.commit(h.cmd.saveSavingsEntry({goalId:g.id,date:today,amountCents:10000,direction:'release',description:'Liberar'}));
  h.commit(h.cmd.saveCashEntry({accountId:b,toAccountId:null,cardMovementId:null,date:today,amountCents:20000,kind:'expense',description:'Compra',categoryId:null}));assert.equal(cashBalance(h.p,b,today),20000);
  assert.throws(()=>h.cmd.saveSavingsGoal({...g.value,accountId:a},g.id),/Libera/);
});
test('a cash-funded card payment changes both balances once and rejects inconsistent unilateral corrections', () => {
  const h=harness(),a=h.account(100000),cardId=h.card();h.commit(h.cmd.payCardFromAccount(a,cardId,today,30000,'Pago'));
  assert.equal(cashBalance(h.p,a,today),70000);assert.equal(financeView(h.p,today).debtCents,970000);
  const e=h.p.cashEntries[0]!,m=h.p.movements[0]!;
  assert.throws(()=>h.cmd.recordMovement({...m.value,amountCents:40000},m.id),/coincidir/);
  assert.throws(()=>h.cmd.changeMovement(m.id,'void'),/vinculado/);
  h.commit(h.cmd.voidExtension('cashEntry',e.id));assert.equal(cashBalance(h.p,a,today),100000);assert.equal(financeView(h.p,today).debtCents,1000000);
  assert.throws(()=>h.cmd.changeMovement(m.id,'restore'),/vinculado/);
  h.commit(h.cmd.restoreCashEntry(e.id));assert.equal(cashBalance(h.p,a,today),70000);assert.equal(financeView(h.p,today).debtCents,970000);
});
test('categories classify independently of money and rules expose ambiguity without choosing a winner', async () => {
  const h=harness(),cardId=h.card();for(const name of ['Comida','Compras'])h.commit(h.cmd.saveCategory({name,color:'#123456',archived:false}));
  h.commit(h.cmd.recordMovement({cardId,date:today,kind:'expense',amountCents:15000,description:'CAFÉ Mercado',statementId:null,allocations:[]}));const movement=h.p.movements[0]!;
  for(const category of h.p.categories)h.commit(h.cmd.saveCategoryRule({categoryId:category.id,cardId:null,kind:'expense',contains:'cafe',enabled:true}));
  assert.equal(categorySuggestions(h.p,movement.id).length,2);assert.equal(categorySpending(h.p,null,today,today,today),15000);
  const before=financeView(h.p,today).debtCents;h.commit(await h.cmd.setCategory(movement.id,h.p.categories[0]!.id));assert.equal(categorySpending(h.p,h.p.categories[0]!.id,today,today,today),15000);assert.equal(financeView(h.p,today).debtCents,before);
  const id=h.p.classifications[0]!.id;h.commit(await h.cmd.setCategory(movement.id,h.p.categories[1]!.id));assert.equal(h.p.classifications[0]!.id,id);
  await assert.rejects(()=>h.cmd.saveCategoryBudget({categoryId:h.p.categories[0]!.id,payday:'2026-10-16',limitCents:100}),/último día/);
});
test('recurrence month ends never drift; proposals are idempotent, omitted entries stay omitted', async () => {
  const h=harness(),cardId=h.card(),r:Recurrence={cardId,description:'Suscripción',kind:'expense',amountCents:10000,startDate:'2026-10-31',endDate:'2027-04-30',frequency:'monthly',enabled:true,categoryId:null};
  assert.deepEqual(recurrenceDates(r,today,'2027-04-30'),['2026-10-31','2026-11-30','2026-12-31','2027-01-31','2027-02-28','2027-03-31','2027-04-30']);
  h.commit(h.cmd.saveRecurrence(r));const changes=await h.cmd.prepareRecurrences('2027-04-30');assert.equal(changes.filter(c=>c.entityType==='movement').length,7);h.commit(changes);
  assert.equal(financeView(h.p,today).debtCents,1000000);assert.equal((await h.cmd.prepareRecurrences('2027-04-30')).length,0);
  h.commit(h.cmd.changeMovement(h.p.movements[0]!.id,'void'));assert.equal((await h.cmd.prepareRecurrences('2027-04-30')).length,0);
});
test('two offline devices proposing the same recurrence coalesce; differing financial versions need review', async () => {
  const h=harness(),cardId=h.card();h.commit(h.cmd.saveRecurrence({cardId,description:'Mensual',kind:'expense',amountCents:10000,startDate:today,endDate:today,frequency:'monthly',enabled:true,categoryId:null}));
  const changes=await h.cmd.prepareRecurrences(today),vaultId=randomUUID(),initial=ops([...h.p.cards.map(c=>({entityType:'card',entityId:c.id,payload:c.value,voided:false}) as Change),...h.p.balances.map(c=>({entityType:'balance',entityId:c.id,payload:c.value,voided:false}) as Change),...h.p.recurrences.map(c=>({entityType:'recurrence',entityId:c.id,payload:c.value,voided:false}) as Change)],vaultId,randomUUID());
  const first=ops(changes,vaultId,randomUUID()),second=ops(changes,vaultId,randomUUID());const merged=mergeRevisions([...second,...initial,...first]);assert.equal(merged.entities.filter(e=>e.status==='conflict').length,0);
  const p=portfolioFromRevisions(merged);assert.equal(p.movements.length,1);assert.equal(p.occurrences.length,1);
  const m=changes.find(c=>c.entityType==='movement')!;if(m.entityType!=='movement')throw Error();
  const edited=ops([{...m,payload:{...m.payload,amountCents:20000}}],vaultId,randomUUID(),first);
  const other=ops([{...m,payload:{...m.payload,amountCents:30000}}],vaultId,randomUUID(),second);
  assert.equal(mergeRevisions([...initial,...first,...second,...edited,...other]).entities.find(e=>e.entityId===m.entityId)!.status,'conflict');
});
test('independent offline expenses that jointly overdraw a reserved account become explicit financial issues', () => {
  const h=harness(),a=h.account(100000);h.commit(h.cmd.saveSavingsGoal({accountId:a,name:'Reserva',targetCents:80000,targetDate:null,color:'#123456',archived:false}));const goalId=h.p.savingsGoals[0]!.id;
  h.commit(h.cmd.saveSavingsEntry({goalId,date:today,amountCents:60000,direction:'allocate',description:'Reserva'}));
  const one=h.cmd.saveCashEntry({accountId:a,toAccountId:null,cardMovementId:null,date:today,amountCents:30000,kind:'expense',description:'Uno',categoryId:null});
  const two=h.cmd.saveCashEntry({accountId:a,toAccountId:null,cardMovementId:null,date:today,amountCents:30000,kind:'expense',description:'Dos',categoryId:null});
  assert.ok(portfolioIssues(applyChanges(h.p,[...one,...two]),today).some(i=>i.message.includes('Libera')));
});

test('concurrent initial cash corrections and independent movements require explicit historical review', async () => {
  const h=harness(),accountId=h.account(100000),vaultId=randomUUID(),row=h.p.cashAccounts[0]!;
  const initial=ops([{entityType:'cashAccount',entityId:accountId,payload:row.value,voided:false}],vaultId,randomUUID());
  const correction=ops(h.cmd.saveCashAccount({...row.value,openingCents:120000},accountId),vaultId,randomUUID(),initial);
  const expense=ops(h.cmd.saveCashEntry({accountId,toAccountId:null,cardMovementId:null,date:today,amountCents:10000,kind:'expense',description:'Offline',categoryId:null}),vaultId,randomUUID());
  const merged=mergeRevisions([...initial,...correction,...expense]),p=portfolioFromRevisions(merged);
  assert.equal(portfolioIssues(p,today).length,0);
  assert.equal((await historyIssues(merged,p,today)).length,1);
  // A causal acknowledgment names the concurrent movement dependency; no clock decides the winner.
  const reviewed=ops([{entityType:'cashAccount',entityId:accountId,payload:p.cashAccounts[0]!.value,voided:false}],vaultId,randomUUID(),correction);
  const state=mergeRevisions([...initial,...correction,...expense,...reviewed.map(op=>({...op,dependencyOperationIds:expense.map(e=>e.operationId)}))]);
  assert.equal((await historyIssues(state,portfolioFromRevisions(state),today)).length,0);
});
