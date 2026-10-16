import type { Income } from '@paymentplan/contracts';
import { addMonths, paydayFor, paydaysThrough } from './dates.ts';
import { sumCents } from './money.ts';
import type { Portfolio } from './portfolio.ts';
import { live } from './portfolio.ts';

export type Tanda = NonNullable<Income['tandas']>[number];

export interface TandaRound {
  readonly number: number;
  readonly date: string;
  readonly contributionCents: number;
  // Solo la ronda de tu turno cobra: todos los participantes aportan N veces el importe de la ronda.
  readonly payoutCents: number;
}

export function tandaSchedule(tanda: Tanda): TandaRound[] {
  if (paydayFor(tanda.firstDate) !== tanda.firstDate) throw new RangeError('La primera quincena de la tanda debe ser el día 15 o el último día del mes.');
  if (tanda.turn > tanda.participants) throw new RangeError('Tu turno no puede ser mayor que el número de participantes.');
  const dates = paydaysThrough(tanda.firstDate, addMonths(tanda.firstDate, Math.ceil(tanda.participants / 2) + 2)).slice(0, tanda.participants);
  return dates.map((date, index) => ({ number: index + 1, date, contributionCents: tanda.contributionCents,
    payoutCents: index + 1 === tanda.turn ? tanda.contributionCents * tanda.participants : 0 }));
}

export const activeTandas = (p: Portfolio): Tanda[] => (live(p.incomes)[0]?.value.tandas ?? []).filter(t => !t.archived);

// Aportaciones y cobro de las tandas activas en una quincena.
export function tandasOnPayday(p: Portfolio, payday: string): { contributionCents: number; payoutCents: number } {
  const rounds = activeTandas(p).flatMap(t => tandaSchedule(t).filter(r => r.date === payday));
  return { contributionCents: sumCents(rounds.map(r => r.contributionCents)), payoutCents: sumCents(rounds.map(r => r.payoutCents)) };
}
