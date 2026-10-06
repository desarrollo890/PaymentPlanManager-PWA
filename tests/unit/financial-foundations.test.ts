import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { amortize, installmentQuotas, paydayFor, cutOnOrAfter, cutOnOrBefore, dueDateFor,
  suggestedPaymentDate, paydaysThrough, civilDate, addDays, addMonths, cents, sumCents, percentage, roundRatio } from '@paymentplan/domain';
import type { AmortizationTerms, InstallmentTerms, InstallmentQuota, QuotaAmounts } from '@paymentplan/domain';

interface Reference {
  paydays: { dueDate: string; expectedPayday: string }[];
  rounding: { principalCents: number; months: number; quotas: Omit<InstallmentQuota, 'interestCents'>[] };
  amortization: { method: string; monthlyRate: string; interestTaxRate: string; principalCents: number;
    months: number; bankTable: QuotaAmounts[] | null; quotas: QuotaAmounts[] }[];
}
const reference: Reference = JSON.parse(readFileSync(new URL('../fixtures/financial-reference.v1.json', import.meta.url), 'utf8'));
const schedule = { cutDay: 11, dueDay: 25, dueMonthOffset: null };
const plan: InstallmentTerms = { principalCents: 100000, months: 3, interestCents: 0,
  startDate: '2026-10-03', firstCutDate: '2026-10-11', cutDay: 11, amortization: null };

test('all 240 payday vectors match the independent .NET financial reference', () => {
  assert.equal(reference.paydays.length, 240);
  for (const row of reference.paydays) assert.equal(paydayFor(row.dueDate), row.expectedPayday, row.dueDate);
});

test('all 120 MSI quotas preserve the reference cent and calendar through the final payment', () => {
  const actual = installmentQuotas({ ...plan, ...reference.rounding });
  assert.deepEqual(actual.map(({ interestCents: _, ...row }) => row), reference.rounding.quotas);
  assert.equal(sumCents(actual.map(row => row.principalCents)), 12001);
  assert.equal(sumCents(actual.map(row => row.interestCents)), 0);
});

for (const row of reference.amortization) test(`MCI ${row.method} matches every .NET capital/interest cent`, () => {
  const methods: Record<string, AmortizationTerms['method']> = { CuotaFija: 'fixedPayment', CapitalFijo: 'fixedPrincipal', TablaBanco: 'bankTable' };
  const method = methods[row.method]; assert(method);
  const terms = { method, monthlyRate: row.monthlyRate, interestTaxRate: row.interestTaxRate, table: row.bankTable };
  const actual = amortize(row.principalCents, row.months, terms);
  assert.deepEqual(actual, row.quotas);
  assert.equal(sumCents(actual.map(q => q.principalCents)), row.principalCents);
  assert.deepEqual(installmentQuotas({ ...plan, amortization: terms, interestCents: sumCents(actual.map(q => q.interestCents)) })
    .map(({ principalCents, interestCents }) => ({ principalCents, interestCents })), actual);
});

test('new initial balance in the current period selects the upcoming October cut', () => {
  assert.equal(cutOnOrAfter(11, '2026-10-03'), '2026-10-11');
  assert.equal(cutOnOrBefore(11, '2026-10-03'), '2026-09-11');
  assert.equal(cutOnOrAfter(11, '2026-10-11'), '2026-10-11');
  assert.equal(cutOnOrAfter(11, '2026-10-12'), '2026-11-11');
});

test('Plata grace month maps November cut to December due date and November income', () => {
  const plata = { cutDay: 2, dueDay: 2, dueMonthOffset: 1 };
  const cut = cutOnOrAfter(plata.cutDay, '2026-10-03');
  assert.equal(cut, '2026-11-02');
  assert.equal(dueDateFor(plata, cut), '2026-12-02');
  assert.equal(paydayFor(dueDateFor(plata, cut)), '2026-11-30');
  assert.equal(dueDateFor(schedule, '2026-10-11'), '2026-10-25');
  assert.equal(dueDateFor({ ...schedule, dueDay: 11 }, '2026-10-11'), '2026-11-11');
  assert.throws(() => dueDateFor({ ...plata, dueMonthOffset: 0 }, cut), /posterior/);
});

test('leap years, clipped month ends and December boundaries never drift to the 28th', () => {
  assert.equal(cutOnOrAfter(31, '2024-02-15'), '2024-02-29');
  assert.equal(cutOnOrAfter(31, '2023-02-15'), '2023-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2024-12-31', 1), '2025-01-01');
  assert.equal(addMonths('2024-02-29', 1, 31), '2024-03-31');
  const quotas = installmentQuotas({ ...plan, firstCutDate: '2026-10-31', cutDay: 31, months: 6 });
  assert.deepEqual(quotas.map(q => q.cutDate), ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
});

