import type { Loan, LoanPayment } from '@paymentplan/contracts';
import { addMonths, civilDate } from './dates.ts';
import { roundRatio, safeInteger, sumCents } from './money.ts';
import type { FinancialRecord } from './portfolio.ts';

const MONTHLY_RATE_DENOMINATOR = 120_000n;

export interface BankInstallment {
  readonly number: number;
  readonly dueDate: string;
  readonly paymentCents: number;
  readonly interestCents: number;
  readonly principalCents: number;
}

export function bankLoanSchedule(loan: Loan): BankInstallment[] {
  if (loan.loanType !== 'bank' || loan.annualRateBasisPoints == null || loan.termMonths == null || loan.firstPaymentDate === null || loan.firstPaymentDate === undefined)
    throw new RangeError('El préstamo bancario requiere tasa, plazo y fecha de primera cuota.');
  civilDate(loan.firstPaymentDate);
  const rate = BigInt(loan.annualRateBasisPoints), term = loan.termMonths;
  const monthlyRate = Number(rate) / Number(MONTHLY_RATE_DENOMINATOR);
  const regularPayment = rate === 0n
    ? Math.ceil(loan.principalCents / term)
    : Math.round(loan.principalCents * monthlyRate / (1 - Math.pow(1 + monthlyRate, -term)));
  if (!Number.isSafeInteger(regularPayment) || regularPayment <= 0)
    throw new RangeError('No se pudo calcular una cuota bancaria válida.');

  let balance = loan.principalCents;
  const schedule: BankInstallment[] = [];
  for (let index = 0; index < term && balance > 0; index++) {
    const interestCents = safeInteger(roundRatio(BigInt(balance) * rate, MONTHLY_RATE_DENOMINATOR));
    const balanceWithInterest = safeInteger(BigInt(balance) + BigInt(interestCents));
    const paymentCents = index === term - 1 ? balanceWithInterest : Math.min(balanceWithInterest, Math.max(regularPayment, interestCents + 1));
    const principalCents = Math.min(balance, Math.max(0, paymentCents - interestCents));
    schedule.push({ number: index + 1, dueDate: addMonths(loan.firstPaymentDate, index), paymentCents, interestCents, principalCents });
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
  const events = realized.map(r => ({ date: r.value.date, amountCents: r.value.amountCents, payment: true }))
    .concat(schedule.filter(row => row.dueDate <= today).map(row => ({ date: row.dueDate, amountCents: 0, payment: false })))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.payment) - Number(b.payment));
  for (const event of events) {
    if (!event.payment) {
      const rate = BigInt(loan.annualRateBasisPoints ?? 0);
      balance = safeInteger(BigInt(balance) + roundRatio(BigInt(balance) * rate, MONTHLY_RATE_DENOMINATOR));
    } else {
      overpaidCents = safeInteger(BigInt(overpaidCents) + BigInt(Math.max(0, event.amountCents - balance)));
      balance = Math.max(0, balance - event.amountCents);
      paidCents = safeInteger(BigInt(paidCents) + BigInt(event.amountCents));
    }
  }

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
