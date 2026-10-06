import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands } from '@paymentplan/application';
import { applyChanges, emptyPortfolio, financeView, remindersFor, orderOf } from '@paymentplan/domain';
import { historyIssues } from '../../packages/application/src/coherence.ts';
import { mergeRevisions } from '@paymentplan/sync';
import type { Operation } from '@paymentplan/contracts';
test('timestamps retain .NET tick precision and normalized fractions order identically',()=>{
  assert.equal(orderOf({recordedAt:'2026-10-03T12:00:00.123Z',legacyOrdinal:null}),orderOf({recordedAt:'2026-10-03T12:00:00.1230000Z',legacyOrdinal:null}));
  assert(orderOf({recordedAt:'2026-10-03T12:00:00.1230001Z',legacyOrdinal:null})>orderOf({recordedAt:'2026-10-03T12:00:00.1230000Z',legacyOrdinal:null}));
});
test('a concurrent plan correction and payment require review even if quota amounts still fit',async()=>{
  const today='2026-10-03',now='2026-10-03T12:00:00Z',context={today,now,newId:randomUUID};let p=emptyPortfolio();
  p=applyChanges(p,new FinancialCommands(p,context).saveCard({name:'Synthetic',bank:'Bank',limitCents:2000000,cutDay:11,dueDay:25,dueMonthOffset:null,color:'#234E70',initialDebtOrigin:'currentPeriod',archived:false},{date:today,availableCents:1000000,debtCents:1000000}));const cardId=p.cards[0]!.id;
  const planChange=new FinancialCommands(p,context).savePlan({cardId,description:'MSI',principalCents:600000,months:3,interestCents:0,startDate:today,firstCutDate:'2026-10-11',cutDay:11,purchaseId:null,interestIncludedInDebt:false,amortization:null})[0]!;p=applyChanges(p,[planChange]);
  const payment=new FinancialCommands(p,{...context,now:'2026-10-03T14:00:00Z'}).recordMovement({cardId,date:today,amountCents:10000,kind:'payment',description:'Concurrent payment',statementId:null,allocations:[{planId:planChange.entityId,quotaNumber:2,principalCents:10000,interestCents:0}]}).at(-1)!;p=applyChanges(p,[payment]);
  const vaultId=randomUUID(),base={schemaVersion:1,vaultId,deviceId:randomUUID(),deviceSequence:1,dependencyOperationIds:[],groupId:null,groupIndex:0,groupSize:1,updatedAt:now};
  const root={...base,operationId:randomUUID(),entityType:'installment',entityId:planChange.entityId,action:'create',parentRevisionIds:[],payload:planChange.payload} as Operation;
  const edit={...base,deviceId:randomUUID(),operationId:randomUUID(),entityType:'installment',entityId:planChange.entityId,action:'replace',parentRevisionIds:[root.operationId],payload:{...planChange.payload,principalCents:900000}} as Operation;
  const pay={...base,deviceId:randomUUID(),operationId:randomUUID(),entityType:'movement',entityId:payment.entityId,action:'create',parentRevisionIds:[],dependencyOperationIds:[root.operationId],payload:payment.payload} as Operation;
  const state=mergeRevisions([root,edit,pay]);const issues=await historyIssues(state,p,today);assert.equal(issues.length,1);assert(issues[0]!.entityIds.includes(payment.entityId));
  assert.equal((await historyIssues(mergeRevisions([root,edit,{...pay,dependencyOperationIds:[edit.operationId]}]),p,today)).length,0);
});
test('reminder preferences, attended state and postponement preserve balances',()=>{
  const today='2026-10-03',ctx={today,now:'2026-10-03T12:00:00Z',newId:randomUUID};let p=emptyPortfolio();p=applyChanges(p,new FinancialCommands(p,ctx).saveLoan({person:'Synthetic',description:'Loan',principalCents:10000,balanceDate:today,dueDate:'2026-10-05',includeReceivedMoney:false,archived:false}));
  const view=financeView(p,today),reminders=remindersFor(p,view);assert.equal(reminders.length,1);
  p=applyChanges(p,new FinancialCommands(p,ctx).dismissReminder({reminderKey:reminders[0]!.key,postponedUntil:'2026-10-04'}));assert.equal(remindersFor(p,view).length,0);assert.equal(remindersFor(p,financeView(p,'2026-10-04')).length,1);assert.equal(financeView(p,today).loanDebtCents,10000);
});
test('received changes in a closed history require reopening instead of silently keeping an obsolete report',async()=>{
  const today='2026-10-03',context={today,now:'2026-10-03T12:00:00Z',newId:randomUUID};let p=emptyPortfolio();p=applyChanges(p,new FinancialCommands(p,context).saveCard({name:'Synthetic',bank:'Bank',limitCents:2000000,cutDay:11,dueDay:25,dueMonthOffset:null,color:'#234E70',initialDebtOrigin:'currentPeriod',archived:false},{date:today,availableCents:1000000,debtCents:1000000}));
  const cardId=p.cards[0]!.id;p=applyChanges(p,new FinancialCommands(p,context).recordMovement({cardId,date:today,amountCents:10000,kind:'expense',description:'Expense',statementId:null,allocations:[]}));
  p=applyChanges(p,await new FinancialCommands(p,context).closePeriod(cardId,today,today,null,null));assert.equal((await historyIssues(mergeRevisions([]),p,today)).length,0);
  const movement=p.movements[0]!;p={...p,movements:[{...movement,value:{...movement.value,amountCents:12000}}]};assert.equal((await historyIssues(mergeRevisions([]),p,today)).length,1);
  p={...p,closures:p.closures.map(c=>({...c,voided:true}))};assert.equal((await historyIssues(mergeRevisions([]),p,today)).length,0);
});
