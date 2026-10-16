import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands } from '@paymentplan/application';
import { applyChanges, budgetFocus, cashBalance, emptyPortfolio, financeView, homeSummary, live, payrollProjection } from '@paymentplan/domain';
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

test('home summary lists pending actions in order and totals cash, goals and debt', async () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome(income(id))); bank(h, id);
  let home = homeSummary(h.p, financeView(h.p, today));
  assert.deepEqual(home.actions.map(a => a.kind), ['payroll', 'payroll', 'payroll', 'loanInstallment']);
  assert.equal(home.actions.find(a => a.kind === 'loanInstallment')?.kind === 'loanInstallment' && (home.actions.find(a => a.kind === 'loanInstallment') as { waitingForPayroll: boolean }).waitingForPayroll, true);
  assert.equal(home.accounts[0]?.payroll, true);
  assert.equal(home.availableCents, 100000);
  h.commit(await h.cmd.receivePayroll('2026-10-15', 2000000));
  home = homeSummary(h.p, financeView(h.p, today));
  assert.equal(home.actions.some(a => a.kind === 'payroll' && a.payday === '2026-10-15'), false);
  const loan = home.actions.find(a => a.kind === 'loanInstallment') as { waitingForPayroll: boolean };
  assert.equal(loan.waitingForPayroll, false);
  assert.equal(home.availableCents, 2100000);
  assert.equal(home.period?.payday, '2026-10-15');
  assert.equal(home.debtCents, financeView(h.p, today).loanDebtCents + financeView(h.p, today).debtCents);
});

test('home summary without data is empty and safe', () => {
  const h = harness(), home = homeSummary(h.p, financeView(h.p, today));
  assert.equal(home.actions.length, 0); assert.equal(home.hasAccounts, false); assert.equal(home.period?.payCents, 0); assert.equal(home.debtCents, 0);
});

test('budget focus tracks status, real vs estimated income and the payroll account balance', async () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome(income(id)));
  let focus = budgetFocus(h.p, financeView(h.p, today))!;
  assert.equal(focus.payday, '2026-10-15'); assert.equal(focus.status, 'toConfirm');
  assert.equal(focus.receivedCents, null); assert.equal(focus.differenceCents, null); assert.equal(focus.canUpdateEstimate, false);
  h.commit(await h.cmd.receivePayroll('2026-10-15', 2100000));
  focus = budgetFocus(h.p, financeView(h.p, today))!;
  assert.equal(focus.status, 'received'); assert.equal(focus.differenceCents, 100000); assert.equal(focus.canUpdateEstimate, true);
  assert.equal(focus.accountBalanceCents, 2200000); assert.equal(focus.accountFreeCents, 2200000);
  h.commit(h.cmd.saveIncome({ ...income(id), income15Cents: 2100000 }));
  assert.equal(budgetFocus(h.p, financeView(h.p, today))!.canUpdateEstimate, false);
  assert.equal(budgetFor(h, '2026-10-31').status, 'expected');
});

test('budget focus warns about a projected shortfall and whether the reserve covers it', () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome({ ...income(id), income15Cents: 100 }));
  const focus = budgetFocus(h.p, financeView(h.p, today))!, first = focus.overdrafts[0]!;
  assert.equal(first.payday, '2026-10-15'); assert.equal(first.shortCents, 799900); assert.equal(first.reserveCovers, false);
  h.commit(h.cmd.saveIncome({ ...income(id), income15Cents: 600000 }));
  const covered = budgetFocus(h.p, financeView(h.p, today))!.overdrafts[0]!;
  assert.equal(covered.shortCents, 200000); assert.equal(covered.reserveCovers, true);
});

test('payroll projection applies incomes, card and loan charges in order and flags a shortfall', async () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome(income(id))); bank(h, id);
  const view = financeView(h.p, today), projection = payrollProjection(h.p, view)!;
  assert.equal(projection.accountId, id); assert.equal(projection.startCents, 100000);
  assert.ok(projection.events.some(e => e.kind === 'income' && e.date === '2026-10-31' && e.amountCents === 2500000));
  const loan = projection.events.find(e => e.kind === 'loan')!;
  assert.equal(loan.overdue, true); assert.equal(loan.date, today); assert.ok(loan.amountCents < 0);
  assert.equal(projection.events[0]!.balanceCents, 100000 + projection.events[0]!.amountCents);
  assert.ok(projection.lowestCents < 0); assert.equal(projection.firstShortfall?.date, today);
  assert.equal(payrollProjection(harness().p, financeView(harness().p, today)), null);
});