test('payment margin never moves income to another payday or before it is received', () => {
  assert.equal(suggestedPaymentDate('2026-10-15', 10), '2026-10-15');
  assert.equal(suggestedPaymentDate('2026-10-31', 2), '2026-10-31');
  assert.equal(suggestedPaymentDate('2026-11-02', 2), '2026-10-31');
  assert.equal(suggestedPaymentDate('2026-10-25', 2), '2026-10-23');
  assert.throws(() => suggestedPaymentDate('2026-10-25', 11));
});

test('payday horizon includes every period through November next year', () => {
  const dates = paydaysThrough('2026-10-03', '2027-11-25');
  assert.equal(dates.length, 27);
  assert.equal(dates[0], '2026-10-15'); assert.equal(dates.at(-1), '2027-11-15');
  assert(dates.includes('2027-02-28'));
  assert.deepEqual(paydaysThrough('2024-02-16', '2024-03-14'), ['2024-02-29']);
  assert.throws(() => paydaysThrough('2027-01-01', '2026-01-01'));
});

test('civil calculations are identical in Mexico, UTC and far eastern time zones', () => {
  const code = `import { paydayFor, dueDateFor } from './packages/domain/src/index.ts'; console.log(JSON.stringify([
    paydayFor('2024-02-29'), paydayFor('2026-11-02'), dueDateFor({cutDay:2,dueDay:2,dueMonthOffset:1},'2026-11-02')]));`;
  const outputs = ['America/Mexico_City', 'UTC', 'Pacific/Kiritimati'].map(TZ => {
    const run = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { cwd: new URL('../../', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr); return run.stdout;
  });
  assert(outputs.every(value => value === outputs[0]));
});

test('interest and explicit tax use exact half-away rounding without float conversions', () => {
  assert.equal(roundRatio(1n, 2n), 1n); assert.equal(roundRatio(-1n, 2n), -1n);
  const quotas = amortize(100, 2, { method: 'fixedPrincipal', monthlyRate: '0.5', interestTaxRate: '50', table: null });
  assert.deepEqual(quotas, [{ principalCents: 50, interestCents: 2 }, { principalCents: 50, interestCents: 0 }]);
  assert.deepEqual(percentage('0.00000001'), { numerator: 1n, denominator: 10000000000n });
  const noInterest = amortize(100001, 3, { method: 'fixedPrincipal', monthlyRate: '0', interestTaxRate: '16', table: null });
  assert.deepEqual(noInterest.map(q => q.principalCents), [33333, 33333, 33335]);
  assert.equal(sumCents(noInterest.map(q => q.interestCents)), 0);
});

test('invalid money, dates, rates and inconsistent tables are rejected', () => {
  for (const value of [NaN, Infinity, 0.1, -1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => cents(value));
  assert.equal(sumCents([Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1]), 1);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1]));
  for (const date of ['2026-02-29', '1900-02-29', '2026-13-01', '2026-00-01', '2026-04-31', '2026-10-03T00:00:00Z']) assert.throws(() => civilDate(date));
  assert.deepEqual(civilDate('2000-02-29'), { year: 2000, month: 2, day: 29 });
  for (const rate of ['-1', '100.01', '2e0', 'NaN', '2,5', '0.000000001']) assert.throws(() => percentage(rate));
  assert.throws(() => installmentQuotas({ ...plan, months: 121 }));
  assert.throws(() => installmentQuotas({ ...plan, principalCents: 2 }));
  assert.throws(() => installmentQuotas({ ...plan, firstCutDate: '2026-09-11' }));
  assert.throws(() => amortize(100, 2, { method: 'bankTable', monthlyRate: '0', interestTaxRate: '0', table: [{ principalCents: 100, interestCents: 0 }] }));
  assert.throws(() => installmentQuotas({ ...plan, interestCents: 0,
    amortization: { method: 'fixedPrincipal', monthlyRate: '2', interestTaxRate: '16', table: null } }), /no coincide/);
});

test('bank tables are copied and inputs stay unchanged', () => {
  const terms: AmortizationTerms = { method: 'bankTable', monthlyRate: '0', interestTaxRate: '0',
    table: [{ principalCents: 50, interestCents: 1 }, { principalCents: 50, interestCents: 0 }] };
  const before = structuredClone(terms);
  const result = amortize(100, 2, terms);
  Object.assign(result[0]!, { principalCents: 999 });
  assert.deepEqual(terms, before);
});
