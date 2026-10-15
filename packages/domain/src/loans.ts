import type { Loan, LoanPayment } from '@paymentplan/contracts';
import { addMonths, civilDate, daysInMonth, paydaysThrough } from './dates.ts';
import { roundRatio, safeInteger, sumCents } from './money.ts';
import type { FinancialRecord } from './portfolio.ts';
import { DEFAULT_VAT_BASIS_POINTS, daysBetween, periodInterestCents, progressiveDueDates, progressiveSchedule } from './progressive-loans.ts';
import type { ProgressiveLoanTerms } from './progressive-loans.ts';

const MONTHLY_RATE_DENOMINATOR = 120_000n;
const BIWEEKLY_RATE_DENOMINATOR = 240_000n;
export type LoanPaymentFrequency = 'monthly' | 'biweekly';

export interface BankInstallment {
  readonly number: number;
  readonly dueDate: string;
  readonly paymentCents: number;
  readonly interestCents: number;
  readonly principalCents: number;
  readonly vatCents?: number;
}

export const isProgressiveLoan = (loan: Loan): boolean => loan.loanType === 'bank' && loan.amortizationMethod === 'progressive';

export function progressiveTerms(loan: Loan): ProgressiveLoanTerms {
  if (!isProgressiveLoan(loan) || loan.annualRateBasisPoints == null || loan.remainingInstallments == null || loan.nextCapitalCents == null || !loan.firstPaymentDate)
    throw new RangeError('El crédito progresivo requiere saldo actual, último pago, siguiente cuota, cuotas restantes, abono a capital base y tasa.');
  return { balanceCents: loan.principalCents, lastPaymentDate: loan.balanceDate, firstPaymentDate: loan.firstPaymentDate,
    remainingInstallments: loan.remainingInstallments, nextCapitalCents: loan.nextCapitalCents, annualRateBasisPoints: loan.annualRateBasisPoints,
    frequency: loan.paymentFrequency ?? 'monthly', vatBasisPoints: loan.vatBasisPoints ?? DEFAULT_VAT_BASIS_POINTS,
    exemptInterestBasisPoints: loan.exemptInterestBasisPoints ?? 0,
    exemptInterestByDate: Object.fromEntries((loan.exemptInterestOverrides ?? []).map(item => [item.dueDate, item.amountCents])) };
}

export function progressiveLastDueDate(loan: Loan): string {
  const terms = progressiveTerms(loan);
  return progressiveDueDates(terms.firstPaymentDate, terms.remainingInstallments, terms.frequency).at(-1)!;
}

export function bankLoanDueDates(firstPaymentDate: string, termMonths: number, frequency: LoanPaymentFrequency = 'monthly'): string[] {
  civilDate(firstPaymentDate);
  if (frequency === 'monthly') return Array.from({ length: termMonths }, (_, index) => addMonths(firstPaymentDate, index));
  const { year, month, day } = civilDate(firstPaymentDate);
  if (day !== 15 && day !== daysInMonth(year, month)) throw new RangeError('La primera cuota quincenal debe ser el día 15 o el último día del mes.');
  const until = addMonths(firstPaymentDate, termMonths);
  return paydaysThrough(firstPaymentDate, until).filter(date => date < until);
}

export function bankLoanLastDueDate(firstPaymentDate: string, termMonths: number, frequency: LoanPaymentFrequency = 'monthly'): string {
  const dates = bankLoanDueDates(firstPaymentDate, termMonths, frequency);
  const last = dates.at(-1);
  if (!last) throw new RangeError('El préstamo requiere al menos una cuota.');
  return last;
}