test('reconcile adjusts the account to the real bank balance and rejects a matching one', () => {
  const h = harness(), id = h.account();
  assert.throws(() => h.cmd.reconcileCashAccount(id, 100000), /ya coincide/);
  h.commit(h.cmd.reconcileCashAccount(id, 150000)); assert.equal(cashBalance(h.p, id, today), 150000);
  h.commit(h.cmd.reconcileCashAccount(id, 90000)); assert.equal(cashBalance(h.p, id, today), 90000);
  assert.deepEqual(live(h.p.cashEntries).map(e => e.value.kind), ['income', 'expense']);
  assert.throws(() => h.cmd.reconcileCashAccount(id, -1));
});

test('receivePayroll also deposits the voucher amount in its own account, idempotently', async () => {
  const h = harness(), main = h.account(), vouchers = h.account();
  h.commit(h.cmd.saveIncome({ ...income(main), voucherCents: 150000, voucherAccountId: vouchers }));
  h.commit(await h.cmd.receivePayroll('2026-10-15', 2000000)); h.commit(await h.cmd.receivePayroll('2026-10-15', 2000000));
  const entries = live(h.p.cashEntries).filter(e => e.value.accountId === vouchers && e.value.date === '2026-10-15');
  assert.equal(entries.length, 1); assert.equal(entries[0]!.value.amountCents, 150000);
  assert.equal(cashBalance(h.p, vouchers, today), 100000 + 150000);
  assert.throws(() => h.cmd.saveIncome({ ...income(main), voucherCents: 100, voucherAccountId: null }));
});
test('tandas charge the payroll account on payday, project the budget and collect on the turn date', async () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome(income(id)));
  assert.throws(() => h.cmd.saveTanda({ name: 'Oficina', contributionCents: 50000, participants: 4, turn: 5, firstDate: '2026-10-15', archived: false }));
  assert.throws(() => h.cmd.saveTanda({ name: 'Oficina', contributionCents: 50000, participants: 4, turn: 2, firstDate: '2026-10-16', archived: false }));
  h.commit(h.cmd.saveTanda({ name: 'Oficina', contributionCents: 50000, participants: 4, turn: 2, firstDate: '2026-10-15', archived: false }));
  h.commit(h.cmd.saveIncome(income(id)));
  assert.equal(live(h.p.incomes)[0]!.value.tandas?.length, 1, 'saving income keeps tandas');
  assert.equal(budgetFor(h, '2026-10-15').tandaContributionCents, 50000);
  assert.equal(budgetFor(h, '2026-10-31').tandaPayoutCents, 200000);
  h.commit(await h.cmd.receivePayroll('2026-10-15', 2000000)); h.commit(await h.cmd.receivePayroll('2026-10-15', 2000000));
  const charges = live(h.p.cashEntries).filter(e => e.value.kind === 'expense' && e.value.description.startsWith('Tanda Oficina'));
  assert.equal(charges.length, 1); assert.equal(charges[0]!.value.amountCents, 50000);
  await assert.rejects(() => h.cmd.receiveTandaPayout(live(h.p.incomes)[0]!.value.tandas![0]!.id));
});
test('tanda payout is deposited once in the payroll account on the turn date', async () => {
  const h = harness(), id = h.account(); h.commit(h.cmd.saveIncome(income(id)));
  h.commit(h.cmd.saveTanda({ name: 'Familia', contributionCents: 50000, participants: 4, turn: 1, firstDate: '2026-10-15', archived: false }));
  const tandaId = live(h.p.incomes)[0]!.value.tandas![0]!.id;
  h.commit(await h.cmd.receiveTandaPayout(tandaId)); h.commit(await h.cmd.receiveTandaPayout(tandaId));
  const entries = live(h.p.cashEntries).filter(e => e.value.description === 'Cobro de tanda Familia');
  assert.equal(entries.length, 1); assert.equal(entries[0]!.value.amountCents, 200000); assert.equal(entries[0]!.value.date, '2026-10-15');
});