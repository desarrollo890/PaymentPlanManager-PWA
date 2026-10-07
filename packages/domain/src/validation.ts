import { assertPayload } from '@paymentplan/contracts';
import type { EntityPayloads, EntityType } from '@paymentplan/contracts';
import { live } from './portfolio.ts';
import type { FinancialRecord, Portfolio } from './portfolio.ts';
import { activePlans, cardBalance, planAccruedInterest, quotaBalances, financeView } from './finance.ts';
import { installmentQuotas } from './installments.ts';
import { civilDate, cutOnOrAfter, dueDateFor } from './dates.ts';
import { extensionIssues } from './extensions.ts';
import { sumCents } from './money.ts';

export const entityTables = { card: 'cards', balance: 'balances', movement: 'movements', installment: 'installments', statement: 'statements', loan: 'loans',
  loanPayment: 'loanPayments', income: 'incomes', budget: 'budgets', category: 'categories', classification: 'classifications', categoryRule: 'categoryRules', categoryBudget: 'categoryBudgets', recurrence: 'recurrences', occurrence: 'occurrences', cashAccount: 'cashAccounts', cashEntry: 'cashEntries', savingsGoal: 'savingsGoals', savingsEntry: 'savingsEntries', closure: 'closures', reminderPreferences: 'reminderPreferences', reminderState: 'reminderStates' } as const;
