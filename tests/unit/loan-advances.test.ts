import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands } from '@paymentplan/application';
import { applyChanges, emptyPortfolio, financeView } from '@paymentplan/domain';
import type { Change, Portfolio } from '@paymentplan/domain';

const today = '2026-10-20';
function harness() {
  let state: Portfolio = emptyPortfolio(); const context = { today, now: today + 'T18:00:00Z', newId: randomUUID };
  const h = { get p() { return state; }, get cmd() { return new FinancialCommands(state, context); }, commit(changes: Change[]) { state = applyChanges(state, changes); },
    balance() { return financeView(state, today).loans[0]!.balanceCents; } };
  h.commit(h.cmd.saveLoan({ person: 'Ana', description: 'Préstamo', principalCents: 100000, balanceDate: '2026-10-01', dueDate: null, includeReceivedMoney: false, archived: false }));
  return h;
}

test('borrowing again from the same person raises the balance of the same record', () => {
  const h = harness(), id = h.p.loans[0]!.id;
  h.commit(h.cmd.loanPayment(id, '2026-10-05', 40000, 'Abono'));
  assert.equal(h.balance(), 60000);
  h.commit(h.cmd.addLoanAdvance(id, '2026-10-10', 30000, 'Otra vez', false));
  assert.equal(h.balance(), 90000); assert.equal(h.p.loans.length, 1);
  h.commit(h.cmd.loanPayment(id, '2026-10-15', 90000, 'Liquida'));
  assert.equal(h.balance(), 0);
});

test('a settled record is reopened by a new loan, and rules protect the balance', () => {
  const h = harness(), id = h.p.loans[0]!.id;
  h.commit(h.cmd.loanPayment(id, '2026-10-05', 100000, 'Liquida'));
  h.commit(h.cmd.saveLoan({ ...h.p.loans[0]!.value, archived: true }, id));
  h.commit(h.cmd.addLoanAdvance(id, '2026-10-12', 20000, '', false));
  assert.equal(h.p.loans[0]!.value.archived, false); assert.equal(h.balance(), 20000);
  assert.throws(() => h.cmd.addLoanAdvance(id, '2026-12-01', 100, '', false));
  assert.throws(() => h.cmd.addLoanAdvance(id, '2026-09-01', 100, '', false));
  assert.throws(() => h.cmd.deleteLoan(id));
  h.commit(h.cmd.voidLoanAdvance(h.p.loanAdvances[0]!.id));
  assert.equal(h.balance(), 0);
});

test('voiding an advance is rejected when payments would exceed the capital, and new money can count in the budget', () => {
  const h = harness(), id = h.p.loans[0]!.id;
  h.commit(h.cmd.addLoanAdvance(id, '2026-10-10', 50000, '', true));
  h.commit(h.cmd.loanPayment(id, '2026-10-12', 120000, 'Abono'));
  assert.throws(() => h.cmd.voidLoanAdvance(h.p.loanAdvances[0]!.id), /superan/);
  assert.equal(financeView(h.p, today).budgets.reduce((t, b) => t + b.receivedLoanCents, 0), 50000);
});