export function bankLoanSchedule(loan: Loan): BankInstallment[] {
  if (isProgressiveLoan(loan)) return progressiveSchedule(progressiveTerms(loan)).map(row => ({ number: row.number, dueDate: row.dueDate,
    paymentCents: row.paymentCents, interestCents: row.interestCents, principalCents: row.capitalCents, vatCents: row.vatCents }));
  if (loan.loanType !== 'bank' || loan.annualRateBasisPoints == null || loan.termMonths == null || loan.firstPaymentDate === null || loan.firstPaymentDate === undefined)
    throw new RangeError('El préstamo bancario requiere tasa, plazo y fecha de primera cuota.');
  civilDate(loan.firstPaymentDate);
  const rate = BigInt(loan.annualRateBasisPoints), frequency = loan.paymentFrequency ?? 'monthly';
  const dates = bankLoanDueDates(loan.firstPaymentDate, loan.termMonths, frequency), term = dates.length;
  const rateDenominator = frequency === 'biweekly' ? BIWEEKLY_RATE_DENOMINATOR : MONTHLY_RATE_DENOMINATOR;
  const periodRate = Number(rate) / Number(rateDenominator);
  const regularPayment = rate === 0n
    ? Math.ceil(loan.principalCents / term)
    : Math.round(loan.principalCents * periodRate / (1 - Math.pow(1 + periodRate, -term)));
  if (!Number.isSafeInteger(regularPayment) || regularPayment <= 0)
    throw new RangeError('No se pudo calcular una cuota bancaria válida.');

  let balance = loan.principalCents;
  const schedule: BankInstallment[] = [];
  for (let index = 0; index < term && balance > 0; index++) {
    const interestCents = safeInteger(roundRatio(BigInt(balance) * rate, rateDenominator));
    const balanceWithInterest = safeInteger(BigInt(balance) + BigInt(interestCents));
    const paymentCents = index === term - 1 ? balanceWithInterest : Math.min(balanceWithInterest, Math.max(regularPayment, interestCents + 1));
    const principalCents = Math.min(balance, Math.max(0, paymentCents - interestCents));
    schedule.push({ number: index + 1, dueDate: dates[index]!, paymentCents, interestCents, principalCents });
    balance -= principalCents;
  }
  return schedule;
}

export interface BankLoanProjection {
  readonly balanceCents: number;
  readonly paidCents: number;
  readonly scheduledCents: number;
  readonly overpaidCents: number;
  readonly installments: readonly { readonly dueDate: string; readonly amountCents: number; readonly scheduled: boolean }[];
}

