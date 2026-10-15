import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands } from '@paymentplan/application';
import { applyChanges, emptyPortfolio, financeView, periodInterestCents, periodVatCents, progressiveSchedule } from '@paymentplan/domain';
import type { Change, Portfolio, ProgressiveLoanTerms } from '@paymentplan/domain';

// Filas reales de Santander (saldo inicial, capital, interés, IVA, pago total) en centavos. El saldo inicial se dedujo del interés (35 % / 360 × 15 días).
const real = [[27702000, 148336, 403984, 60113, 612433], [27553664, 150498, 401822, 60387, 612707],
  [27403166, 152691, 399629, 56633, 608953], [27250475, 154916, 397404, 53675, 605995]] as const;

const terms: ProgressiveLoanTerms = { balanceCents: 27250475, lastPaymentDate: '2026-09-30', firstPaymentDate: '2026-10-15', remainingInstallments: 6,
  nextCapitalCents: 154916, annualRateBasisPoints: 3500, frequency: 'biweekly', vatBasisPoints: 1600, exemptInterestBasisPoints: 650 };

test('real statement rows: 35 % over 360 with 15-day quincenas reproduces interest and capital growth', () => {
  real.forEach(([balance, capital, interest, vat, payment], index) => {
    assert.equal(capital + interest + vat, payment);
    if (index > 0) assert(Math.abs(real[index - 1]![0] - real[index - 1]![1] - balance) <= 2);
    assert(Math.abs(periodInterestCents(balance, 3500, 15) - interest) <= 4, `interest row ${index + 1}`);
  });
  const rows = progressiveSchedule({ ...terms, balanceCents: real[0]![0], nextCapitalCents: real[0]![1], lastPaymentDate: '2026-08-15', firstPaymentDate: '2026-08-31', remainingInstallments: 8 });
  for (let i = 0; i < 4; i++) assert(Math.abs(rows[i]!.capitalCents - real[i]![1]) <= 5, `capital row ${i + 1}: ${rows[i]!.capitalCents} vs ${real[i]![1]}`);
  assert.deepEqual(rows.slice(0, 4).map(row => row.days), [15, 15, 15, 15]);
});
test('interest uses real days over a 360-day year and VAT only taxes the non-exempt share', () => {
  assert.equal(periodInterestCents(10_000_000, 3500, 15), 145833);
  assert.equal(periodInterestCents(10_000_000, 3500, 16), 155556);
  assert.equal(periodInterestCents(10_000_000, 3500, 14), 136111);
  assert.equal(periodVatCents(100000, 650, 1600), 14960);
  assert.equal(periodVatCents(100000, 0, 1600), 16000);
  assert.equal(periodVatCents(100000, 10000, 1600), 0);
});
test('bank movements: VAT is 16 % of the taxable interest only; exempt interest is a separate variable amount', () => {
  // [interés gravado, interés exento, capital, IVA] facturados el 15-abr, 30-abr, 15-may, 31-may, 15-jun y 30-jun.
  const statements = [[308278, 113818, 130224, 49324], [386088, 34111, 132121, 61774], [395730, 22543, 134047, 63317],
    [416319, 0, 136001, 66611], [414337, 0, 137983, 66294], [412326, 0, 139994, 65972]] as const;
  statements.forEach(([taxable, , , vat], i) => assert(Math.abs(periodVatCents(taxable, 0, 1600) - vat) <= 1, `VAT row ${i + 1}`));
  const rows = progressiveSchedule({ ...terms, balanceCents: 28941500, nextCapitalCents: 130224, lastPaymentDate: '2026-03-31', firstPaymentDate: '2026-04-15',
    remainingInstallments: 8, exemptInterestBasisPoints: 0 });
  statements.forEach(([, , capital], i) => assert(Math.abs(rows[i]!.capitalCents - capital) <= 10, `capital ${i + 1}: ${rows[i]!.capitalCents} vs ${capital}`));
});
test('progressive schedule starts at the current balance, grows capital and closes at zero with a forced final capital', () => {
  const rows = progressiveSchedule(terms);
  assert.equal(rows.length, 6);
  assert.equal(rows[0]!.openingBalanceCents, terms.balanceCents);
  assert.equal(rows[0]!.capitalCents, 154916);
  assert.equal(rows[0]!.previousDate, '2026-09-30');
  assert.equal(rows[0]!.days, 15);
  assert.deepEqual(rows.slice(0, 3).map(row => row.dueDate), ['2026-10-15', '2026-10-31', '2026-11-15']);
  assert(rows[1]!.capitalCents > rows[0]!.capitalCents);
  rows.forEach((row, i) => {
    assert.equal(row.paymentCents, row.capitalCents + row.interestCents + row.vatCents);
    assert.equal(row.closingBalanceCents, row.openingBalanceCents - row.capitalCents);
    if (i) assert.equal(row.openingBalanceCents, rows[i - 1]!.closingBalanceCents);
  });
  assert.equal(rows.at(-1)!.closingBalanceCents, 0);
  assert.equal(rows.at(-1)!.capitalCents, rows.at(-1)!.openingBalanceCents);
});
test('extra capital shortens the term and lowers later interest', () => {
  const base = progressiveSchedule({ ...terms, remainingInstallments: 200 }), extra = progressiveSchedule({ ...terms, remainingInstallments: 200 }, { 2: 5_000_000 });
  assert(base.length > 10);
  assert.equal(extra[1]!.extraCapitalCents, 5_000_000);
  assert.equal(extra[1]!.capitalCents, base[1]!.capitalCents + 5_000_000);
  assert(extra[2]!.interestCents < base[2]!.interestCents);
  assert(extra.length < base.length);
  assert.equal(extra.at(-1)!.closingBalanceCents, 0);
});
test('progressive loans expose used amount, cut balance and balance to date', () => {
  let state: Portfolio = emptyPortfolio(), sequence = 0;
  const context = { today: '2026-10-20', get now() { return `2026-10-20T18:00:${(sequence++).toString().padStart(2, '0')}Z`; }, newId: randomUUID };
  const commit = (changes: Change[]) => { state = applyChanges(state, changes); };
  commit(new FinancialCommands(state, context).saveLoan({ person: 'Santander', description: 'Crédito progresivo', principalCents: terms.balanceCents,
    balanceDate: terms.lastPaymentDate, dueDate: '2026-12-31', loanType: 'bank', annualRateBasisPoints: 3500, paymentFrequency: 'biweekly', termMonths: null,
    firstPaymentDate: terms.firstPaymentDate, amortizationMethod: 'progressive', remainingInstallments: 6, nextCapitalCents: terms.nextCapitalCents,
    vatBasisPoints: 1600, exemptInterestBasisPoints: 650, includeReceivedMoney: false, archived: false }));
  const rows = progressiveSchedule(terms), loan = financeView(state, context.today).loans[0]!;
  assert.equal(loan.progressive!.usedAmountCents, terms.balanceCents);
  assert.equal(loan.progressive!.statementBalanceCents, rows[0]!.closingBalanceCents);
  assert.equal(loan.progressive!.lastStatementDate, '2026-10-15');
  assert.equal(loan.progressive!.accruedInterestCents, periodInterestCents(terms.balanceCents, 3500, 5));
  assert.equal(loan.progressive!.balanceToDateCents, terms.balanceCents + loan.progressive!.accruedInterestCents);
  assert.equal(loan.installmentPaymentCents, rows[0]!.paymentCents);
  const id = state.loans[0]!.id;
  commit(new FinancialCommands(state, context).loanPayment(id, '2026-10-16', rows[0]!.paymentCents, 'Cuota 1'));
  const paid = financeView(state, context.today).loans[0]!;
  assert.equal(paid.progressive!.usedAmountCents, terms.balanceCents - rows[0]!.capitalCents);
  assert.throws(() => new FinancialCommands(state, context).saveLoan({ ...state.loans[0]!.value, nextCapitalCents: 1 }, id), /condiciones de amortización/);
});
