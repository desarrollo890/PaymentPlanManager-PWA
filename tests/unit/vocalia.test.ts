import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinancialCommands } from '@paymentplan/application';
import { applyChanges, cashView, emptyPortfolio, vocalEventSummary, vocalHeld, vocalSummaryText } from '@paymentplan/domain';
import type { Change, Portfolio } from '@paymentplan/domain';

const today = '2026-10-20';
function harness() {
  let state: Portfolio = emptyPortfolio(); const context = { today, now: today + 'T18:00:00Z', newId: randomUUID };
  const h = { get p() { return state; }, get cmd() { return new FinancialCommands(state, context); }, commit(changes: Change[]) { state = applyChanges(state, changes); },
    setup(students = 4, goal = 100000, accountId: string | null = null) {
      h.commit(h.cmd.saveCashAccount({ name: 'Débito', kind: 'debit', openingDate: '2026-09-01', openingCents: 100000, color: '#123456', archived: false }));
      const account = state.cashAccounts.at(-1)!.id;
      h.commit(h.cmd.saveVocalGroup({ name: '3° A', cycle: '2026-2027', color: '#0067D8', archived: false })); const groupId = state.vocalGroups.at(-1)!.id;
      for (let i = 0; i < students; i++) h.commit(h.cmd.saveVocalStudent({ groupId, name: `Alumno ${i}`, joinedDate: '2026-08-20', leftDate: null }));
      h.commit(h.cmd.saveVocalEvent({ groupId, name: 'Posada', date: '2026-12-10', goalCents: goal, quotaCents: null, accountId: accountId === 'use' ? account : null, settled: false, archived: false }));
      return { account, groupId, eventId: state.vocalEvents.at(-1)!.id, students: state.vocalStudents.map(s => s.id) };
    },
    pay(eventId: string, studentId: string, method: 'cash' | 'transfer', amountCents = 25000, date = today) { h.commit(h.cmd.recordVocalPayment({ eventId, studentId, date, amountCents, method, note: '' })); } };
  return h;
}

test('quota defaults to goal divided by active students, rounded up', () => {
  const h = harness(), s = h.setup(3, 100000);
  assert.equal(h.p.vocalEvents.at(-1)!.value.quotaCents, 33334);
  assert.equal(vocalEventSummary(h.p, s.eventId, today).expectedCents, 100002);
});

test('students who joined after the event or left before it owe nothing, unless they paid', () => {
  const h = harness(), s = h.setup(2);
  h.commit(h.cmd.saveVocalEvent({ ...h.p.vocalEvents.at(-1)!.value, date: '2026-10-01' }, s.eventId));
  h.commit(h.cmd.saveVocalStudent({ groupId: s.groupId, name: 'Nuevo', joinedDate: '2026-10-15', leftDate: null }));
  h.commit(h.cmd.saveVocalStudent({ groupId: s.groupId, name: 'Baja', joinedDate: '2026-08-20', leftDate: '2026-09-15' }));
  const summary = vocalEventSummary(h.p, s.eventId, today), by = (n: string) => summary.students.find(x => x.name === n)!;
  assert.equal(by('Nuevo').owed, false); assert.equal(by('Baja').owed, false); assert.equal(summary.owedCount, 2);
  h.pay(s.eventId, by('Nuevo').id, 'cash');
  assert.equal(vocalEventSummary(h.p, s.eventId, today).students.find(x => x.name === 'Nuevo')!.owed, true);
});

