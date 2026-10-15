import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands } from '@paymentplan/application';
import { applyChanges, cashBalance, emptyPortfolio, financeView, live } from '@paymentplan/domain';
import type { Change, Portfolio } from '@paymentplan/domain';

const today = '2026-10-20';
function harness() {
  let state: Portfolio = emptyPortfolio(); const context = { today, now: today + 'T18:00:00Z', newId: randomUUID };
  return { get p() { return state; }, get cmd() { return new FinancialCommands(state, context); }, commit(changes: Change[]) { state = applyChanges(state, changes); },
    account(kind: 'cash' | 'debit' = 'debit', archived = false) { this.commit(this.cmd.saveCashAccount({ name: 'Nómina', kind, openingDate: '2026-09-01', openingCents: archived ? 0 : 100000, color: '#123456', archived })); return state.cashAccounts.at(-1)!.id; } };
}
const income = (payrollAccountId: string | null) => ({ income15Cents: 2000000, incomeEndCents: 2500000, expensesCents: 500000, reserveCents: 300000, payrollAccountId });
const budgetFor = (h: ReturnType<typeof harness>, payday: string) => financeView(h.p, today).budgets.find(b => b.payday === payday)!;

test('payroll account must be an active debit account', () => {
  const h = harness();
  assert.throws(() => h.cmd.saveIncome(income(randomUUID())));
  const cash = h.account('cash'), archived = h.account('debit', true);
  assert.throws(() => h.cmd.saveIncome(income(cash)));
  assert.throws(() => h.cmd.saveIncome(income(archived)));
  const a = h.account(); h.commit(h.cmd.saveIncome(income(a)));
});

test('receivePayroll credits the account, marks the budget received and is idempotent', async () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome(income(id)));
  assert.equal(budgetFor(h, '2026-10-15').payroll?.recordedCents, null);
  assert.equal(budgetFor(h, '2026-10-15').payroll?.canRecord, true);
  h.commit(await h.cmd.receivePayroll('2026-10-15', 2000000));
  assert.equal(budgetFor(h, '2026-10-15').payroll?.recordedCents, 2000000);
  assert.equal(budgetFor(h, '2026-10-15').estimated, false);
  const balance = cashBalance(h.p, id, today);
  h.commit(await h.cmd.receivePayroll('2026-10-15', 2100000));
  assert.equal(live(h.p.cashEntries).filter(e => e.value.kind === 'income').length, 1);
  assert.equal(live(h.p.budgets).length, 1);
  assert.equal(cashBalance(h.p, id, today), balance + 100000);
  assert.equal(live(h.p.budgets)[0]!.value.reserveCents, 300000);
});

test('future paydays and missing links are rejected; no link keeps the previous behavior', async () => {
  const h = harness(); await assert.rejects(h.cmd.receivePayroll('2026-10-15', 100));
  const linked = h.account(); h.commit(h.cmd.saveIncome(income(linked)));
  await assert.rejects(h.cmd.receivePayroll('2026-10-31', 100));
  await assert.rejects(h.cmd.receivePayroll('2026-10-15', 0));
  const plain = harness(); plain.commit(plain.cmd.saveIncome({ income15Cents: 1, incomeEndCents: 1, expensesCents: 0, reserveCents: 0 }));
  assert.equal(budgetFor(plain, '2026-10-15').payroll, null);
});

const bank = (h: ReturnType<typeof harness>, chargeAccountId: string | null) => h.commit(h.cmd.saveLoan({ person: 'Santander', description: 'Crédito', principalCents: 27250475, balanceDate: '2026-09-30', dueDate: '2026-12-31',
  loanType: 'bank', annualRateBasisPoints: 3500, paymentFrequency: 'biweekly', termMonths: null, firstPaymentDate: '2026-10-15', amortizationMethod: 'progressive', remainingInstallments: 6,
  nextCapitalCents: 154916, vatBasisPoints: 1600, exemptInterestBasisPoints: 650, includeReceivedMoney: false, archived: false, chargeAccountId }));

test('bank installments are charged to the linked account only after the payroll was confirmed, and never twice', async () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome(income(id)));
  assert.throws(() => bank(h, randomUUID()));
  bank(h, id);
  const obligation = financeView(h.p, today).obligations.find(o => o.dueDate === '2026-10-15')!;
  assert.equal(obligation.chargeAccountName, 'Nómina');
  const loanId = obligation.loanId;
  await assert.rejects(h.cmd.payLoanInstallment(loanId, '2026-10-15', obligation.amountCents), /Confirma primero/);
  h.commit(await h.cmd.receivePayroll('2026-10-15', 2000000));
  const before = cashBalance(h.p, id, today);
  h.commit(await h.cmd.payLoanInstallment(loanId, '2026-10-15', obligation.amountCents));
  assert.equal(cashBalance(h.p, id, today), before - obligation.amountCents);
  assert.equal(live(h.p.loanPayments).length, 1);
  assert.equal(financeView(h.p, today).obligations.some(o => o.dueDate === '2026-10-15'), false);
  await assert.rejects(h.cmd.payLoanInstallment(loanId, '2026-10-15', obligation.amountCents), /ya está pagada/);
  await assert.rejects(h.cmd.payLoanInstallment(loanId, '2026-10-31', 100), /aún no vence/);
});

test('a loan without charge account cannot be paid from an account', async () => {
  const h = harness(); h.commit(h.cmd.saveIncome(income(null))); bank(h, null);
  await assert.rejects(h.cmd.payLoanInstallment(h.p.loans[0]!.id, '2026-10-15', 100), /cuenta de débito/);
});
