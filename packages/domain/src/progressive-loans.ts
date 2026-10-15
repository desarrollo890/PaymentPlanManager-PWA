import { addMonths, civilDate, daysInMonth, paydaysThrough } from './dates.ts';
import { roundRatio, safeInteger } from './money.ts';

export type ProgressiveFrequency = 'monthly' | 'biweekly';
export const DEFAULT_VAT_BASIS_POINTS = 1600;
const DAY_COUNT_BASIS = 360n;

export interface ProgressiveLoanTerms {
  readonly balanceCents: number;
  readonly lastPaymentDate: string;
  readonly firstPaymentDate: string;
  readonly remainingInstallments: number;
  readonly nextCapitalCents: number;
  readonly annualRateBasisPoints: number;
  readonly frequency: ProgressiveFrequency;
  readonly vatBasisPoints?: number;
  readonly exemptInterestBasisPoints?: number;
}

export interface ProgressiveRow {
  readonly number: number;
  readonly previousDate: string;
  readonly dueDate: string;
  readonly days: number;
  readonly openingBalanceCents: number;
  readonly capitalCents: number;
  readonly extraCapitalCents: number;
  readonly interestCents: number;
  readonly vatCents: number;
  readonly paymentCents: number;
  readonly closingBalanceCents: number;
}

export function daysBetween(from: string, to: string): number {
  const a = civilDate(from), b = civilDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

export function progressiveDueDates(firstPaymentDate: string, count: number, frequency: ProgressiveFrequency): string[] {
  const { year, month, day } = civilDate(firstPaymentDate);
  if (frequency === 'monthly') return Array.from({ length: count }, (_, index) => addMonths(firstPaymentDate, index));
  if (day !== 15 && day !== daysInMonth(year, month)) throw new RangeError('La primera cuota quincenal debe ser el día 15 o el último día del mes.');
  return paydaysThrough(firstPaymentDate, addMonths(firstPaymentDate, Math.ceil(count / 2) + 2)).slice(0, count);
}

export function periodsPerYear(frequency: ProgressiveFrequency): number { return frequency === 'biweekly' ? 24 : 12; }

// Interés = saldo × tasa anual / 360 × días reales; se redondea una sola vez al centavo.
export function periodInterestCents(balanceCents: number, annualRateBasisPoints: number, days: number): number {
  return safeInteger(roundRatio(BigInt(balanceCents) * BigInt(annualRateBasisPoints) * BigInt(days), 10_000n * DAY_COUNT_BASIS));
}

// IVA = interés gravado × tasa de IVA; la parte exenta no causa impuesto.
export function periodVatCents(interestCents: number, exemptBasisPoints: number, vatBasisPoints: number): number {
  return safeInteger(roundRatio(BigInt(interestCents) * BigInt(10_000 - exemptBasisPoints) * BigInt(vatBasisPoints), 100_000_000n));
}

export function progressiveSchedule(terms: ProgressiveLoanTerms, extraCapitalByInstallment: Readonly<Record<number, number>> = {}): ProgressiveRow[] {
  const { balanceCents, remainingInstallments, nextCapitalCents, annualRateBasisPoints, frequency } = terms;
  const vat = terms.vatBasisPoints ?? DEFAULT_VAT_BASIS_POINTS, exempt = terms.exemptInterestBasisPoints ?? 0;
  if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0) throw new RangeError('El saldo actual debe ser mayor a cero.');
  if (!Number.isInteger(remainingInstallments) || remainingInstallments < 1) throw new RangeError('Indica las cuotas restantes.');
  if (!Number.isSafeInteger(nextCapitalCents) || nextCapitalCents <= 0) throw new RangeError('Indica el siguiente abono a capital.');
  if (terms.firstPaymentDate <= terms.lastPaymentDate) throw new RangeError('La siguiente cuota debe ser posterior al último pago.');
  const dates = progressiveDueDates(terms.firstPaymentDate, remainingInstallments, frequency);
  // El capital crece con el factor teórico del periodo (tasa anual / periodos por año), sin depender de los días reales.
  const growth = 1 + annualRateBasisPoints / 10_000 / periodsPerYear(frequency);
  const rows: ProgressiveRow[] = [];
  let balance = balanceCents, base = nextCapitalCents, previous = terms.lastPaymentDate;
  for (let index = 0; index < dates.length && balance > 0; index++) {
    const dueDate = dates[index]!, days = daysBetween(previous, dueDate), extra = Math.max(0, extraCapitalByInstallment[index + 1] ?? 0);
    const interest = periodInterestCents(balance, annualRateBasisPoints, days);
    const last = index === dates.length - 1;
    const capital = last ? balance : Math.min(balance, Math.round(base) + extra);
    const vatCents = periodVatCents(interest, exempt, vat);
    rows.push({ number: index + 1, previousDate: previous, dueDate, days, openingBalanceCents: balance, capitalCents: capital,
      extraCapitalCents: last ? 0 : Math.min(extra, capital), interestCents: interest, vatCents, paymentCents: capital + interest + vatCents,
      closingBalanceCents: balance - capital });
    balance -= capital; base *= growth; previous = dueDate;
  }
  return rows;
}
