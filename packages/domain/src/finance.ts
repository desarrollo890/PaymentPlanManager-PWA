import type { Balance, Card, Installment, Movement, Statement } from '@paymentplan/contracts';
import { addDays, addMonths, civilDate, cutOnOrAfter, cutOnOrBefore, dateInMonth, dueDateFor, paydayFor, paydaysThrough, suggestedPaymentDate } from './dates.ts';
import { installmentQuotas } from './installments.ts';
import type { InstallmentQuota } from './installments.ts';
import { cents, safeInteger, sumCents } from './money.ts';
import { live, orderOf } from './portfolio.ts';
import type { FinancialRecord, Portfolio } from './portfolio.ts';

export interface BalanceAlert { readonly code: 'balanceMismatch' | 'limitExceeded' | 'creditBalance'; readonly amountCents: number }
export interface QuotaBalance {
  readonly planId: string; readonly number: number; readonly cutDate: string;
  readonly principalCents: number; readonly interestCents: number; readonly futureInterestCents: number;
}
export interface QuotaView extends InstallmentQuota {
  readonly dueDate: string; readonly principalPaidCents: number; readonly interestPaidCents: number; readonly scheduledCents: number;
}
export interface PlanView {
  readonly id: string; readonly description: string; readonly months: number; readonly cancelled: boolean;
  readonly canEditAmounts: boolean; readonly editReason: string | null; readonly remainingCents: number;
  readonly futureInterestCents: number; readonly quotas: readonly QuotaView[];
}
export interface CutView {
  readonly id: string; readonly cardId: string; readonly cutDate: string; readonly dueDate: string; readonly payday: string;
  readonly targetCents: number; readonly pendingCents: number; readonly paidCents: number; readonly reservedCents: number;
  readonly scheduledCents: number; readonly estimated: boolean; readonly current: boolean; readonly projection: boolean;
  readonly suggestedDate: string;
}
export interface CardView {
  readonly id: string; readonly name: string; readonly debtCents: number; readonly availableCents: number;
  readonly installmentDebtCents: number; readonly freeDebtCents: number; readonly movements: number;
  readonly cuts: readonly CutView[]; readonly plans: readonly PlanView[]; readonly projections: readonly CutView[];
  readonly alerts: readonly BalanceAlert[]; readonly reviewPreviousDebt: boolean;
}
export interface LoanView { readonly id: string; readonly person: string; readonly balanceCents: number; readonly paidCents: number; readonly scheduledCents: number }
export interface LoanObligation { readonly loanId: string; readonly dueDate: string; readonly payday: string; readonly amountCents: number; readonly scheduled: boolean }
export interface BudgetView {
  readonly payday: string; readonly pendingCents: number; readonly loanPendingCents: number; readonly receivedLoanCents: number;
  readonly loanPaidCents: number; readonly balanceCents: number; readonly cardPaidCents: number;
  readonly incomeCents: number; readonly expensesCents: number; readonly reserveCents: number; readonly estimated: boolean;
}
export interface FinanceView {
  readonly today: string; readonly debtCents: number; readonly creditCents: number; readonly pendingCents: number;
  readonly horizon: string; readonly cards: readonly CardView[]; readonly loans: readonly LoanView[]; readonly budgets: readonly BudgetView[];
  readonly obligations: readonly LoanObligation[]; readonly loanDebtCents: number; readonly undatedLoanDebtCents: number;
}
const total = <T>(rows: readonly T[], select: (row: T) => number): number => sumCents(rows.map(select));
const movementsFor = (p: Portfolio, cardId: string) => live(p.movements).filter(r => r.value.cardId === cardId);
export function activePlans(p: Portfolio, cardId: string): FinancialRecord<Installment>[] {
  return live(p.installments).filter(r => r.value.cardId === cardId && (r.value.purchaseId === null ||
    p.movements.some(m => m.id === r.value.purchaseId && !m.voided && !m.value.scheduled)));
}
export function latestBalance(p: Portfolio, cardId: string): FinancialRecord<Balance> {
  const balances = live(p.balances).filter(r => r.value.cardId === cardId).sort((a, b) =>
    b.value.date.localeCompare(a.value.date) || orderOf(b.value).localeCompare(orderOf(a.value)) || b.id.localeCompare(a.id));
  if (!balances[0]) throw Error('La tarjeta necesita un saldo inicial.');
  return balances[0];
}
export function planAccruedInterest(plan: Installment, at: string): number {
  return plan.interestIncludedInDebt ? 0 : total(installmentQuotas(plan).filter(q => q.cutDate <= at &&
    (plan.interestIncorporatedThrough === null || q.cutDate > plan.interestIncorporatedThrough)), q => q.interestCents);
}
export function cardBalance(p: Portfolio, cardId: string, at: string): { debtCents: number; availableCents: number } {
  civilDate(at);
  const base = latestBalance(p, cardId).value;
  const change = total(movementsFor(p, cardId).filter(m => !m.value.scheduled && m.value.date <= at &&
    !m.value.reconciled && !base.includedMovementIds.includes(m.id)), m => m.value.kind === 'payment' ? -m.value.amountCents : m.value.amountCents);
  const interest = total(activePlans(p, cardId), r => planAccruedInterest(r.value, at));
  return { debtCents: sumCents([base.debtCents, change, interest]), availableCents: sumCents([base.availableCents, -change, -interest]) };
}
export function balanceAlerts(limitCents: number, availableCents: number, debtCents: number): BalanceAlert[] {
  cents(limitCents); cents(availableCents, true); cents(debtCents, true);
  const result: BalanceAlert[] = [], difference = sumCents([availableCents, debtCents, -limitCents]);
  if (Math.abs(difference) > 1) result.push({ code: 'balanceMismatch', amountCents: Math.abs(difference) });
  const excess = Math.max(debtCents - limitCents, -availableCents);
  if (excess > 1) result.push({ code: 'limitExceeded', amountCents: excess });
  if (debtCents < -1) result.push({ code: 'creditBalance', amountCents: -debtCents });
  return result;
}
interface MutableQuota { plan: FinancialRecord<Installment>; quota: InstallmentQuota; active: boolean; capital: number; interest: number }
function distribute(payment: number, quotas: MutableQuota[], field: 'capital' | 'interest'): number {
  const amount = Math.min(payment, total(quotas, q => q[field]));
  if (amount <= 0) return payment;
  const denominator = BigInt(total(quotas, q => q[field]));
  const shares = quotas.map(q => { const n = BigInt(amount) * BigInt(q[field]); return { q, amount: safeInteger(n / denominator), remainder: n % denominator }; })
    .sort((a, b) => a.remainder === b.remainder ? a.q.plan.id.localeCompare(b.q.plan.id) : a.remainder > b.remainder ? -1 : 1);
  const extra = amount - total(shares, s => s.amount);
  shares.forEach((s, i) => { s.q[field] -= s.amount + (i < extra ? 1 : 0); });
  return payment - amount;
}
function applyToPlans(payment: number, quotas: MutableQuota[]): number {
  for (const date of [...new Set(quotas.filter(q => q.active).map(q => q.quota.cutDate))].sort()) {
    const group = quotas.filter(q => q.active && q.quota.cutDate === date);
    payment = distribute(payment, group, 'interest'); payment = distribute(payment, group, 'capital');
    if (payment <= 0) break;
  }
  return payment;
}
export function quotaBalances(p: Portfolio, cardId: string, today: string): QuotaBalance[] {
  const plans = activePlans(p, cardId).filter(r => r.value.startDate <= today && (r.value.purchaseId === null ||
    p.movements.some(m => m.id === r.value.purchaseId && m.value.date <= today))).sort((a, b) => a.id.localeCompare(b.id));
  if (!plans.length) return [];
  const start = plans.map(r => r.value.startDate).sort()[0]!;
  const movements = movementsFor(p, cardId).filter(r => !r.value.scheduled && r.value.date >= start && r.value.date <= today);
  const quotas: MutableQuota[] = plans.flatMap(plan => installmentQuotas(plan.value).map(quota => ({ plan, quota, active: false, capital: 0, interest: 0 })));
  let ordinary = sumCents([cardBalance(p, cardId, today).debtCents,
    -total(movements.filter(r => r.value.kind !== 'payment'), r => r.value.amountCents),
    total(movements.filter(r => r.value.kind === 'payment'), r => r.value.amountCents),
    -total(quotas.filter(q => !q.plan.value.interestIncludedInDebt && q.quota.cutDate <= today), q => q.quota.interestCents)]);
  const dates = [...new Set([...movements.map(r => r.value.date), ...plans.map(r => r.value.startDate), ...quotas.filter(q => q.quota.cutDate <= today).map(q => q.quota.cutDate)])].sort();
  for (const date of dates) {
    for (const q of quotas.filter(q => !q.plan.value.interestIncludedInDebt && q.quota.cutDate === date)) {
      if (q.active) q.interest += q.quota.interestCents; else ordinary += q.quota.interestCents;
    }
    const events: { key: string; movement: FinancialRecord<Movement> | null; plan: FinancialRecord<Installment> | null }[] = [
      ...movements.filter(r => r.value.date === date).map(movement => ({ key: orderOf(movement.value), movement, plan: null })),
      ...plans.filter(r => r.value.startDate === date).map(plan => ({ key: orderOf(plan.value), movement: null, plan })),
    ];
    for (const e of events) if (e.movement) for (const allocation of e.movement.value.allocations) {
      const plan = events.find(other => other.plan?.id === allocation.planId);
      if (plan && plan.key >= e.key) e.key = plan.key + '~';
    }
    events.sort((a, b) => a.key.localeCompare(b.key) || Number(a.plan !== null) - Number(b.plan !== null));
    for (const e of events) {
      if (e.movement) {
        const m = e.movement.value;
        if (m.kind !== 'payment') ordinary += m.amountCents;
        else {
          let attributed = 0;
          for (const a of m.allocations) {
            const q = quotas.find(q => q.active && q.plan.id === a.planId && q.quota.number === a.quotaNumber);
            if (!q) continue;
            const capital = Math.min(q.capital, a.principalCents), interest = Math.min(q.interest, a.interestCents);
            q.capital -= capital; q.interest -= interest; attributed += capital + interest;
          }
          const remainder = m.amountCents - attributed, ordinaryPayment = Math.min(Math.max(0, ordinary), remainder);
          ordinary -= ordinaryPayment; ordinary -= applyToPlans(remainder - ordinaryPayment, quotas);
        }
      } else if (e.plan) for (const q of quotas.filter(q => q.plan.id === e.plan!.id)) {
        q.active = true; q.capital = q.quota.principalCents;
        q.interest = q.plan.value.interestIncludedInDebt || q.quota.cutDate <= date ? q.quota.interestCents : 0;
        ordinary -= q.capital + q.interest;
      }
      if (ordinary < 0) ordinary = -applyToPlans(-ordinary, quotas);
    }
  }
  return quotas.map(q => ({ planId: q.plan.id, number: q.quota.number, cutDate: q.quota.cutDate, principalCents: q.capital,
    interestCents: q.interest, futureInterestCents: !q.plan.value.interestIncludedInDebt && q.quota.cutDate > today ? q.quota.interestCents : 0 }));
}
export function freeDebt(p: Portfolio, cardId: string, today: string): number {
  return Math.max(0, cardBalance(p, cardId, today).debtCents - total(quotaBalances(p, cardId, today), q => q.principalCents + q.interestCents));
}
function realizedAllocations(p: Portfolio, cardId: string, until: string) {
  return movementsFor(p, cardId).filter(r => r.value.kind === 'payment' && !r.value.scheduled && r.value.date <= until).flatMap(r => r.value.allocations);
}
function futureDebt(p: Portfolio, cardId: string, plan: FinancialRecord<Installment>, cut: string, until: string): number {
  const paid = realizedAllocations(p, cardId, until).filter(a => a.planId === plan.id);
  return total(installmentQuotas(plan.value).filter(q => q.cutDate > cut), q =>
    Math.max(0, q.principalCents - total(paid.filter(a => a.quotaNumber === q.number), a => a.principalCents)) +
    (plan.value.interestIncludedInDebt ? Math.max(0, q.interestCents - total(paid.filter(a => a.quotaNumber === q.number), a => a.interestCents)) : 0));
}
export function estimateStatement(p: Portfolio, card: FinancialRecord<Card>, cutDate: string, today: string, previous?: FinancialRecord<Statement>): FinancialRecord<Statement> {
  const at = cutDate > today ? today : cutDate, base = latestBalance(p, card.id).value, reference = at < base.date ? base.date : at;
  let debt = cardBalance(p, card.id, at).debtCents;
  if (reference > cutDate) debt = sumCents([base.debtCents, total(movementsFor(p, card.id).filter(m => m.value.reconciled &&
    !m.value.scheduled && m.value.date > cutDate && m.value.date <= reference), m => m.value.kind === 'payment' ? m.value.amountCents : -m.value.amountCents)]);
  const plans = activePlans(p, card.id).filter(r => r.value.startDate <= cutDate);
  debt -= total(plans, r => futureDebt(p, card.id, r, cutDate, at));
  if (at < cutDate) debt += total(plans, r => planAccruedInterest(r.value, cutDate) - planAccruedInterest(r.value, at));
  return { id: previous?.id ?? `estimate:${card.id}:${cutDate}`, voided: false, value: { cardId: card.id, cutDate,
    dueDate: previous?.value.dueDate ?? dueDateFor(card.value, cutDate), targetCents: Math.max(0, debt), minimumCents: 0,
    initialPaidCents: 0, reservedCents: previous?.value.reservedCents ?? 0, estimated: true, balanceReferenceDate: reference, includedPaymentIds: [] } };
}
export function statementsFor(p: Portfolio, card: FinancialRecord<Card>, today: string): FinancialRecord<Statement>[] {
  const base = latestBalance(p, card.id).value;
  const statements = live(p.statements).filter(s => s.value.cardId === card.id && (!s.value.estimated || s.value.cutDate >= base.date ||
    movementsFor(p, card.id).some(m => !m.value.scheduled && m.value.date <= s.value.cutDate)))
    .map(s => s.value.estimated ? estimateStatement(p, card, s.value.cutDate, today, s) : s);
  const last = cutOnOrBefore(card.value.cutDay, today), target = last < base.date ? cutOnOrAfter(card.value.cutDay, base.date) : last;
  if (!statements.some(s => s.value.cutDate >= target || s.value.cutDate.slice(0, 7) === target.slice(0, 7))) statements.push(estimateStatement(p, card, target, today));
  return statements.sort((a, b) => b.value.cutDate.localeCompare(a.value.cutDate));
}
export function cutView(p: Portfolio, card: FinancialRecord<Card>, statement: FinancialRecord<Statement>, today: string, nextCut: string | null = null): CutView {
  const s = statement.value;
  const payments = movementsFor(p, card.id).filter(r => r.value.kind === 'payment' && !s.includedPaymentIds.includes(r.id) &&
    (r.value.date > s.cutDate || (!s.estimated && r.value.statementId === statement.id)) && (nextCut === null || r.value.date <= nextCut));
  function applicable(m: Movement): number {
    const future = m.allocations.filter(a => activePlans(p, card.id).some(plan => plan.id === a.planId &&
      installmentQuotas(plan.value).some(q => q.number === a.quotaNumber && q.cutDate > s.cutDate)));
    return Math.max(0, m.amountCents - total(future, a => a.principalCents + a.interestCents));
  }
  const paid = s.initialPaidCents + total(payments.filter(r => !r.value.scheduled && r.value.date <= today), r => applicable(r.value));
  const pending = Math.max(0, s.targetCents - paid);
  return { id: statement.id, cardId: card.id, cutDate: s.cutDate, dueDate: s.dueDate, payday: paydayFor(s.dueDate),
    targetCents: s.targetCents, pendingCents: pending, paidCents: paid, reservedCents: Math.min(s.reservedCents, pending),
    scheduledCents: total(payments.filter(r => r.value.scheduled || r.value.date > today), r => applicable(r.value)),
    estimated: s.estimated, current: nextCut === null, projection: s.cutDate > today, suggestedDate: suggestedPaymentDate(s.dueDate) };
}
export function projectionsFor(p: Portfolio, card: FinancialRecord<Card>, today: string, current: CutView, balances: QuotaBalance[]): CutView[] {
  const quotas = balances.map(q => ({ ...q }));
  let ordinary = cardBalance(p, card.id, today).debtCents - total(quotas, q => q.principalCents + q.interestCents);
  const last = [...quotas.map(q => q.cutDate), cutOnOrAfter(card.value.cutDay, addDays(today, 1))].sort().at(-1)!;
  function accrue(date: string) {
    for (const q of quotas.filter(q => q.cutDate <= date)) { q.interestCents += q.futureInterestCents; q.futureInterestCents = 0; }
    if (ordinary < 0) for (const q of quotas.filter(q => q.cutDate <= date).sort((a, b) => a.cutDate.localeCompare(b.cutDate))) {
      let applied = Math.min(-ordinary, q.interestCents); q.interestCents -= applied; ordinary += applied;
      applied = Math.min(-ordinary, q.principalCents); q.principalCents -= applied; ordinary += applied;
    }
  }
  function pay(amount: number, date: string) {
    let applied = Math.min(amount, Math.max(0, ordinary)); ordinary -= applied; amount -= applied;
    const ordered = quotas.toSorted((a, b) => a.cutDate.localeCompare(b.cutDate) || a.planId.localeCompare(b.planId));
    for (const group of [ordered.filter(q => q.cutDate <= date), ordered]) for (const q of group) {
      applied = Math.min(amount, q.interestCents); q.interestCents -= applied; amount -= applied;
      applied = Math.min(amount, q.principalCents); q.principalCents -= applied; amount -= applied;
    }
  }
  accrue(current.cutDate); pay(current.pendingCents, current.cutDate);
  const result: CutView[] = [];
  for (let date = addMonths(current.cutDate, 1, card.value.cutDay); date <= last; date = addMonths(date, 1, card.value.cutDay)) {
    accrue(date);
    const target = Math.max(0, ordinary + total(quotas.filter(q => q.cutDate <= date), q => q.principalCents + q.interestCents));
    const saved = live(p.statements).find(s => s.value.cardId === card.id && !s.value.estimated && s.value.cutDate === date);
    const statement = saved ?? { id: `estimate:${card.id}:${date}`, voided: false, value: { cardId: card.id, cutDate: date,
      dueDate: dueDateFor(card.value, date), targetCents: target, minimumCents: 0, initialPaidCents: 0, reservedCents: 0,
      estimated: true, balanceReferenceDate: null, includedPaymentIds: [] } };
    const view = { ...cutView(p, card, statement, today, addMonths(date, 1, card.value.cutDay)), current: false, projection: true };
    result.push(view); pay(view.pendingCents, date);
  }
  return result;
}
export function planEditReason(p: Portfolio, plan: FinancialRecord<Installment>, today: string): string | null {
  const value = plan.value;
  if (p.movements.some(m => m.value.allocations.some(a => a.planId === plan.id))) return 'Hay pagos o programaciones atribuidos al plan, incluso anulados. Puedes editar la descripción.';
  if (p.movements.some(m => m.value.cardId === value.cardId && m.value.kind === 'payment' && m.value.date >= value.startDate &&
    m.value.date <= today && (m.value.date > value.startDate || orderOf(m.value) >= orderOf(value)))) return 'Hay pagos posteriores al plan. Puedes editar la descripción.';
  if ((value.interestIncorporatedThrough !== null && value.interestIncorporatedThrough >= value.firstCutDate) ||
    p.balances.some(b => b.value.cardId === value.cardId && b.value.date >= value.startDate && orderOf(b.value) > orderOf(value)))
    return 'El plan forma parte de un saldo conciliado. Puedes editar la descripción.';
  if (live(p.statements).some(s => s.value.cardId === value.cardId && !s.value.estimated && s.value.cutDate >= value.startDate) ||
    live(p.closures).some(c => c.value.cardId === value.cardId && c.value.to >= value.startDate)) return 'Hay cortes confirmados o periodos cerrados. Puedes editar la descripción.';
  return null;
}
function cardView(p: Portfolio, card: FinancialRecord<Card>, today: string): CardView {
  const balance = cardBalance(p, card.id, today), base = latestBalance(p, card.id).value, quota = quotaBalances(p, card.id, today);
  const statements = statementsFor(p, card, today), current = statements.find(s => s.value.cutDate <= today) ?? statements[0]!;
  const cuts = statements.map(s => ({ ...cutView(p, card, s, today, s.value.cutDate > today ? null :
    statements.filter(n => n.value.cutDate <= today && n.value.cutDate > s.value.cutDate).map(n => n.value.cutDate).sort()[0] ?? null), current: s.id === current.id }));
  const plans = p.installments.filter(r => r.value.cardId === card.id).map(plan => {
    const q = quota.filter(q => q.planId === plan.id), allocated = realizedAllocations(p, card.id, today).filter(a => a.planId === plan.id);
    const reason = planEditReason(p, plan, today);
    return { id: plan.id, description: plan.value.description, months: plan.value.months, cancelled: plan.voided,
      canEditAmounts: !plan.voided && reason === null, editReason: reason, remainingCents: total(q, q => q.principalCents + q.interestCents + q.futureInterestCents),
      futureInterestCents: total(q, q => q.futureInterestCents), quotas: installmentQuotas(plan.value).map(q => ({ ...q,
        dueDate: dueDateFor(card.value, q.cutDate), principalPaidCents: total(allocated.filter(a => a.quotaNumber === q.number), a => a.principalCents),
        interestPaidCents: total(allocated.filter(a => a.quotaNumber === q.number), a => a.interestCents),
        scheduledCents: total(movementsFor(p, card.id).filter(m => m.value.scheduled || m.value.date > today).flatMap(m => m.value.allocations)
          .filter(a => a.planId === plan.id && a.quotaNumber === q.number), a => a.principalCents + a.interestCents) })) };
  });
  const installmentDebt = total(quota, q => q.principalCents + q.interestCents);
  return { id: card.id, name: card.value.name, ...balance, installmentDebtCents: installmentDebt,
    freeDebtCents: Math.max(0, balance.debtCents - installmentDebt), movements: p.movements.filter(m => m.value.cardId === card.id).length,
    cuts, plans, projections: projectionsFor(p, card, today, cuts.find(c => c.current)!, quota),
    alerts: balanceAlerts(card.value.limitCents, balance.availableCents, balance.debtCents),
    reviewPreviousDebt: base.debtCents > 0 && card.value.initialDebtOrigin !== 'currentPeriod' && cutOnOrAfter(card.value.cutDay, base.date) > base.date &&
      !live(p.statements).some(s => s.value.cardId === card.id && !s.value.estimated && s.value.cutDate < base.date) };
}
export function financeView(p: Portfolio, today: string): FinanceView {
  civilDate(today);
  const cards = live(p.cards).filter(c => !c.value.archived).map(c => cardView(p, c, today)).sort((a, b) => Math.max(0, b.debtCents) - Math.max(0, a.debtCents) || a.name.localeCompare(b.name));
  const current = cards.flatMap(c => c.cuts.filter(s => s.current)), owed = current.filter(c => c.pendingCents > 0);
  const loans = live(p.loans).map(r => {
    const payments = live(p.loanPayments).filter(a => a.value.loanId === r.id), paid = total(payments.filter(a => !a.value.scheduled && a.value.date <= today), a => a.value.amountCents);
    return { id: r.id, person: r.value.person, balanceCents: r.value.principalCents - paid, paidCents: paid,
      scheduledCents: total(payments.filter(a => a.value.scheduled || a.value.date > today), a => a.value.amountCents) };
  }).sort((a, b) => Number(p.loans.find(r => r.id === a.id)!.value.archived) - Number(p.loans.find(r => r.id === b.id)!.value.archived) || b.balanceCents - a.balanceCents || a.person.localeCompare(b.person));
  const obligations: LoanObligation[] = [];
  for (const loan of loans) {
    const value = p.loans.find(l => l.id === loan.id)!.value;
    if (value.archived || loan.balanceCents <= 0) continue;
    const scheduled = live(p.loanPayments).filter(a => a.value.loanId === loan.id && (a.value.scheduled || a.value.date > today) &&
      (value.dueDate === null || a.value.date <= value.dueDate));
    obligations.push(...scheduled.map(a => ({ loanId: loan.id, dueDate: a.value.date, payday: paydayFor(a.value.date), amountCents: a.value.amountCents, scheduled: true })));
    const remainder = loan.balanceCents - total(scheduled, a => a.value.amountCents);
    if (value.dueDate !== null && remainder > 0) obligations.push({ loanId: loan.id, dueDate: value.dueDate, payday: paydayFor(value.dueDate), amountCents: remainder, scheduled: false });
  }
  obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.loanId.localeCompare(b.loanId));
  const cardHorizon = [...cards.flatMap(c => c.plans.filter(p => !p.cancelled).flatMap(p => p.quotas.map(q => q.dueDate))),
    ...live(p.movements).filter(m => m.value.scheduled || m.value.date > today).map(m => m.value.date),
    ...cards.flatMap(c => c.projections.map(s => s.dueDate)), ...owed.map(s => s.dueDate), today.slice(0, 8) + dateInMonth(civilDate(today).year, civilDate(today).month, 31).slice(8)].sort().at(-1)!;
  const horizon = [cardHorizon, ...live(p.savingsGoals).filter(g => !g.value.archived && g.value.targetDate !== null).map(g => g.value.targetDate!), ...obligations.map(o => o.dueDate), ...live(p.loanPayments).filter(a => a.value.scheduled).map(a => a.value.date), ...live(p.budgets).map(b => b.value.payday)].sort().at(-1)!;
  const targets = new Map<string, CutView>();
  for (const s of [...current, ...cards.flatMap(c => c.projections)]) {
    const key = `${s.cardId}:${s.payday}`, old = targets.get(key);
    if (!old || old.cutDate < s.cutDate) targets.set(key, s);
  }
  const dates = new Set([...targets.values()].map(s => s.payday));
  for (const date of paydaysThrough(addMonths(today, -1, 1), horizon)) dates.add(date);
  live(p.budgets).forEach(b => dates.add(b.value.payday)); obligations.forEach(o => dates.add(o.payday));
  live(p.loans).filter(l => l.value.includeReceivedMoney).forEach(l => dates.add(paydayFor(l.value.balanceDate)));
  live(p.loanPayments).filter(a => !a.value.scheduled && a.value.date <= today).forEach(a => dates.add(paydayFor(a.value.date)));
  const config = live(p.incomes)[0]?.value ?? { income15Cents: 0, incomeEndCents: 0, expensesCents: 0, reserveCents: 0 };
  const budgets = [...dates].sort().map(date => {
    const saved = live(p.budgets).find(b => b.value.payday === date)?.value;
    const income = saved?.receivedIncomeCents ?? saved?.expectedIncomeCents ?? (civilDate(date).day === 15 ? config.income15Cents : config.incomeEndCents);
    const expenses = saved?.expensesCents ?? config.expensesCents, reserve = saved?.reserveCents ?? config.reserveCents;
    const pending = total([...targets.values()].filter(s => s.payday === date), s => s.pendingCents);
    const cardPaid = total(live(p.movements).filter(m => m.value.kind === 'payment' && !m.value.scheduled && m.value.date <= today &&
      (cards.flatMap(c => c.cuts).find(s => s.id === m.value.statementId)?.payday ?? paydayFor(m.value.date)) === date), m => m.value.amountCents);
    const received = total(live(p.loans).filter(l => l.value.includeReceivedMoney && l.value.balanceDate <= today && paydayFor(l.value.balanceDate) === date), l => l.value.principalCents);
    const loanPaid = total(live(p.loanPayments).filter(a => !a.value.scheduled && a.value.date <= today && paydayFor(a.value.date) === date), a => a.value.amountCents);
    const loanPending = total(obligations.filter(o => o.payday === date), o => o.amountCents);
    return { payday: date, pendingCents: pending, loanPendingCents: loanPending, receivedLoanCents: received, loanPaidCents: loanPaid,
      cardPaidCents: cardPaid, incomeCents: income, expensesCents: expenses, reserveCents: reserve,
      balanceCents: sumCents([income, received, -expenses, -reserve, -cardPaid, -pending, -loanPaid, -loanPending]),
      estimated: saved?.receivedIncomeCents == null || [...targets.values()].some(s => s.payday === date && s.estimated) };
  });
  return { today, cards, loans, budgets, horizon, obligations, debtCents: total(cards, c => Math.max(0, c.debtCents)),
    creditCents: total(cards, c => Math.max(0, -c.debtCents)), pendingCents: total(owed, s => s.pendingCents),
    loanDebtCents: total(loans, l => l.balanceCents), undatedLoanDebtCents: total(loans.filter(l => p.loans.find(r => r.id === l.id)!.value.dueDate === null), l => l.balanceCents - l.scheduledCents) };
}
