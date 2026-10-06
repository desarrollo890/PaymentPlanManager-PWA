import { addDays, cutOnOrAfter } from './dates.ts';
import { live } from './portfolio.ts';
import type { Portfolio } from './portfolio.ts';
import type { FinanceView } from './finance.ts';
export interface Reminder { readonly key: string; readonly title: string; readonly date: string; readonly amountCents: number; readonly overdue: boolean }
export function remindersFor(p: Portfolio, view: FinanceView): Reminder[] {
  const prefs = live(p.reminderPreferences)[0]?.value ?? { enabled: true, cuts: true, payments: true, daysBefore: 3 };
  if (!prefs.enabled) return [];
  const limit = addDays(view.today, prefs.daysBefore), result: Reminder[] = [], compact = (id: string) => id.replaceAll('-', '');
  function add(key: string, title: string, date: string, amountCents: number) { if (date <= limit) result.push({ key, title, date, amountCents, overdue: date < view.today }); }
  for (const card of view.cards) {
    if (prefs.cuts) { const data = p.cards.find(c => c.id === card.id)!.value, date = cutOnOrAfter(data.cutDay, view.today);
      add(`corte:${compact(card.id)}:${compact(date)}`, date === view.today ? `Hoy corta · ${card.name}` : `Próximo corte · ${card.name}`, date, card.cuts.find(c => c.cutDate === date)?.targetCents ?? card.projections.find(c => c.cutDate === date)?.targetCents ?? 0); }
    if (!prefs.payments) continue;
    for (const cut of card.cuts.filter(c => c.current && c.pendingCents > 0)) add(`pago:${compact(cut.id)}`, `${cut.dueDate < view.today ? 'Pago vencido' : 'Pago pendiente'} · ${card.name}`, cut.dueDate, cut.pendingCents);
    for (const m of live(p.movements).filter(m => m.value.cardId === card.id && m.value.kind === 'payment' && (m.value.scheduled || m.value.date > view.today)))
      add(`programado:${compact(m.id)}`, `Confirma tu pago · ${card.name}`, m.value.date, m.value.amountCents);
  }
  if (prefs.payments) {
    for (const o of view.obligations.filter(o => !o.scheduled && o.amountCents > 0)) add(`prestamo:${compact(o.loanId)}:${compact(o.dueDate)}`, `Pago pendiente · ${view.loans.find(l => l.id === o.loanId)?.person}`, o.dueDate, o.amountCents);
    for (const m of live(p.loanPayments).filter(m => m.value.scheduled || m.value.date > view.today)) add(`abono:${compact(m.id)}`, `Confirma tu abono · ${p.loans.find(l => l.id === m.value.loanId)?.value.person}`, m.value.date, m.value.amountCents);
  }
  return result.filter(r => !live(p.reminderStates).some(s => s.value.reminderKey === r.key && (s.value.postponedUntil === null || s.value.postponedUntil > view.today)))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date));
}
