import type { CashEntry, Recurrence } from '@paymentplan/contracts';
import type { FinancialIssue } from './validation.ts';
import type { FinancialRecord, Portfolio } from './portfolio.ts';
import { live } from './portfolio.ts';
import { addDays, addMonths, civilDate, paydaysThrough, paydayFor } from './dates.ts';
import { sumCents } from './money.ts';

export function normalizeMerchant(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/\s+/g, ' ').trim(); }
export function categorySuggestions(p: Portfolio, movementId: string): string[] {
  const m = p.movements.find(r => r.id === movementId && !r.voided)?.value;
  if (!m || m.kind === 'payment') return [];
  return [...new Set(live(p.categoryRules).filter(r => r.value.enabled && r.value.kind === m.kind &&
    (r.value.cardId === null || r.value.cardId === m.cardId) && normalizeMerchant(m.description).includes(normalizeMerchant(r.value.contains)) &&
    live(p.categories).some(c => c.id === r.value.categoryId && !c.value.archived)).map(r => r.value.categoryId))];
}
export function movementCategory(p: Portfolio, movementId: string): string | null { return live(p.classifications).find(c => c.value.movementId === movementId)?.value.categoryId ?? null; }
export function categorySpending(p: Portfolio, categoryId: string | null, from: string, to: string, today: string): number {
  return sumCents([
    ...live(p.movements).filter(m => !m.value.scheduled && m.value.kind !== 'payment' && m.value.date >= from && m.value.date <= to && m.value.date <= today && movementCategory(p, m.id) === categoryId).map(m => m.value.amountCents),
    ...live(p.cashEntries).filter(e => e.value.kind === 'expense' && e.value.categoryId === categoryId && e.value.date >= from && e.value.date <= to && e.value.date <= today).map(e => e.value.amountCents),
  ]);
}
export function recurrenceDates(r: Recurrence, from: string, through: string): string[] {
  civilDate(from); civilDate(through);
  if (through < from || !r.enabled) return [];
  const end = r.endDate !== null && r.endDate < through ? r.endDate : through;
  if (end < r.startDate) return [];
  const result: string[] = [];
  if (r.frequency === 'paydays') return [...paydaysThrough(r.startDate > from ? r.startDate : from, end)];
  let weeklyDate = r.startDate;
  for (let index = 0; ; index++) {
    if (index > 10000) throw Error('La recurrencia supera el horizonte admitido.');
    const date = r.frequency === 'weekly' ? weeklyDate : addMonths(r.startDate, index, civilDate(r.startDate).day);
    if (date > end) break;
    if (date >= from) result.push(date);
    if (r.frequency === 'weekly') weeklyDate = addDays(weeklyDate, 7);
  }
  return result;
}
function entryDelta(e: CashEntry, accountId: string): number {
  if (e.kind === 'transfer') return e.toAccountId === accountId ? e.amountCents : e.accountId === accountId ? -e.amountCents : 0;
  return e.accountId === accountId ? e.kind === 'income' ? e.amountCents : -e.amountCents : 0;
}
export function cashBalance(p: Portfolio, accountId: string, date: string): number {
  const account = live(p.cashAccounts).find(a => a.id === accountId);
  if (!account) throw Error('Cuenta ausente.');
  if (date < account.value.openingDate) return 0;
  return sumCents([account.value.openingCents, ...live(p.cashEntries).filter(e => e.value.date >= account.value.openingDate && e.value.date <= date).map(e => entryDelta(e.value, accountId))]);
}
export function goalSaved(p: Portfolio, goalId: string, date: string): number {
  return sumCents(live(p.savingsEntries).filter(e => e.value.goalId === goalId && e.value.date <= date).map(e => e.value.direction === 'allocate' ? e.value.amountCents : -e.value.amountCents));
}
export function accountReserved(p: Portfolio, accountId: string, date: string): number {
  return sumCents(live(p.savingsGoals).filter(g => g.value.accountId === accountId).map(g => goalSaved(p, g.id, date)));
}
export function cashView(p: Portfolio, today: string) {
  const accounts = live(p.cashAccounts).map(a => ({ ...a, balanceCents: cashBalance(p, a.id, today), reservedCents: accountReserved(p, a.id, today), freeCents: sumCents([cashBalance(p, a.id, today), -accountReserved(p, a.id, today)]) }));
  const goals = live(p.savingsGoals).map(g => {
    const savedCents = goalSaved(p, g.id, today), remainingCents = Math.max(0, g.value.targetCents - savedCents);
    const paydays = g.value.targetDate !== null && g.value.targetDate >= today ? paydaysThrough(today, g.value.targetDate) : [];
    const perPaydayCents = paydays.length ? Math.floor(remainingCents / paydays.length) + (remainingCents % paydays.length ? 1 : 0) : remainingCents;
    return { ...g, savedCents, remainingCents, perPaydayCents, paydays };
  });
  return { accounts, goals, totalCents: sumCents(accounts.map(a => a.balanceCents)), reservedCents: sumCents(accounts.map(a => a.reservedCents)), freeCents: sumCents(accounts.map(a => a.freeCents)) };
}
export function extensionIssues(p: Portfolio, today: string): FinancialIssue[] {
  const issues: FinancialIssue[] = [], issue = (message: string, ...entityIds: string[]) => issues.push({ message, entityIds });
  const categories = live(p.categories), accounts = live(p.cashAccounts), goals = live(p.savingsGoals), entries = live(p.cashEntries), savings = live(p.savingsEntries);
  const refs: readonly [string, readonly FinancialRecord<object>[]][] = [['categoryId', categories], ['accountId', accounts], ['toAccountId', accounts], ['goalId', goals], ['recurrenceId', live(p.recurrences)]];
  const rows: readonly FinancialRecord<object>[] = [...live(p.classifications), ...live(p.categoryRules), ...live(p.categoryBudgets), ...live(p.recurrences), ...live(p.occurrences), ...entries, ...goals, ...savings];
  for (const row of rows) for (const [key, targets] of refs) if (key in row.value) {
    const id = (row.value as Record<string, unknown>)[key];
    if (id !== null && !targets.some(t => t.id === id)) issue('El registro tiene una referencia ausente: ' + key + '.', row.id, String(id));
  }
  for (const row of live(p.classifications)) {
    const m = p.movements.find(m => m.id === row.value.movementId);
    if (!m || m.value.kind === 'payment') issue('Solo puedes clasificar compras, intereses y comisiones.', row.id);
  }
  const unique = (values: readonly { id: string; key: string }[], message: string) => { if (new Set(values.map(r => r.key)).size !== values.length) issue(message, ...values.map(r => r.id)); };
  unique(live(p.classifications).map(r => ({ id: r.id, key: r.value.movementId })), 'Un movimiento tiene dos categorías.');
  unique(live(p.categoryBudgets).map(r => ({ id: r.id, key: r.value.categoryId + ':' + r.value.payday })), 'Hay límites repetidos para una categoría y quincena.');
  for (const b of live(p.categoryBudgets)) if (paydayFor(b.value.payday) !== b.value.payday) issue('El límite debe corresponder al 15 o al último día del mes.', b.id);
  for (const r of live(p.recurrences)) if (r.value.endDate !== null && r.value.endDate < r.value.startDate) issue('La recurrencia termina antes de empezar.', r.id);
  unique(live(p.occurrences).map(r => ({ id: r.id, key: r.value.recurrenceId + ':' + r.value.date })), 'Hay propuestas repetidas para la misma recurrencia y fecha.');
  for (const o of live(p.occurrences)) if (!p.movements.some(m => m.id === o.value.movementId)) issue('La propuesta perdió su movimiento.', o.id);
  unique(entries.filter(e => e.value.cardMovementId !== null).map(e => ({ id: e.id, key: e.value.cardMovementId! })), 'Un pago de tarjeta se descontó de dos cuentas.');
  for (const a of accounts) if (a.value.openingDate > today) issue('El saldo inicial de la cuenta no puede ser futuro.', a.id);
  for (const e of entries) {
    const v = e.value, account = accounts.find(a => a.id === v.accountId), destination = accounts.find(a => a.id === v.toAccountId);
    if (v.date > today || (account && v.date < account.value.openingDate) || (destination && v.date < destination.value.openingDate)) issue('El movimiento de cuenta debe ser real y posterior a sus saldos iniciales.', e.id);
    if ((v.kind === 'transfer') !== (v.toAccountId !== null) || v.toAccountId === v.accountId || (v.kind === 'cardPayment') !== (v.cardMovementId !== null)) issue('Revisa la cuenta destino y la relación con el pago de tarjeta.', e.id);
    if (v.categoryId !== null && v.kind !== 'expense') issue('Solo los gastos de cuenta llevan categoría.', e.id);
    if (v.cardMovementId !== null) {
      const m = live(p.movements).find(m => m.id === v.cardMovementId);
      if (!m || m.value.kind !== 'payment' || m.value.scheduled || m.value.date !== v.date || m.value.amountCents !== v.amountCents) issue('El cargo de cuenta debe coincidir con el pago real de tarjeta vinculado.', e.id, v.cardMovementId);
    }
  }
  for (const e of savings) {
    const g = goals.find(g => g.id === e.value.goalId), a = accounts.find(a => a.id === g?.value.accountId);
    if (e.value.date > today || (a && e.value.date < a.value.openingDate)) issue('La reserva debe ser real y posterior al saldo inicial de la cuenta.', e.id);
  }
  const checkpoints = [...new Set([today, ...accounts.map(a => a.value.openingDate), ...entries.map(e => e.value.date), ...savings.map(e => e.value.date)])].sort();
  for (const date of checkpoints) {
    for (const g of goals) if (goalSaved(p, g.id, date) < 0) issue('No puedes liberar más dinero del que tiene reservado la meta.', g.id, ...savings.filter(e => e.value.goalId === g.id).map(e => e.id));
    for (const a of accounts) {
      const balance = cashBalance(p, a.id, date), reserved = accountReserved(p, a.id, date);
      if (balance < 0 || reserved > balance) issue('El saldo de la cuenta no cubre sus movimientos y reservas. Libera dinero de las metas antes de gastarlo o transferirlo.', a.id, ...entries.filter(e => e.value.accountId === a.id || e.value.toAccountId === a.id).map(e => e.id), ...goals.filter(g => g.value.accountId === a.id).map(g => g.id), ...savings.filter(e => goals.some(g => g.id === e.value.goalId && g.value.accountId === a.id)).map(e => e.id));
      if (date === today && a.value.archived && (balance !== 0 || reserved !== 0)) issue('Solo puedes archivar cuentas vacías y sin reservas.', a.id);
    }
  }
  for (const g of goals) {
    if (g.value.archived && goalSaved(p, g.id, today) !== 0) issue('Libera la reserva antes de archivar la meta.', g.id);
    if (g.value.targetDate !== null && g.value.targetDate > addMonths(today, 120)) issue('La fecha objetivo admite hasta diez años de proyección.', g.id);
  }
  return issues;
}