test('totals split cash and transfer, and a second live payment for the same student is rejected', () => {
  const h = harness(), s = h.setup(4, 100000, 'use');
  h.pay(s.eventId, s.students[0]!, 'cash'); h.pay(s.eventId, s.students[1]!, 'transfer');
  const e = vocalEventSummary(h.p, s.eventId, today);
  assert.equal(e.cashCents, 25000); assert.equal(e.transferCents, 25000); assert.equal(e.collectedCents, 50000); assert.equal(e.pendingCents, 50000); assert.equal(e.paidCount, 2);
  assert.throws(() => h.cmd.recordVocalPayment({ eventId: s.eventId, studentId: s.students[0]!, date: today, amountCents: 25000, method: 'cash', note: '' }));
  assert.throws(() => h.cmd.recordVocalPayment({ eventId: s.eventId, studentId: s.students[2]!, date: '2026-12-31', amountCents: 25000, method: 'cash', note: '' }));
});

test('transfers are held money until the event is settled, and leave the free balance', () => {
  const h = harness(), s = h.setup(4, 100000, 'use');
  h.pay(s.eventId, s.students[0]!, 'transfer');
  assert.equal(vocalHeld(h.p, s.account), 25000);
  const view = cashView(h.p, today).accounts.find(a => a.id === s.account)!;
  assert.equal(view.heldCents, 25000); assert.equal(view.freeCents, view.balanceCents - 25000);
  assert.throws(() => h.cmd.saveVocalEvent({ ...h.p.vocalEvents.at(-1)!.value, settled: true }, s.eventId), /entrega/);
  h.commit(h.cmd.recordVocalDelivery({ eventId: s.eventId, date: today, amountCents: 25000, method: 'transfer', note: '' }));
  assert.equal(vocalHeld(h.p, s.account), 0);
  h.commit(h.cmd.saveVocalEvent({ ...h.p.vocalEvents.at(-1)!.value, settled: true }, s.eventId));
  assert.equal(vocalHeld(h.p, s.account), 0);
});

test('exempt students leave the pending list and expected quota; deliveries are capped by what was collected', () => {
  const h = harness(), s = h.setup(4, 100000);
  h.commit(h.cmd.setVocalExemption(s.eventId, s.students[3]!, 'Pagó en dirección'));
  let e = vocalEventSummary(h.p, s.eventId, today);
  assert.equal(e.owedCount, 3); assert.equal(e.exemptCount, 1); assert.equal(e.pendingCents, 75000);
  assert.throws(() => h.cmd.recordVocalPayment({ eventId: s.eventId, studentId: s.students[3]!, date: today, amountCents: 25000, method: 'cash', note: '' }));
  h.pay(s.eventId, s.students[0]!, 'cash');
  assert.throws(() => h.cmd.setVocalExemption(s.eventId, s.students[0]!, ''));
  assert.throws(() => h.cmd.recordVocalDelivery({ eventId: s.eventId, date: today, amountCents: 25001, method: 'cash', note: '' }));
  assert.throws(() => h.cmd.recordVocalDelivery({ eventId: s.eventId, date: today, amountCents: 100, method: 'transfer', note: '' }));
  h.commit(h.cmd.recordVocalDelivery({ eventId: s.eventId, date: today, amountCents: 10000, method: 'cash', note: '' }));
  e = vocalEventSummary(h.p, s.eventId, today);
  assert.equal(e.toDeliverCents, 15000); assert.equal(e.cashInHandCents, 15000);
  h.commit(h.cmd.voidExtension('vocalExemption', h.p.vocalExemptions[0]!.id));
  assert.equal(vocalEventSummary(h.p, s.eventId, today).owedCount, 4);
});

test('voided payments stop counting and the group summary hides individual amounts', () => {
  const h = harness(), s = h.setup(2, 50000);
  h.pay(s.eventId, s.students[0]!, 'cash');
  h.commit(h.cmd.voidExtension('vocalPayment', h.p.vocalPayments.at(-1)!.id));
  assert.equal(vocalEventSummary(h.p, s.eventId, today).collectedCents, 0);
  h.pay(s.eventId, s.students[0]!, 'cash');
  const text = vocalSummaryText(h.p.vocalGroups[0]!.value, vocalEventSummary(h.p, s.eventId, today));
  assert.ok(!text.includes('Alumno 0'));
});
