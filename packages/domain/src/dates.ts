import type { Card } from '@paymentplan/contracts';

export interface CivilDateParts { readonly year: number; readonly month: number; readonly day: number }
export type CardSchedule = Pick<Card, 'cutDay' | 'dueDay' | 'dueMonthOffset'>;

function integer(value: number, from: number, to: number): void {
  if (!Number.isInteger(value) || value < from || value > to) throw new RangeError('Fecha o día inválido.');
}

export function daysInMonth(year: number, month: number): number {
  integer(year, 1900, 9999); integer(month, 1, 12);
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function civilDate(value: string): CivilDateParts {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Usa una fecha civil YYYY-MM-DD.');
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  integer(day, 1, daysInMonth(year, month));
  return { year, month, day };
}

export function dateInMonth(year: number, month: number, day: number): string {
  integer(day, 1, 31);
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${Math.min(day, daysInMonth(year, month)).toString().padStart(2, '0')}`;
}

export function addMonths(value: string, months: number, requestedDay?: number): string {
  const { year, month, day } = civilDate(value);
  integer(months, -120000, 120000);
  const index = year * 12 + month - 1 + months;
  return dateInMonth(Math.floor(index / 12), index % 12 + 1, requestedDay ?? day);
}

export function addDays(value: string, days: number): string {
  let { year, month, day } = civilDate(value);
  integer(days, -3660, 3660);
  while (days > 0) {
    if (++day > daysInMonth(year, month)) { day = 1; if (++month > 12) { month = 1; year++; } }
    days--;
  }
  while (days < 0) {
    if (--day < 1) { if (--month < 1) { month = 12; year--; } day = daysInMonth(year, month); }
    days++;
  }
  return dateInMonth(year, month, day);
}

// Due dates at end of month use that day's income, including February and leap years.
export function paydayFor(value: string): string {
  const { year, month, day } = civilDate(value);
  if (day === daysInMonth(year, month)) return value;
  return day >= 15 ? dateInMonth(year, month, 15) : addMonths(value, -1, 31);
}

export function cutOnOrAfter(cutDay: number, value: string): string {
  const { year, month } = civilDate(value);
  const cut = dateInMonth(year, month, cutDay);
  return cut < value ? addMonths(cut, 1, cutDay) : cut;
}

export function cutOnOrBefore(cutDay: number, value: string): string {
  const { year, month } = civilDate(value);
  const cut = dateInMonth(year, month, cutDay);
  return cut > value ? addMonths(cut, -1, cutDay) : cut;
}

export function dueDateFor(schedule: CardSchedule, cutDate: string): string {
  civilDate(cutDate); integer(schedule.dueDay, 1, 31);
  if (schedule.dueMonthOffset !== null) {
    integer(schedule.dueMonthOffset, 0, 2);
    const due = addMonths(cutDate, schedule.dueMonthOffset, schedule.dueDay);
    if (due <= cutDate) throw new RangeError('El vencimiento debe ser posterior al corte; revisa el mes de pago.');
    return due;
  }
  const due = addMonths(cutDate, 0, schedule.dueDay);
  return due > cutDate ? due : addMonths(cutDate, 1, schedule.dueDay);
}

export function suggestedPaymentDate(dueDate: string, advanceDays = 2): string {
  integer(advanceDays, 0, 10);
  const suggested = addDays(dueDate, -advanceDays), payday = paydayFor(dueDate);
  return suggested < payday ? payday : suggested;
}

// Generates the entire requested horizon, without a fixed three-payday limit.
export function paydaysThrough(from: string, through: string): readonly string[] {
  civilDate(from); civilDate(through);
  if (through < from) throw new RangeError('El horizonte no puede ser anterior al inicio.');
  const result: string[] = [];
  let month = from.slice(0, 8) + '01';
  while (month <= through) {
    const { year, month: number } = civilDate(month);
    for (const date of [dateInMonth(year, number, 15), dateInMonth(year, number, 31)])
      if (date >= from && date <= through) result.push(date);
    if (month.slice(0, 7) === through.slice(0, 7)) break;
    month = addMonths(month, 1, 1);
  }
  return result;
}
