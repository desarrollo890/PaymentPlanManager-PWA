import { cents, percentage, roundRatio, safeInteger, sumCents } from './money.ts';

export interface PayoffDebt { readonly id: string; readonly name: string; readonly balanceCents: number; readonly minimumCents: number; readonly monthlyRate: string }
export interface PayoffMonth { readonly month: number; readonly interestCents: number; readonly paidCents: number; readonly balanceCents: number; readonly debts: readonly { id: string; name: string; paidCents: number; balanceCents: number }[] }
export interface PayoffResult { readonly strategy: 'avalanche' | 'snowball'; readonly complete: boolean; readonly reason: string | null; readonly interestCents: number; readonly paidCents: number; readonly schedule: readonly PayoffMonth[] }

/** Educational monthly model, never a bank target or a portfolio mutation. */
export function simulatePayoff(input: readonly PayoffDebt[], budgetCents: number, strategy: PayoffResult['strategy'], maxMonths = 360): PayoffResult {
  cents(budgetCents);
  if (budgetCents === 0 || input.length === 0 || input.length > 50 || !Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > 600)
    throw Error('Indica de 1 a 50 deudas y un presupuesto mensual positivo.');
  if (new Set(input.map(d => d.id)).size !== input.length) throw Error('Las deudas deben tener identificadores distintos.');
  const debts = input.map(d => { cents(d.balanceCents); cents(d.minimumCents); const rate = percentage(d.monthlyRate);
    if (!d.id || !d.name.trim() || d.balanceCents <= 0 || d.minimumCents <= 0) throw Error('Cada deuda necesita nombre, saldo y pago mínimo positivos.');
    return { ...d, balance: d.balanceCents, rate }; });
  const schedule: PayoffMonth[] = []; let reason: string | null = null;
  for (let month = 1; month <= maxMonths && debts.some(d => d.balance > 0); month++) {
    const charges = debts.map(d => d.balance ? safeInteger(roundRatio(BigInt(d.balance) * d.rate.numerator, d.rate.denominator)) : 0);
    const opening = sumCents(debts.map(d => d.balance));
    const balances = debts.map((d, i) => sumCents([d.balance, charges[i]!]));
    const minima = balances.map((b, i) => Math.min(b, debts[i]!.minimumCents));
    if (sumCents(minima) > budgetCents) { reason = 'El presupuesto no cubre los pagos mínimos de todas las deudas.'; break; }
    let extra = budgetCents - sumCents(minima); const payments = [...minima];
    const order = debts.map((_, i) => i).sort((a, b) => {
      if (strategy === 'avalanche') { const x = debts[a]!.rate, y = debts[b]!.rate, diff = y.numerator * x.denominator - x.numerator * y.denominator;
        if (diff !== 0n) return diff > 0n ? 1 : -1; }
      return debts[a]!.balance - debts[b]!.balance || debts[a]!.id.localeCompare(debts[b]!.id);
    });
    for (const i of order) { const paid = Math.min(extra, balances[i]! - payments[i]!); payments[i]! += paid; extra -= paid; }
    debts.forEach((d, i) => { d.balance = balances[i]! - payments[i]!; });
    const balanceCents = sumCents(debts.map(d => d.balance));
    schedule.push({ month, interestCents: sumCents(charges), paidCents: sumCents(payments), balanceCents,
      debts: debts.map((d, i) => ({ id: d.id, name: d.name, paidCents: payments[i]!, balanceCents: d.balance })) });
    if (balanceCents >= opening) { reason = 'Los pagos no reducen el saldo total con estas tasas. Aumenta el presupuesto o revisa los datos.'; break; }
  }
  const complete = debts.every(d => d.balance === 0);
  return { strategy, complete, reason: complete ? null : reason ?? `El saldo no se liquida en ${maxMonths} meses.`,
    interestCents: sumCents(schedule.map(m => m.interestCents)), paidCents: sumCents(schedule.map(m => m.paidCents)), schedule };
}
