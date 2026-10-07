import { canonical } from '@paymentplan/contracts';
import { addDays, civilDate } from './dates.ts';
import { activePlans } from './finance.ts';
import { installmentQuotas } from './installments.ts';
import { sumCents } from './money.ts';
import { live, orderOf } from './portfolio.ts';
import type { Portfolio } from './portfolio.ts';

// Activity is not a historical balance reconstruction: it can include future
// planned entries and does not require a bank balance before the range.
export function activityReport(p: Portfolio, from: string, to: string, today: string) {
  civilDate(from); civilDate(to); civilDate(today);
  if (to < from || to > addDays(from, 3660)) throw Error('Selecciona un periodo de hasta 3660 días.');
  return live(p.cards).map(card => {
    const rows = live(p.movements).filter(m => m.value.cardId === card.id && m.value.date >= from && m.value.date <= to);
    const real = rows.filter(m => !m.value.scheduled && m.value.date <= today);
    const amount = (kind: string) => sumCents(real.filter(m => m.value.kind === kind).map(m => m.value.amountCents));
    const paymentsCents = amount('payment'), expensesCents = amount('expense'), feesCents = amount('fee');
    const interestCents = sumCents([amount('interest'), ...activePlans(p, card.id).filter(r => !r.value.interestIncludedInDebt)
      .flatMap(r => installmentQuotas(r.value)).filter(q => q.cutDate >= from && q.cutDate <= to && q.cutDate <= today &&
        // A cancelled plan's accrued interest has become an ordinary movement.
        q.interestCents > 0).map(q => q.interestCents)]);
    return { cardId: card.id, name: card.value.name, from, to, paymentsCents, expensesCents, feesCents, interestCents,
      changeCents: sumCents([expensesCents, feesCents, interestCents, -paymentsCents]), realCount: real.length, plannedCount: rows.length - real.length };
  });
}

export function periodReport(p: Portfolio, cardId: string, from: string, to: string, today: string) {
  civilDate(from); civilDate(to);
  if (to < from || to > today || to > addDays(from, 366)) throw Error('El cierre debe abarcar hasta 366 días ya transcurridos.');
  const bases = live(p.balances).filter(b => b.value.cardId === cardId);
  const base = bases.filter(b => b.value.date < from).sort((a, b) => b.value.date.localeCompare(a.value.date) || orderOf(b.value).localeCompare(orderOf(a.value)))[0]
    ?? bases.filter(b => b.value.date === from).sort((a, b) => orderOf(a.value).localeCompare(orderOf(b.value)))[0];
  if (!base) throw Error('No hay un saldo base anterior al periodo. No se inventan saldos históricos.');
  const movements = live(p.movements).filter(m => m.value.cardId === cardId && !m.value.scheduled && m.value.date >= base.value.date && m.value.date <= to && !base.value.includedMovementIds.includes(m.id));
  const quotas = activePlans(p, cardId).filter(r => !r.value.interestIncludedInDebt).flatMap(r => installmentQuotas(r.value))
    .filter(q => (q.cutDate > base.value.date || (!base.value.interestIncluded && q.cutDate === base.value.date)) && q.cutDate <= to);
  const changeBefore = sumCents(movements.filter(m => m.value.date < from).map(m => m.value.kind === 'payment' ? -m.value.amountCents : m.value.amountCents));
  const openingDebtCents = sumCents([base.value.debtCents, changeBefore, ...quotas.filter(q => q.cutDate < from).map(q => q.interestCents)]);
  const openingAvailableCents = sumCents([base.value.availableCents, base.value.debtCents, -openingDebtCents]);
  const rows = movements.filter(m => m.value.date >= from);
  const amounts = (kind: string) => sumCents(rows.filter(m => m.value.kind === kind).map(m => m.value.amountCents));
  const paymentsCents = amounts('payment'), expensesCents = amounts('expense'), feesCents = amounts('fee');
  const interestCents = sumCents([amounts('interest'), ...quotas.filter(q => q.cutDate >= from).map(q => q.interestCents)]);
  const difference = sumCents([expensesCents, feesCents, interestCents, -paymentsCents]);
  const values = { cardId, from, to, openingDebtCents, openingAvailableCents, paymentsCents, expensesCents, feesCents, interestCents,
    closingDebtCents: sumCents([openingDebtCents, difference]), closingAvailableCents: sumCents([openingAvailableCents, -difference]) };
  return { ...values, fingerprintInput: canonical({ base, values, movements: movements.toSorted((a, b) => a.id.localeCompare(b.id)), quotas }) };
}
