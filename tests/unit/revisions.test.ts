import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mergeRevisions } from '@paymentplan/sync';
import type { Operation, Movement, Card, LoanPayment } from '@paymentplan/contracts';
const vaultId = randomUUID(), entityId = randomUUID();
const movement: Movement = { cardId: randomUUID(), date: '2026-10-03', amountCents: 10000, kind: 'expense', description: 'Compra', scheduled: false,
  reconciled: false, statementId: null, allocations: [], importReference: null, recordedAt: '2026-10-03T12:00:00Z', legacyOrdinal: null };
function operation(base?: Operation, patch: Partial<Movement> = {}, extra: Partial<Operation> = {}): Operation {
  return { schemaVersion: 1, vaultId, operationId: randomUUID(), entityId, entityType: 'movement', deviceId: randomUUID(), deviceSequence: 1,
    parentRevisionIds: base ? [base.operationId] : [], dependencyOperationIds: [], groupId: null, groupIndex: 0, groupSize: 1,
    updatedAt: '2026-10-03T12:00:00Z', action: base ? 'replace' : 'create', payload: { ...movement, ...base?.payload, ...patch }, ...extra } as Operation;
}
test('production revisions are order independent, idempotent and preserve independent transactions', () => {
  const a = operation(), b = operation(undefined, {}, { entityId: randomUUID() }), c = operation(a, { description: 'Corrección' });
  const expected = mergeRevisions([a, b, c]);
  for (const input of [[c, b, a], [a, a, c, b, b], [b, a, c, c]]) assert.deepEqual(mergeRevisions(input), expected);
  assert.equal(expected.entities.length, 2); assert.equal(expected.pendingOperationIds.length, 0);
});
test('disjoint nonfinancial corrections merge with a single financial edit', () => {
  const a = operation(), b = operation(a, { amountCents: 12000 }), c = operation(a, { description: 'Compra corregida' });
  const merged = mergeRevisions([a, b, c]).entities[0]!;
  assert.equal(merged.status, 'merged'); assert.equal((merged.accepted?.payload as Movement).amountCents, 12000); assert.equal((merged.accepted?.payload as Movement).description, 'Compra corregida');
});
test('concurrent financial fields conflict regardless of unreliable device clocks', () => {
  const a = operation(), b = operation(a, { amountCents: 12000 }, { updatedAt: '2026-10-05T23:00:00Z' }), c = operation(a, { date: '2026-10-04' }, { updatedAt: '2026-10-02T12:00:00Z' });
  const state = mergeRevisions([a, b, c]).entities[0]!; assert.equal(state.status, 'conflict'); assert.deepEqual(state.accepted, a);
  const resolved = operation(b, { amountCents: 12000 }, { action: 'resolve', parentRevisionIds: [b.operationId, c.operationId] });
  assert.equal(mergeRevisions([a, b, c, resolved]).entities[0]!.status, 'accepted');
  const unseen = operation(a, { amountCents: 15000 }); assert.equal(mergeRevisions([a, b, c, resolved, unseen]).entities[0]!.status, 'conflict');
});
test('void versus edit conflicts, while a causal restoration preserves identity', () => {
  const a = operation(), tombstone = operation(a, {}, { action: 'void', payload: null }), edit = operation(a, { description: 'Corregido' });
  assert.equal(mergeRevisions([a, tombstone, edit]).entities[0]!.status, 'conflict');
  const restored = operation(tombstone, {}, { action: 'restore' }); assert.equal(mergeRevisions([a, tombstone, restored]).entities[0]!.status, 'accepted');
});
test('missing parents and incomplete groups never expose half of a financial command', () => {
  const a = operation(), groupId = randomUUID(), deviceId = randomUUID();
  const b = operation(a, {}, { groupId, groupSize: 2, groupIndex: 0, deviceId }), c = operation(undefined, {}, { entityId: randomUUID(), groupId, groupSize: 2, groupIndex: 1, deviceId, deviceSequence: 2 });
  assert.equal(mergeRevisions([b]).entities.length, 0); assert.equal(mergeRevisions([a, b]).entities.length, 1);
  assert.equal(mergeRevisions([c, b, a]).entities.length, 2); assert.equal(mergeRevisions([c, b, a]).pendingOperationIds.length, 0);
});
test('collisions, sequence reuse, mixed vaults, foreign parents and cycles are rejected', () => {
  const a = operation(), b = operation(a);
  assert.throws(() => mergeRevisions([a, { ...a, payload: { ...movement, amountCents: 123 } } as Operation]), /Colisión/);
  assert.throws(() => mergeRevisions([a, { ...b, deviceId: a.deviceId }]), /reutilizada/);
  assert.throws(() => mergeRevisions([a, { ...b, vaultId: randomUUID() }]), /distintas/);
  assert.throws(() => mergeRevisions([a, { ...b, entityId: randomUUID() }]), /otro registro/);
  assert.throws(() => mergeRevisions([{ ...a, action: 'replace', parentRevisionIds: [b.operationId] } as Operation, b]), /ciclo/);
});
test('a concurrent card name edit keeps a newly added limit history; competing changes conflict', () => {
  const card: Card = { name: 'Tarjeta', bank: 'Banco', limitCents: 10000, cutDay: 10, dueDay: 25, dueMonthOffset: null,
    color: '#123456', initialDebtOrigin: 'currentPeriod', archived: false };
  const root = { ...operation(), entityType: 'card', payload: card } as Operation;
  const limit = { ...operation(root), entityType: 'card', payload: { ...card, limitCents: 12000,
    limitChanges: [{ id: randomUUID(), date: '2026-10-03', deltaCents: 2000 }] } } as Operation;
  const name = { ...operation(root), entityType: 'card', payload: { ...card, name: 'Nueva' } } as Operation;
  const merged = mergeRevisions([root, limit, name]).entities[0]!;
  assert.equal(merged.status, 'merged');
  assert.deepEqual(merged.accepted?.payload, { ...limit.payload, name: 'Nueva' });
  const other = { ...operation(root), entityType: 'card', payload: { ...card, limitCents: 9000,
    limitChanges: [{ id: randomUUID(), date: '2026-10-03', deltaCents: -1000 }] } } as Operation;
  assert.equal(mergeRevisions([root, limit, other]).entities[0]!.status, 'conflict');
});
test('a concurrent loan payment description edit preserves installment confirmation and conflicting confirmations are reviewed', () => {
  const payment: LoanPayment = { loanId: randomUUID(), date: '2026-10-13', amountCents: 50000, description: 'Pago',
    scheduled: false, recordedAt: '2026-10-13T12:00:00Z', legacyOrdinal: null };
  const root = { ...operation(), entityType: 'loanPayment', payload: payment } as Operation;
  const confirm = { ...operation(root), entityType: 'loanPayment', payload: { ...payment, settledInstallmentDate: '2026-10-15' } } as Operation;
  const description = { ...operation(root), entityType: 'loanPayment', payload: { ...payment, description: 'Corregido' } } as Operation;
  const merged = mergeRevisions([root, confirm, description]).entities[0]!;
  assert.equal(merged.status, 'merged');
  assert.deepEqual(merged.accepted?.payload, { ...payment, settledInstallmentDate: '2026-10-15', description: 'Corregido' });
  const other = { ...operation(root), entityType: 'loanPayment', payload: { ...payment, settledInstallmentDate: '2026-10-31' } } as Operation;
  assert.equal(mergeRevisions([root, confirm, other]).entities[0]!.status, 'conflict');
});
