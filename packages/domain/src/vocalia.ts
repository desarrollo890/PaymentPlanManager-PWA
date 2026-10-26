import type { VocalDelivery, VocalEvent, VocalExemption, VocalGroup, VocalPayment, VocalStudent } from '@paymentplan/contracts';
import { live } from './portfolio.ts';
import type { FinancialRecord, Portfolio } from './portfolio.ts';
import { sumCents } from './money.ts';

export interface VocalStudentRow {
  readonly id: string; readonly name: string; readonly owed: boolean; readonly paidCents: number; readonly pendingCents: number;
  readonly payments: readonly FinancialRecord<VocalPayment>[]; readonly exemption: FinancialRecord<VocalExemption> | null;
}
export interface VocalEventSummary {
  readonly id: string; readonly value: VocalEvent; readonly students: readonly VocalStudentRow[];
  readonly owedCount: number; readonly paidCount: number; readonly expectedCents: number;
  readonly collectedCents: number; readonly cashCents: number; readonly transferCents: number; readonly pendingCents: number;
  readonly overdue: boolean; readonly exemptCount: number; readonly deliveries: readonly FinancialRecord<VocalDelivery>[];
  readonly deliveredCents: number; readonly cashInHandCents: number; readonly transferHeldCents: number; readonly toDeliverCents: number;
}
export interface VocalGroupView {
  readonly id: string; readonly value: VocalGroup; readonly students: readonly FinancialRecord<VocalStudent>[]; readonly events: readonly VocalEventSummary[];
}

// Un alumno cubre el evento si ya pagó o si estaba inscrito en la fecha del evento, salvo que esté exento de ese evento.
export function studentOwes(student: VocalStudent, event: VocalEvent, paidCents: number, exempt = false): boolean {
  if (exempt) return false;
  return paidCents > 0 || (student.joinedDate <= event.date && (student.leftDate === null || student.leftDate >= event.date));
}
export function suggestedQuota(goalCents: number, students: number): number {
  if (!Number.isSafeInteger(goalCents) || goalCents < 1 || students < 1) throw Error('Captura una meta y al menos un alumno activo.');
  return Math.ceil(goalCents / students);
}
export function vocalEventSummary(p: Portfolio, eventId: string, today: string): VocalEventSummary {
  const event = live(p.vocalEvents).find(e => e.id === eventId);
  if (!event) throw Error('Evento ausente.');
  const payments = live(p.vocalPayments).filter(x => x.value.eventId === eventId), exemptions = live(p.vocalExemptions).filter(x => x.value.eventId === eventId);
  const deliveries = live(p.vocalDeliveries).filter(x => x.value.eventId === eventId).sort((a, b) => a.value.date.localeCompare(b.value.date));
  const students = live(p.vocalStudents).filter(s => s.value.groupId === event.value.groupId).map(s => {
    const own = payments.filter(x => x.value.studentId === s.id), paidCents = sumCents(own.map(x => x.value.amountCents)), exemption = exemptions.find(x => x.value.studentId === s.id) ?? null;
    const owed = studentOwes(s.value, event.value, paidCents, exemption !== null);
    return { id: s.id, name: s.value.name, owed, paidCents, pendingCents: owed ? Math.max(0, event.value.quotaCents - paidCents) : 0, payments: own, exemption };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const owedRows = students.filter(s => s.owed), pendingCents = sumCents(students.map(s => s.pendingCents));
  const sumMethod = (method: VocalPayment['method']) => sumCents(payments.filter(x => x.value.method === method).map(x => x.value.amountCents));
  const delivered = (method: VocalPayment['method']) => sumCents(deliveries.filter(x => x.value.method === method).map(x => x.value.amountCents));
  const cashCents = sumMethod('cash'), transferCents = sumMethod('transfer'), collectedCents = cashCents + transferCents, deliveredCents = delivered('cash') + delivered('transfer');
  return { id: event.id, value: event.value, students, owedCount: owedRows.length, paidCount: owedRows.filter(s => s.pendingCents === 0).length,
    expectedCents: owedRows.length * event.value.quotaCents, collectedCents, cashCents, transferCents, pendingCents, overdue: pendingCents > 0 && event.value.date < today,
    exemptCount: students.filter(s => s.exemption).length, deliveries, deliveredCents, cashInHandCents: Math.max(0, cashCents - delivered('cash')),
    transferHeldCents: Math.max(0, transferCents - delivered('transfer')), toDeliverCents: Math.max(0, collectedCents - deliveredCents) };
}
export function vocalView(p: Portfolio, today: string): readonly VocalGroupView[] {
  return live(p.vocalGroups).map(g => ({ id: g.id, value: g.value,
    students: live(p.vocalStudents).filter(s => s.value.groupId === g.id).sort((a, b) => a.value.name.localeCompare(b.value.name, 'es')),
    events: live(p.vocalEvents).filter(e => e.value.groupId === g.id).sort((a, b) => b.value.date.localeCompare(a.value.date)).map(e => vocalEventSummary(p, e.id, today)) }))
    .sort((a, b) => Number(a.value.archived) - Number(b.value.archived) || b.value.cycle.localeCompare(a.value.cycle) || a.value.name.localeCompare(b.value.name, 'es'));
}
// Dinero de terceros recibido por transferencia en una cuenta propia y aún no entregado, mientras el evento no se liquide.
export function vocalHeld(p: Portfolio, accountId: string, today = '9999-12-31'): number {
  return sumCents(live(p.vocalEvents).filter(e => e.value.accountId === accountId && !e.value.settled).map(e => vocalEventSummary(p, e.id, today).transferHeldCents));
}
const fmt = (cents: number) => '$' + (cents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function vocalPendingReport(group: VocalGroup, e: VocalEventSummary): string {
  const rows = e.students.filter(s => s.pendingCents > 0);
  return [`Pendientes · ${e.value.name} · ${group.name} (${group.cycle})`, `Cuota por alumno: ${fmt(e.value.quotaCents)}`, '',
    ...(rows.length ? rows.map(s => `• ${s.name}: ${fmt(s.pendingCents)}${s.paidCents > 0 ? ` (abonó ${fmt(s.paidCents)})` : ''}`) : ['Todos los alumnos han cubierto su cuota.'])].join('\n');
}
// Resumen para el grupo: sin nombres ni montos individuales.
export function vocalSummaryText(group: VocalGroup, e: VocalEventSummary): string {
  return [`Cuentas del evento · ${e.value.name} · ${group.name} (${group.cycle})`, `Meta: ${fmt(e.value.goalCents)}`, `Cuota por alumno: ${fmt(e.value.quotaCents)}`,
    `Recaudado: ${fmt(e.collectedCents)}`, `Entregado a dirección: ${fmt(e.deliveredCents)}`, `Falta por recaudar: ${fmt(e.pendingCents)}`, `Alumnos con cuota cubierta: ${e.paidCount} de ${e.owedCount}`,
    e.exemptCount ? `Alumnos que no participan o pagaron directo: ${e.exemptCount}` : '', e.value.settled ? 'Evento liquidado.' : ''].filter(Boolean).join('\n');
}
