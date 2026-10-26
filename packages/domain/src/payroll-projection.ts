import type { Portfolio } from './portfolio.ts';
import { live } from './portfolio.ts';
import type { FinanceView } from './finance.ts';
import { accountFree, accountReserved, cashBalance } from './extensions.ts';
import { vocalHeld } from './vocalia.ts';
import { addDays } from './dates.ts';
import { sumCents } from './money.ts';
import { activeTandas, tandaSchedule } from './tandas.ts';

export interface ProjectionEvent {
  readonly date: string; readonly label: string; readonly kind: 'income' | 'card' | 'loan' | 'tanda';
  // Positivo entra a la cuenta; negativo sale.
  readonly amountCents: number; readonly balanceCents: number; readonly overdue: boolean;
}
export interface PayrollProjection {
  readonly accountId: string; readonly accountName: string; readonly startCents: number; readonly through: string;
  readonly events: readonly ProjectionEvent[];
  readonly lowestCents: number; readonly lowestDate: string;
  readonly firstShortfall: { readonly date: string; readonly balanceCents: number } | null;
}

// Proyecta el saldo de la cuenta de nómina: ingresos esperados menos tarjetas y cuotas de préstamo con cargo en esa cuenta.
// Una tarjeta sin cuenta de pago se supone pagada desde la nómina.
// No incluye gastos esenciales ni reserva (no son movimientos reales) ni ingresos pasados sin confirmar.
export function payrollProjection(p: Portfolio, view: FinanceView, days = 90): PayrollProjection | null {
  const link = view.budgets.find(b => b.payroll)?.payroll;
  if (!link) return null;
  return project(p, view, new Set([link.accountId]), link.accountName, false, days);
}

// Proyecta el total disponible de las cuentas de uso libre (sin vales ni cuentas excluidas), descontando lo apartado para metas.
export function totalProjection(p: Portfolio, view: FinanceView, days = 90): PayrollProjection | null {
  const ids = new Set(live(p.cashAccounts).filter(a => accountFree(p, a.id)).map(a => a.id));
  return ids.size ? project(p, view, ids, 'Todas las cuentas de uso libre', true, days) : null;
}

function project(p: Portfolio, view: FinanceView, ids: ReadonlySet<string>, accountName: string, netOfGoals: boolean, days: number): PayrollProjection {
  const today = view.today, through = addDays(today, days);
  const payroll = view.budgets.find(b => b.payroll)?.payroll ?? null, payrollIn = payroll !== null && ids.has(payroll.accountId);
  const start = sumCents([...ids].map(id => cashBalance(p, id, today) - (netOfGoals ? accountReserved(p, id, today) + vocalHeld(p, id) : 0)));
  const raw: Omit<ProjectionEvent, 'balanceCents'>[] = [];
  if (payrollIn) for (const b of view.budgets) {
    if (b.payday > today && b.payday <= through && b.incomeCents > 0) raw.push({ date: b.payday, label: 'Ingreso de nómina', kind: 'income', amountCents: b.incomeCents, overdue: false });
  }
  for (const c of view.cards) {
    const payer = live(p.cards).find(x => x.id === c.id)?.value.payAccountId ?? payroll?.accountId ?? null;
    if (payer !== null && !ids.has(payer)) continue;
    for (const s of [...c.cuts.filter(x => x.current), ...c.projections]) {
      if (s.pendingCents <= 0 || s.dueDate > through) continue;
      raw.push({ date: s.dueDate < today ? today : s.dueDate, label: `Pago de ${c.name}${s.estimated ? ' (estimado)' : ''}`, kind: 'card', amountCents: -s.pendingCents, overdue: s.dueDate < today });
    }
  }
  for (const o of view.obligations) {
    const charge = live(p.loans).find(l => l.id === o.loanId)?.value.chargeAccountId ?? null;
    if (!o.chargeAccountName || charge === null || !ids.has(charge) || o.dueDate > through) continue;
    raw.push({ date: o.dueDate < today ? today : o.dueDate, label: `Cuota de ${view.loans.find(l => l.id === o.loanId)?.person ?? 'préstamo'}`, kind: 'loan', amountCents: -o.amountCents, overdue: o.dueDate < today });
  }
  if (payrollIn) for (const t of activeTandas(p)) {
    for (const r of tandaSchedule(t)) {
      if (r.date <= today || r.date > through) continue;
      raw.push({ date: r.date, label: `Tanda ${t.name} (${r.number}/${t.participants})`, kind: 'tanda', amountCents: r.payoutCents - r.contributionCents, overdue: false });
    }
  }
  // A igual fecha, el ingreso se aplica antes que los cargos.
  raw.sort((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents);
  let balance = start, lowest = start, lowestDate = today, shortfall: PayrollProjection['firstShortfall'] = null;
  const events = raw.map(e => {
    balance += e.amountCents;
    if (balance < lowest) { lowest = balance; lowestDate = e.date; }
    if (balance < 0 && !shortfall) shortfall = { date: e.date, balanceCents: balance };
    return { ...e, balanceCents: balance };
  });
  return { accountId: payroll?.accountId ?? '', accountName, startCents: start, through, events, lowestCents: lowest, lowestDate, firstShortfall: shortfall };
}
