import type { Installment } from '@paymentplan/contracts';
import { addMonths, civilDate } from './dates.ts';
import { cents, percentage, roundRatio, safeInteger, sumCents } from './money.ts';

export interface QuotaAmounts { readonly principalCents: number; readonly interestCents: number }
export interface InstallmentQuota extends QuotaAmounts { readonly number: number; readonly cutDate: string }
export type AmortizationTerms = NonNullable<Installment['amortization']>;
export type InstallmentTerms = Pick<Installment, 'principalCents' | 'months' | 'interestCents' | 'startDate' | 'firstCutDate' | 'cutDay' | 'amortization'>;

function validatePrincipal(principalCents: number, months: number): void {
  cents(principalCents);
  if (!Number.isInteger(months) || months < 2 || months > 120 || principalCents < months || principalCents > 100_000_000_000)
    throw new RangeError('Revisa capital, plazo de 2 a 120 meses y mínimo un centavo de capital por cuota.');
}

export function amortize(principalCents: number, months: number, terms: AmortizationTerms): readonly QuotaAmounts[] {
  validatePrincipal(principalCents, months);
  const rate = percentage(terms.monthlyRate), tax = percentage(terms.interestTaxRate);
  if (terms.method === 'bankTable') {
    if (!terms.table || terms.table.length !== months || terms.table.some(row => cents(row.principalCents) === 0 || cents(row.interestCents) < 0)
      || sumCents(terms.table.map(row => row.principalCents)) !== principalCents)
      throw new RangeError('La tabla bancaria debe tener una fila por mes y sumar exactamente el capital.');
    return terms.table.map(row => ({ ...row }));
  }
  if (terms.method !== 'fixedPrincipal' && terms.method !== 'fixedPayment') throw new RangeError('Método de amortización inválido.');
  const principal = BigInt(principalCents), term = BigInt(months);
  const power = (rate.denominator + rate.numerator) ** term, discount = rate.denominator ** term;
  const paymentNumerator = rate.numerator === 0n ? principal : principal * rate.numerator * power;
  const paymentDenominator = rate.numerator === 0n ? term : rate.denominator * (power - discount);
  let remaining = principal;
  const result: QuotaAmounts[] = [];
  for (let index = 0; index < months; index++) {
    const untaxedInterest = roundRatio(remaining * rate.numerator, rate.denominator);
    const interest = untaxedInterest + roundRatio(untaxedInterest * tax.numerator, tax.denominator);
    const calculated = terms.method === 'fixedPrincipal' ? principal / term
      : roundRatio(paymentNumerator - untaxedInterest * paymentDenominator, paymentDenominator);
    const limit = remaining - BigInt(months - index - 1);
    const capital = index === months - 1 ? remaining : calculated < limit ? calculated : limit;
    if (capital <= 0n) throw new RangeError('La cuota no amortiza capital con esta tasa y plazo.');
    result.push({ principalCents: safeInteger(capital), interestCents: safeInteger(interest) });
    remaining -= capital;
  }
  return result;
}

export function installmentQuotas(terms: InstallmentTerms): readonly InstallmentQuota[] {
  validatePrincipal(terms.principalCents, terms.months); cents(terms.interestCents);
  civilDate(terms.startDate); civilDate(terms.firstCutDate);
  if (terms.firstCutDate < terms.startDate) throw new RangeError('El primer corte no puede ser anterior al inicio del plan.');
  if (!Number.isInteger(terms.cutDay) || terms.cutDay < 1 || terms.cutDay > 31) throw new RangeError('Día de corte inválido.');
  const table = terms.amortization ? amortize(terms.principalCents, terms.months, terms.amortization) : null;
  if (table && sumCents(table.map(row => row.interestCents)) !== terms.interestCents)
    throw new RangeError('El interés total no coincide con la tabla de amortización.');
  const principal = Math.floor(terms.principalCents / terms.months), interest = Math.floor(terms.interestCents / terms.months);
  return Array.from({ length: terms.months }, (_, index) => ({
    number: index + 1,
    cutDate: index === 0 ? terms.firstCutDate : addMonths(terms.firstCutDate, index, terms.cutDay),
    principalCents: table?.[index]?.principalCents ?? (index === terms.months - 1 ? terms.principalCents - principal * index : principal),
    interestCents: table?.[index]?.interestCents ?? (index === terms.months - 1 ? terms.interestCents - interest * index : interest),
  }));
}
