import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands } from '@paymentplan/application';
import { applyChanges, assertPortfolio, emptyPortfolio, financeView, periodReport } from '@paymentplan/domain';
import type { Change, Portfolio } from '@paymentplan/domain';
import { assertPayload } from '@paymentplan/contracts';

function harness() {
  let state: Portfolio = emptyPortfolio(), sequence = 0;
  const context = { today: '2026-10-03', get now() { return `2026-10-03T18:00:${(sequence++).toString().padStart(2, '0')}Z`; }, newId: randomUUID };
  return { get p() { return state; }, context,
    get cmd() { return new FinancialCommands(state, context); },
    commit(changes: Change[]) { state = applyChanges(state, changes); },
    addCard() { this.commit(this.cmd.saveCard({ name: 'Personal', bank: 'Banco', limitCents: 2000000, cutDay: 11, dueDay: 25, dueMonthOffset: null,
      color: '#234E70', initialDebtOrigin: 'currentPeriod', archived: false }, { date: '2026-10-03', availableCents: 1000000, debtCents: 1000000 })); return state.cards[0]!.id; },
  };
}
function terms(cardId: string, principalCents = 600000) {
  return { cardId, description: 'MSI', principalCents, months: 3, interestCents: 0, startDate: '2026-10-03', firstCutDate: '2026-10-11', cutDay: 11,
    purchaseId: null, interestIncludedInDebt: false, amortization: null };
}
test('division proposes the current free debt, rejects duplicate financing and preserves state on failure', () => {
  const h = harness(), cardId = h.addCard();
  h.commit(h.cmd.savePlan(terms(cardId))); assert.equal(financeView(h.p, h.context.today).cards[0]!.freeDebtCents, 400000);
  const before = structuredClone(h.p);
  assert.throws(() => h.cmd.savePlan(terms(cardId, 500000)), /disponible/); assert.deepEqual(h.p, before);
  h.commit(h.cmd.recordMovement({ cardId, date: h.context.today, amountCents: 50000, kind: 'expense', description: 'Compra', allocations: [], statementId: null }));
  assert.equal(financeView(h.p, h.context.today).cards[0]!.freeDebtCents, 450000);
});
test('plan editing keeps identity and protects payment history while permitting description correction', () => {
  const h = harness(), cardId = h.addCard(); h.commit(h.cmd.savePlan(terms(cardId))); const plan = h.p.installments[0]!;
  h.commit(h.cmd.savePlan({ ...terms(cardId), principalCents: 900000 }, plan.id));
  assert.equal(h.p.installments[0]!.id, plan.id);
  h.commit(h.cmd.recordMovement({ cardId, date: h.context.today, amountCents: 100000, kind: 'payment', description: 'Anticipo', statementId: null,
    allocations: [{ planId: plan.id, quotaNumber: 2, principalCents: 100000, interestCents: 0 }] }));
  assert.throws(() => h.cmd.savePlan({ ...terms(cardId), principalCents: 800000 }, plan.id), /atribuidos/);
  h.commit(h.cmd.savePlan({ ...terms(cardId), principalCents: 900000, description: 'Descripción corregida' }, plan.id));
  assert.equal(h.p.installments[0]!.value.description, 'Descripción corregida');
  assert.throws(() => h.cmd.recordMovement({ cardId, date: h.context.today, amountCents: 300001, kind: 'payment', description: 'Exceso', statementId: null,
    allocations: [{ planId: plan.id, quotaNumber: 2, principalCents: 300001, interestCents: 0 }] }), /cuota/);
});
test('new MCI purchase records a single expense, computes interest total and can be undone without deleting the purchase', () => {
  const h = harness(), cardId = h.addCard();
  h.commit(h.cmd.savePlan({ ...terms(cardId, 100000), amortization: { method: 'fixedPrincipal', monthlyRate: '2', interestTaxRate: '16', table: null } }, undefined, true));
  assert.equal(h.p.movements.length, 1); assert.equal(h.p.installments[0]!.value.interestCents, 4640);
  assert.equal(financeView(h.p, h.context.today).cards[0]!.debtCents, 1100000);
  h.context.today = '2026-10-12'; const before = financeView(h.p, h.context.today).debtCents;
  h.commit(h.cmd.cancelPlan(h.p.installments[0]!.id)); assert.equal(financeView(h.p, h.context.today).debtCents, before);
  assert.equal(h.p.movements.length, 2); assert.equal(h.p.movements[1]!.value.kind, 'interest');
});
test('scheduled payments do not become real solely by advancing the clock', () => {
  const h = harness(), cardId = h.addCard();
  h.commit(h.cmd.recordMovement({ cardId, date: '2026-10-05', amountCents: 100000, kind: 'payment', description: 'Programado', statementId: null, allocations: [] }));
  h.context.today = '2026-10-06'; assert.equal(financeView(h.p, h.context.today).debtCents, 1000000);
  h.commit(h.cmd.changeMovement(h.p.movements[0]!.id, 'realize')); assert.equal(financeView(h.p, h.context.today).debtCents, 900000);
});
test('bank reconciliation avoids double counting and retains the original period history', () => {
  const h = harness(), cardId = h.addCard();
  h.commit(h.cmd.recordMovement({ cardId, date: h.context.today, amountCents: 100000, kind: 'payment', description: 'Pago', statementId: null, allocations: [] }));
  h.commit(h.cmd.reconcile(cardId, { date: h.context.today, debtCents: 900000, availableCents: 1100000 }));
  assert.equal(financeView(h.p, h.context.today).debtCents, 900000);
  assert.throws(() => h.cmd.changeMovement(h.p.movements[0]!.id, 'void'), /conciliado/);
  const report = periodReport(h.p, cardId, h.context.today, h.context.today, h.context.today);
  assert.equal(report.openingDebtCents, 1000000); assert.equal(report.closingDebtCents, 900000); assert.equal(report.paymentsCents, 100000);
});
test('confirmed bank targets persist as movements recalculate the portfolio', () => {
  const h = harness(), cardId = h.addCard(); h.context.today = '2026-10-11';
  h.commit(h.cmd.saveStatement(cardId, { cutDate: '2026-10-11', dueDate: '2026-10-25', targetCents: 800000, minimumCents: 5000, initialPaidCents: 0 }));
  h.commit(h.cmd.recordMovement({ cardId, date: '2026-10-12', amountCents: 100000, kind: 'expense', description: 'Después del corte', statementId: null, allocations: [] }));
  assert.equal(financeView(h.p, h.context.today).cards[0]!.cuts[0]!.targetCents, 800000);
  assert.throws(() => h.cmd.saveStatement(cardId, { cutDate: '2026-11-11', dueDate: '2026-11-25', targetCents: 1, minimumCents: 0, initialPaidCents: 0 }), /fecha/);
});
test('loan abonos reserve capital and cannot overpay even before the scheduled date', () => {
  const h = harness(); h.commit(h.cmd.saveLoan({ person: 'Persona', description: 'Préstamo', principalCents: 100000, balanceDate: h.context.today, dueDate: '2026-10-20', includeReceivedMoney: false, archived: false }));
  const loanId = h.p.loans[0]!.id; h.commit(h.cmd.loanPayment(loanId, '2026-10-15', 60000, 'Abono futuro'));
  assert.throws(() => h.cmd.loanPayment(loanId, h.context.today, 50000, 'Exceso'), /capital/);
  h.context.today = '2026-10-16'; assert.equal(financeView(h.p, h.context.today).loans[0]!.balanceCents, 100000);
  h.commit(h.cmd.changeLoanPayment(h.p.loanPayments[0]!.id, 'realize')); assert.equal(financeView(h.p, h.context.today).loans[0]!.balanceCents, 40000);
});
test('closed periods protect history until explicitly reopened', async () => {
  const h = harness(), cardId = h.addCard(); h.commit(await h.cmd.closePeriod(cardId, h.context.today, h.context.today, null, null));
  assert.throws(() => h.cmd.recordMovement({ cardId, date: h.context.today, amountCents: 1, kind: 'expense', description: 'Cerrado', statementId: null, allocations: [] }), /Reabre/);
  h.commit(h.cmd.reopenPeriod(h.p.closures[0]!.id));
  h.commit(h.cmd.recordMovement({ cardId, date: h.context.today, amountCents: 1, kind: 'expense', description: 'Abierto', statementId: null, allocations: [] }));
  assert.equal(h.p.movements.length, 1);
});
test('runtime schemas accept fractional interest rates and reject unknown fields and impossible dates', () => {
  const h = harness(), cardId = h.addCard(); h.commit(h.cmd.savePlan({ ...terms(cardId), amortization: { method: 'fixedPrincipal', monthlyRate: '0.5', interestTaxRate: '16', table: null } }));
  assertPortfolio(h.p, h.context.today);
  const card = h.p.cards[0]!.value; assert.throws(() => assertPayload('card', { ...card, token: 'never-persist' }));
  assert.throws(() => assertPayload('balance', { ...h.p.balances[0]!.value, date: '2026-02-30' }));
});
