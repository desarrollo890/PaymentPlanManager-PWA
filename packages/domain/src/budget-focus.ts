import type { Portfolio } from './portfolio.ts';
import type { BudgetStatus, BudgetView, FinanceView } from './finance.ts';
import { cashView } from './extensions.ts';
import { civilDate } from './dates.ts';

export interface BudgetOverdraft {
  readonly payday: string; readonly shortCents: number;
  // La reserva de esa quincena alcanza para cubrir el faltante.
  readonly reserveCovers: boolean;
  readonly largest: { readonly name: string; readonly cents: number } | null;
}

export interface BudgetFocus {
  readonly payday: string; readonly status: BudgetStatus;
  readonly expectedCents: number; readonly receivedCents: number | null;
  // Recibido menos esperado; null mientras no se confirma el ingreso.
  readonly differenceCents: number | null;
  // Solo si el ingreso real difiere del valor configurado en Preferencias para ese día.
  readonly canUpdateEstimate: boolean;
  readonly payroll: BudgetView['payroll'];
  readonly accountBalanceCents: number | null; readonly accountFreeCents: number | null;
  readonly committedCents: number; readonly leftoverCents: number;
  readonly segments: readonly { key: 'expenses' | 'reserve' | 'cards' | 'loans'; cents: number }[];
  readonly cardPayments: readonly { cardName: string; dueDate: string; pendingCents: number; estimated: boolean }[];
  readonly loanDues: readonly { loanId: string; person: string; dueDate: string; amountCents: number; accountName: string | null }[];
  readonly overdrafts: readonly BudgetOverdraft[];
}

function overdraftFor(view: FinanceView, b: BudgetView): BudgetOverdraft {
  const items = [
    ...view.cards.flatMap(c => [...c.cuts.filter(s => s.current), ...c.projections].filter(s => s.payday === b.payday && s.pendingCents > 0).map(s => ({ name: c.name, cents: s.pendingCents }))),
    ...view.obligations.filter(o => o.payday === b.payday).map(o => ({ name: view.loans.find(l => l.id === o.loanId)?.person ?? 'Préstamo', cents: o.amountCents })),
  ].sort((a, c) => c.cents - a.cents);
  const shortCents = -b.balanceCents;
  return { payday: b.payday, shortCents, reserveCovers: b.reserveCents >= shortCents, largest: items[0] ?? null };
}

// Quincena en foco de Presupuesto: la vigente (última con fecha de pago <= hoy) o, si aún no hay, la siguiente.
export function budgetFocus(p: Portfolio, view: FinanceView): BudgetFocus | null {
  const today = view.today, current = view.budgets.filter(b => b.payday <= today).at(-1), b = current ?? view.budgets.find(b => b.payday > today);
  if (!b) return null;
  const account = b.payroll ? cashView(p, today).accounts.find(a => a.id === b.payroll!.accountId) : undefined;
  const committed = b.pendingCents + b.loanPendingCents;
  const incomes = p.incomes.find(r => !r.voided)?.value;
  const configured = incomes ? (civilDate(b.payday).day === 15 ? incomes.income15Cents : incomes.incomeEndCents) : null;
  const diff = b.receivedIncomeCents === null ? null : b.receivedIncomeCents - b.expectedIncomeCents;
  return {
    payday: b.payday, status: b.status, expectedCents: b.expectedIncomeCents, receivedCents: b.receivedIncomeCents, differenceCents: diff,
    canUpdateEstimate: b.receivedIncomeCents !== null && configured !== null && configured !== b.receivedIncomeCents,
    payroll: b.payroll, accountBalanceCents: account?.balanceCents ?? null, accountFreeCents: account ? account.balanceCents - committed : null,
    committedCents: committed, leftoverCents: b.balanceCents,
    segments: [{ key: 'expenses', cents: b.expensesCents }, { key: 'reserve', cents: b.reserveCents }, { key: 'cards', cents: b.pendingCents + b.cardPaidCents }, { key: 'loans', cents: b.loanPendingCents + b.loanPaidCents }],
    cardPayments: view.cards.flatMap(c => [...c.cuts.filter(s => s.current), ...c.projections].filter(s => s.payday === b.payday && s.pendingCents > 0)
      .map(s => ({ cardName: c.name, dueDate: s.dueDate, pendingCents: s.pendingCents, estimated: s.estimated }))).sort((x, y) => x.dueDate.localeCompare(y.dueDate)),
    loanDues: view.obligations.filter(o => o.payday === b.payday).map(o => ({ loanId: o.loanId, person: view.loans.find(l => l.id === o.loanId)?.person ?? '', dueDate: o.dueDate, amountCents: o.amountCents, accountName: o.chargeAccountName ?? null })),
    overdrafts: view.budgets.filter(x => x.payday >= b.payday && x.balanceCents < 0).slice(0, 3).map(x => overdraftFor(view, x)),
  };
}