export type FinancialEntityType = Exclude<EntityType, 'device'>;
export type Change = { [K in FinancialEntityType]: { readonly entityType: K; readonly entityId: string; readonly payload: EntityPayloads[K]; readonly voided: boolean } }[FinancialEntityType];
export interface FinancialIssue { readonly message: string; readonly entityIds: readonly string[] }
export function applyChanges(portfolio: Portfolio, changes: readonly Change[]): Portfolio {
  const result = { ...portfolio };
  for (const change of changes) {
    const key = entityTables[change.entityType];
    const rows = result[key] as readonly FinancialRecord<EntityPayloads[FinancialEntityType]>[];
    (result as unknown as Record<string, unknown>)[key] = [...rows.filter(r => r.id !== change.entityId), { id: change.entityId, value: change.payload, voided: change.voided }];
  }
  return result;
}
function structuralIssues(p: Portfolio, today: string): FinancialIssue[] {
  const issues: FinancialIssue[] = [];
  function issue(message: string, ...entityIds: string[]) { issues.push({ message, entityIds }); }
  const ids = new Set<string>();
  for (const [type, table] of Object.entries(entityTables)) for (const row of p[table as keyof Portfolio]) {
    try {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.id) || ids.has(row.id)) throw Error('Identidad repetida o inválida.');
      ids.add(row.id); assertPayload(type as FinancialEntityType, row.value);
    } catch (e) { issue(e instanceof Error ? e.message : 'Datos inválidos.', row.id); }
  }
  if (issues.length) return issues;
  const cards = live(p.cards), cardIds = new Set(cards.map(c => c.id)), loanIds = new Set(live(p.loans).map(l => l.id));
  for (const [type, table] of Object.entries(entityTables)) for (const row of live(p[table as keyof Portfolio] as readonly FinancialRecord<object>[])) {
    if ('cardId' in row.value && row.value.cardId !== null && !cardIds.has(row.value.cardId as string)) issue(`El registro ${type} hace referencia a una tarjeta ausente.`, row.id, row.value.cardId as string);
    if ('loanId' in row.value && !loanIds.has(row.value.loanId as string)) issue('El abono hace referencia a un préstamo ausente.', row.id, row.value.loanId as string);
  }
  for (const card of cards) {
    const bases = live(p.balances).filter(b => b.value.cardId === card.id);
    if (!bases.length) issue('La tarjeta no tiene saldo inicial.', card.id);
    if (bases.length && card.value.archived) {
      try { if (cardBalance(p, card.id, today).debtCents !== 0 || quotaBalances(p, card.id, today).some(q => q.principalCents + q.interestCents + q.futureInterestCents > 0)
        || live(p.movements).some(m => m.value.cardId === card.id && (m.value.scheduled || m.value.date > today))) issue('La tarjeta archivada aún tiene deuda, cuotas o movimientos programados. Reactívala o revisa sus registros.', card.id); } catch { issue('No se pudo comprobar el saldo de la tarjeta archivada.', card.id); }
    }
    for (const b of bases) {
      if (b.value.date > today) issue('El saldo bancario no puede tener fecha futura.', b.id);
      if (b.value.includedMovementIds.some(id => !p.movements.some(m => m.id === id && m.value.cardId === card.id && !m.voided && !m.value.scheduled && m.value.date <= b.value.date)))
        issue('La conciliación incorpora movimientos ausentes, anulados o posteriores al saldo.', b.id);
    }
    try { dueDateFor(card.value, cutOnOrAfter(card.value.cutDay, today)); } catch { issue('El mes de pago debe producir un vencimiento posterior al corte.', card.id); }
    const cuts = live(p.statements).filter(s => s.value.cardId === card.id);
    if (new Set(cuts.map(s => s.value.cutDate)).size !== cuts.length) issue('Hay dos cortes para la misma fecha. Resuelve cuál conservar.', ...cuts.map(s => s.id));
    for (const cut of cuts) if (cut.value.dueDate <= cut.value.cutDate || cut.value.minimumCents > cut.value.targetCents || cut.value.initialPaidCents > cut.value.targetCents)
      issue('Revisa vencimiento, pago mínimo y pago inicial del corte.', cut.id);
    const plans = activePlans(p, card.id);
    const purchases = plans.filter(r => r.value.purchaseId !== null).map(r => r.value.purchaseId);
    if (new Set(purchases).size !== purchases.length) issue('Una compra fue financiada más de una vez.', ...plans.map(r => r.id));
    for (const plan of plans) {
      try { installmentQuotas(plan.value); } catch (e) { issue(e instanceof Error ? e.message : 'Plan inválido.', plan.id); }
      if (plan.value.purchaseId) {
        const purchase = live(p.movements).find(m => m.id === plan.value.purchaseId);
        if (!purchase || purchase.value.cardId !== card.id || purchase.value.kind !== 'expense' || purchase.value.amountCents < plan.value.principalCents)
          issue('El capital del plan supera la compra o no corresponde a una compra de esta tarjeta.', plan.id);
      }
    }
    if (bases.length && plans.length && !issues.some(i => i.entityIds.some(id => plans.some(r => r.id === id)))) {
      const start = plans.map(r => r.value.startDate).sort()[0]!;
      const repayments = sumCents(live(p.movements).filter(m => m.value.cardId === card.id && m.value.kind === 'payment' && !m.value.scheduled && m.value.date >= start && m.value.date <= today).map(m => m.value.amountCents));
      const classified = sumCents(plans.filter(r => r.value.startDate <= today).map(r => r.value.principalCents + (r.value.interestIncludedInDebt ? r.value.interestCents : planAccruedInterest(r.value, today))));
      if (classified > sumCents([cardBalance(p, card.id, today).debtCents, repayments])) issue('Los planes reclasifican más deuda que la registrada. Revisa los planes y la conciliación bancaria.', ...plans.map(r => r.id));
    }
    const closures = live(p.closures).filter(c => c.value.cardId === card.id);
    for (const closure of closures) {
      const c = closure.value;
      if (c.to < c.from || c.to > today || closures.some(other => other.id !== closure.id && other.value.from <= c.to && other.value.to >= c.from)) issue('Hay cierres inválidos o superpuestos.', closure.id);
      if (sumCents([c.openingDebtCents, c.expensesCents, c.feesCents, c.interestCents, -c.paymentsCents]) !== c.closingDebtCents ||
        sumCents([c.openingAvailableCents, -c.expensesCents, -c.feesCents, -c.interestCents, c.paymentsCents]) !== c.closingAvailableCents) issue('El cierre no cuadra.', closure.id);
    }
  }
  for (const movement of live(p.movements)) {
    const m = movement.value;
    if (m.statementId !== null && (m.kind !== 'payment' || !live(p.statements).some(s => s.id === m.statementId && s.value.cardId === m.cardId && s.value.cutDate <= m.date)))
      issue('El pago debe referirse a un corte de la tarjeta y no ser anterior a él.', movement.id);
    if (m.allocations.length && (m.kind !== 'payment' || sumCents(m.allocations.map(a => a.principalCents + a.interestCents)) > m.amountCents ||
      new Set(m.allocations.map(a => `${a.planId}:${a.quotaNumber}`)).size !== m.allocations.length)) issue('El desglose de cuotas supera el pago o tiene posiciones repetidas.', movement.id);
    for (const a of m.allocations) {
      const plan = p.installments.find(r => r.id === a.planId && r.value.cardId === m.cardId);
      if (!plan) { issue('La atribución refiere a un plan ausente.', movement.id, a.planId); continue; }
      const quota = installmentQuotas(plan.value).find(q => q.number === a.quotaNumber);
      const allocated = live(p.movements).filter(r => r.value.cardId === m.cardId).flatMap(r => r.value.allocations).filter(other => other.planId === a.planId && other.quotaNumber === a.quotaNumber);
      if (!quota || a.principalCents + a.interestCents <= 0 || m.date < plan.value.startDate || sumCents(allocated.map(a => a.principalCents)) > quota.principalCents ||
        sumCents(allocated.map(a => a.interestCents)) > quota.interestCents || (a.interestCents > 0 && !plan.value.interestIncludedInDebt && m.date < quota.cutDate))
        issue('El desglose supera la cuota o incluye interés no devengado. Los pagos programados también reservan su desglose.', movement.id, plan.id);
    }
  }
  for (const loan of live(p.loans)) {
    const payments = live(p.loanPayments).filter(a => a.value.loanId === loan.id);
    if (loan.value.balanceDate > today || sumCents(payments.map(a => a.value.amountCents)) > loan.value.principalCents || payments.some(a => a.value.date < loan.value.balanceDate))
      issue('Revisa el préstamo: sus abonos no pueden superar el capital ni ser anteriores al saldo inicial.', loan.id, ...payments.map(a => a.id));
    if (loan.value.includeReceivedMoney && loan.value.dueDate !== null && loan.value.dueDate < loan.value.balanceDate) issue('El préstamo recibido no puede vencer antes de recibir el dinero.', loan.id);
    if (loan.value.archived && sumCents(payments.filter(a => !a.value.scheduled && a.value.date <= today).map(a => a.value.amountCents)) !== loan.value.principalCents)
      issue('Solo puedes archivar un préstamo liquidado.', loan.id);
  }
  for (const type of ['income', 'reminderPreferences'] as const) if (p[entityTables[type]].filter(r => !r.voided).length > 1) issue(`Hay dos configuraciones de ${type}. Resuelve cuál conservar.`, ...p[entityTables[type]].filter(r => !r.voided).map(r => r.id));
  for (const b of live(p.budgets)) if (b.value.payday !== paydayForBudget(b.value.payday)) issue('El presupuesto debe ser del 15 o último día del mes.', b.id);
  if (new Set(live(p.budgets).map(b => b.value.payday)).size !== live(p.budgets).length) issue('Hay presupuestos repetidos para la misma quincena.', ...live(p.budgets).map(b => b.id));
  issues.push(...extensionIssues(p, today));
  return issues;
}
function paydayForBudget(date: string): string {
  const { year, month, day } = civilDate(date);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), last = month === 2 ? leap ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day === 15 || day === last ? date : '';
}
export function assertPortfolio(p: Portfolio, today: string): void {
  const issues = portfolioIssues(p, today); if (issues.length) throw Error(issues.map(i => i.message).join('\n'));
}
export function portfolioIssues(p: Portfolio, today: string): FinancialIssue[] {
  try { const issues = structuralIssues(p, today); if (!issues.length) financeView(p, today); return issues; }
  catch (e) { return [{ message: e instanceof Error ? e.message : 'No se pueden calcular los registros recibidos.',
    entityIds: [...p.balances, ...p.movements, ...p.installments, ...p.loans, ...p.loanPayments, ...p.budgets, ...p.incomes].filter(r => !r.voided).map(r => r.id) }]; }
}