export function bankLoanProjection(loan: Loan, paymentRecords: readonly FinancialRecord<LoanPayment>[], today: string): BankLoanProjection {
  const schedule = bankLoanSchedule(loan), payments = paymentRecords.filter(r => !r.voided && r.value.loanId && r.value.date >= loan.balanceDate)
    .sort((a, b) => a.value.date.localeCompare(b.value.date));
  const realized = payments.filter(r => !r.value.scheduled && r.value.date <= today);
  const scheduled = payments.filter(r => r.value.scheduled || r.value.date > today);
  let balance = loan.principalCents, paidCents = 0, overpaidCents = 0;
  const progressive = isProgressiveLoan(loan);
  const events = progressive ? [] : realized.map(r => ({ date: r.value.date, amountCents: r.value.amountCents, payment: true }))
    .concat(schedule.filter(row => row.dueDate <= today).map(row => ({ date: row.dueDate, amountCents: 0, payment: false })))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.payment) - Number(b.payment));
  for (const event of events) {
    if (!event.payment) {
      const rate = BigInt(loan.annualRateBasisPoints ?? 0), denominator = (loan.paymentFrequency ?? 'monthly') === 'biweekly'
        ? BIWEEKLY_RATE_DENOMINATOR : MONTHLY_RATE_DENOMINATOR;
      balance = safeInteger(BigInt(balance) + roundRatio(BigInt(balance) * rate, denominator));
    } else {
      overpaidCents = safeInteger(BigInt(overpaidCents) + BigInt(Math.max(0, event.amountCents - balance)));
      balance = Math.max(0, balance - event.amountCents);
      paidCents = safeInteger(BigInt(paidCents) + BigInt(event.amountCents));
    }
  }

  if (progressive) paidCents = sumCents(realized.map(r => r.value.amountCents));
  const realizedBySlot = new Map<number, number>();
  for (const payment of realized) {
    let remaining = payment.value.amountCents;
    const candidates = schedule.map((row, index) => ({ row, index }))
      .sort((a, b) => Number(b.row.dueDate <= payment.value.date) - Number(a.row.dueDate <= payment.value.date) || a.index - b.index);
    for (const { row, index } of candidates) {
      if (remaining <= 0) break;
      const paid = realizedBySlot.get(index) ?? 0;
      const allocation = Math.min(remaining, Math.max(0, row.paymentCents - paid));
      if (allocation) realizedBySlot.set(index, paid + allocation);
      remaining -= allocation;
    }
  }
  if (progressive) {
    // Monto Utilizado: capital que sigue vivo después de las cuotas cubiertas por pagos reales.
    balance = loan.principalCents - sumCents(schedule.filter((row, index) => (realizedBySlot.get(index) ?? 0) >= row.paymentCents).map(row => row.principalCents));
    overpaidCents = Math.max(0, paidCents - sumCents(schedule.map(row => row.paymentCents)));
  }
  const scheduledBySlot = new Map<number, FinancialRecord<LoanPayment>[]>();
  for (const payment of scheduled) {
    let slot = schedule.findIndex((row, index) => row.dueDate <= payment.value.date &&
      (realizedBySlot.get(index) ?? 0) < row.paymentCents && !scheduledBySlot.has(index));
    if (slot < 0) slot = schedule.findIndex((row, index) => row.dueDate >= payment.value.date &&
      (realizedBySlot.get(index) ?? 0) < row.paymentCents && !scheduledBySlot.has(index));
    if (slot < 0) slot = schedule.length;
    const group = scheduledBySlot.get(slot) ?? [];
    group.push(payment); scheduledBySlot.set(slot, group);
  }
  const installments = schedule.flatMap((row, index) => {
    const paid = realizedBySlot.get(index) ?? 0;
    if (paid >= row.paymentCents) return [];
    const planned = scheduledBySlot.get(index);
    return [{ dueDate: planned?.[0]?.value.date ?? row.dueDate,
      amountCents: planned ? sumCents(planned.map(payment => payment.value.amountCents)) : row.paymentCents - paid,
      scheduled: Boolean(planned) }];
  });
  for (const [slot, group] of scheduledBySlot) if (slot >= schedule.length)
    for (const payment of group) installments.push({ dueDate: payment.value.date, amountCents: payment.value.amountCents, scheduled: true });
  return { balanceCents: balance, paidCents, scheduledCents: sumCents(scheduled.map(r => r.value.amountCents)), overpaidCents, installments };
}

export interface LoanBalanceStates {
  readonly usedAmountCents: number;
  readonly statementBalanceCents: number;
  readonly accruedInterestCents: number;
  readonly balanceToDateCents: number;
  readonly lastStatementDate: string;
}

// Monto Utilizado: deuda real viva. Saldo al Corte: cierre del último corte del calendario.
// Saldo al Día: Monto Utilizado más interés devengado desde ese corte hasta hoy (sin IVA).
export function progressiveLoanStates(loan: Loan, paymentRecords: readonly FinancialRecord<LoanPayment>[], today: string): LoanBalanceStates {
  const schedule = progressiveSchedule(progressiveTerms(loan)), used = bankLoanProjection(loan, paymentRecords, today).balanceCents;
  const cut = schedule.filter(row => row.dueDate <= today).at(-1);
  const lastStatementDate = cut?.dueDate ?? loan.balanceDate, statementBalanceCents = cut?.closingBalanceCents ?? loan.principalCents;
  const accruedInterestCents = used > 0 ? periodInterestCents(used, loan.annualRateBasisPoints ?? 0, Math.max(0, daysBetween(lastStatementDate, today))) : 0;
  return { usedAmountCents: used, statementBalanceCents, accruedInterestCents, balanceToDateCents: used + accruedInterestCents, lastStatementDate };
}
