import { live } from './portfolio.ts';
import type { Portfolio } from './portfolio.ts';
import type { FinanceView } from './finance.ts';
import { cashView, categorySpending } from './extensions.ts';
import { sumCents } from './money.ts';

export type HomeAction =
  | { readonly kind: 'payroll'; readonly payday: string; readonly accountName: string }
  | { readonly kind: 'loanInstallment'; readonly loanId: string; readonly dueDate: string; readonly person: string; readonly amountCents: number; readonly accountName: string; readonly waitingForPayroll: boolean }
  | { readonly kind: 'cut'; readonly cardId: string; readonly cardName: string; readonly cutDate: string };

export interface HomeSummary {
  readonly actions: readonly HomeAction[];
  readonly availableCents: number; readonly reservedCents: number; readonly totalCashCents: number; readonly hasAccounts: boolean;
  readonly accounts: readonly { id: string; name: string; balanceCents: number; payroll: boolean }[];
  readonly goals: readonly { id: string; name: string; savedCents: number; targetCents: number }[];
  readonly debtCents: number;
  readonly period: { readonly payday: string; readonly payCents: number; readonly leftoverCents: number; readonly incomeCents: number; readonly estimated: boolean;
    readonly segments: readonly { key: 'expenses' | 'reserve' | 'cards' | 'loans'; cents: number }[] } | null;
  readonly categories: readonly { id: string; name: string; color: string; spentCents: number; limitCents: number | null }[];
}

// Resume lo que el usuario necesita ver al abrir la aplicación; reutiliza FinanceView para no duplicar reglas del presupuesto.
export function homeSummary(p: Portfolio, view: FinanceView): HomeSummary {
  const today = view.today, cash = cashView(p, today), income = live(p.incomes)[0]?.value;
  const payrollId = income?.payrollAccountId ?? null;
  const current = view.budgets.filter(b => b.payday <= today).at(-1), next = view.budgets.find(b => b.payday > today), budget = current ?? next ?? null;
  const actions: HomeAction[] = [];
  for (const b of view.budgets) {
    if (b.payday > today || !b.payroll || !b.payroll.canRecord || b.payroll.recordedCents !== null) continue;
    actions.push({ kind: 'payroll', payday: b.payday, accountName: b.payroll.accountName });
  }
  const pendingPayroll = new Set(actions.filter(a => a.kind === 'payroll').map(a => a.kind === 'payroll' ? a.payday : ''));
  for (const o of view.obligations) {
    if (o.dueDate > today || !o.chargeAccountName) continue;
    const loan = view.loans.find(l => l.id === o.loanId);
    actions.push({ kind: 'loanInstallment', loanId: o.loanId, dueDate: o.dueDate, person: loan?.person ?? '', amountCents: o.amountCents, accountName: o.chargeAccountName, waitingForPayroll: pendingPayroll.has(o.payday) });
  }
  for (const card of view.cards) {
    const cut = card.cuts.find(c => c.current);
    if (cut && cut.cutDate <= today && cut.estimated) actions.push({ kind: 'cut', cardId: card.id, cardName: card.name, cutDate: cut.cutDate });
  }
  const monthStart = today.slice(0, 8) + '01';
  const limits = budget ? live(p.categoryBudgets).filter(b => b.value.payday === budget.payday) : [];
  const categories = live(p.categories).filter(c => !c.value.archived)
    .map(c => ({ id: c.id, name: c.value.name, color: c.value.color, spentCents: categorySpending(p, c.id, monthStart, today, today), limitCents: limits.find(l => l.value.categoryId === c.id)?.value.limitCents ?? null }))
    .filter(c => c.spentCents > 0).sort((a, b) => b.spentCents - a.spentCents).slice(0, 5);
  const period = budget ? (() => {
    const cards = budget.pendingCents + budget.cardPaidCents, loans = budget.loanPendingCents + budget.loanPaidCents;
    return { payday: budget.payday, payCents: budget.pendingCents + budget.loanPendingCents, leftoverCents: budget.balanceCents, incomeCents: budget.incomeCents, estimated: budget.estimated,
      segments: [{ key: 'expenses' as const, cents: budget.expensesCents }, { key: 'reserve' as const, cents: budget.reserveCents }, { key: 'cards' as const, cents: cards }, { key: 'loans' as const, cents: loans }] };
  })() : null;
  return { actions, availableCents: cash.freeCents, reservedCents: cash.reservedCents, totalCashCents: cash.totalCents, hasAccounts: cash.accounts.some(a => !a.value.archived),
    accounts: cash.accounts.filter(a => !a.value.archived).map(a => ({ id: a.id, name: a.value.name, balanceCents: a.balanceCents, payroll: a.id === payrollId })),
    goals: cash.goals.filter(g => !g.value.archived).map(g => ({ id: g.id, name: g.value.name, savedCents: g.savedCents, targetCents: g.value.targetCents })),
    debtCents: sumCents([view.debtCents, view.loanDebtCents]), period, categories };
}
