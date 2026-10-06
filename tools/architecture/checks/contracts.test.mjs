import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { mergeRevisions } from '../revisions.mjs';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strictRequired: false });
addFormats(ajv);
const schema = name => JSON.parse(readFileSync(new URL(`../../../contracts/v1/${name}.schema.json`, import.meta.url)));
ajv.addSchema(schema('operation'));
const validOperation = ajv.getSchema('urn:paymentplan:operation:v1');
const validBatch = ajv.compile(schema('batch'));
const validBlock = ajv.compile(schema('encrypted-block'));
const vaultId = randomUUID(), deviceId = randomUUID(), cardId = randomUUID();
function payment(overrides = {}) {
  return { schemaVersion: 1, vaultId, deviceId, operationId: randomUUID(), entityId: randomUUID(), entityType: 'movement',
    deviceSequence: 1, parentRevisionIds: [], dependencyOperationIds: [], groupId: null, groupIndex: 0, groupSize: 1,
    action: 'create', updatedAt: '2026-10-03T18:00:00Z', payload: { cardId, date: '2026-10-03', amountCents: 100000,
      kind: 'payment', description: 'Synthetic payment', scheduled: false, reconciled: false, statementId: null,
      allocations: [], importReference: null, recordedAt: '2026-10-03T18:00:00Z', legacyOrdinal: null }, ...overrides };
}
function checked(...ops) {
  for (const op of ops) assert(validOperation(op), JSON.stringify(validOperation.errors));
  return mergeRevisions(ops);
}
function edit(base, amountCents, overrides = {}) {
  return { ...base, operationId: randomUUID(), action: 'replace', deviceSequence: base.deviceSequence + 1,
    parentRevisionIds: [base.operationId], payload: { ...base.payload, amountCents }, ...overrides };
}

test('v1 accepts strict payment payload and rejects invalid dates, fractional cents, unknown fields and future schema', () => {
  const op = payment(); assert(validOperation(op));
  assert(validOperation({ ...op, payload: { ...op.payload, recordedAt: null, legacyOrdinal: 0 } }));
  assert.equal(validOperation({ ...op, payload: { ...op.payload, recordedAt: null } }), false);
  for (const bad of [{ ...op, schemaVersion: 2 }, { ...op, token: 'forbidden' },
    { ...op, payload: { ...op.payload, amountCents: 1.5 } }, { ...op, payload: { ...op.payload, date: '2026-02-30' } },
    { ...op, action: 'replace' }, { ...op, entityType: 'balance', payload: op.payload }]) assert.equal(validOperation(bad), false);
});
test('batch validates operation payloads and encrypted format rejects wrong IV and unbounded KDF', () => {
  assert(validBatch({ schemaVersion: 1, vaultId, batchId: randomUUID(), deviceId, operations: [payment()] }));
  const block = { schemaVersion: 1, vaultId, keyId: randomUUID(), blockId: randomUUID(), purpose: 'batch', algorithm: 'AES-256-GCM',
    kdf: null, ivBase64: Buffer.alloc(12).toString('base64'), ciphertextBase64: Buffer.alloc(16).toString('base64') };
  assert(validBlock(block)); assert.equal(validBlock({ ...block, ivBase64: '' }), false);
  assert.equal(validBlock({ ...block, purpose: 'dataKeyWrap', kdf: { algorithm: 'PBKDF2-SHA256', iterations: 2000001, saltBase64: Buffer.alloc(16).toString('base64') } }), false);
});
test('independent payments survive reversed delivery and retries', () => {
  const a = payment(), b = payment();
  assert.deepEqual(checked(a, b, a), checked(b, a, b));
  assert.equal(checked(a, b).appliedCount, 2);
  assert.equal(checked(a, b).entities.reduce((sum, e) => sum + e.accepted.payload.amountCents, 0), 200000);
});
test('causal replacement wins even with an older device timestamp', () => {
  const base = payment(), child = edit(base, 120000, { updatedAt: '2026-10-02T18:00:00Z' });
  assert.equal(checked(child, base).entities[0].accepted.payload.amountCents, 120000);
});
test('concurrent amounts preserve common base and both branches instead of LWW', () => {
  const base = payment(), pc = edit(base, 120000), phone = edit(base, 150000, { deviceId: randomUUID() });
  const result = checked(phone, pc, base).entities[0];
  assert.equal(result.status, 'conflict'); assert.equal(result.accepted.payload.amountCents, 100000);
  assert.equal(result.heads.length, 2); assert.deepEqual(checked(base, pc, phone), checked(phone, base, pc));
});
test('resolution names both branches; a concurrent unobserved branch remains a conflict', () => {
  const base = payment(), a = edit(base, 120000), b = edit(base, 150000);
  const resolved = edit(a, 130000, { action: 'resolve', parentRevisionIds: [a.operationId, b.operationId] });
  assert.equal(checked(resolved, b, base, a).entities[0].accepted.payload.amountCents, 130000);
  const late = edit(base, 160000);
  assert.equal(checked(resolved, late, b, a, base).entities[0].status, 'conflict');
});
test('void versus edit does not resurrect or discard the movement', () => {
  const base = payment(), a = edit(base, 120000), deleted = edit(base, 100000, { action: 'void', payload: null });
  assert.equal(checked(base, a, deleted).entities[0].status, 'conflict');
});
test('missing parents and dependencies remain pending until delivered', () => {
  const parent = payment(), child = edit(parent, 120000);
  assert.deepEqual(checked(child).pendingOperationIds, [child.operationId]);
  assert.equal(checked(child, parent).pendingOperationIds.length, 0);
});
test('an incomplete atomic group cannot apply one financial half', () => {
  const groupId = randomUUID(), a = payment({ groupId, groupSize: 2, groupIndex: 0 }), b = payment({ groupId, groupSize: 2, groupIndex: 1 });
  assert.equal(checked(a).appliedCount, 0);
  assert.equal(checked(b, a).appliedCount, 2);
  const independent = payment({ operationId: groupId });
  assert.equal(checked(a, independent).appliedCount, 1);
});
test('concurrent independent creates for the same entity preserve both roots without inventing a base', () => {
  const a = payment(), b = payment({ entityId: a.entityId, deviceId: randomUUID() });
  const state = checked(a, b).entities[0];
  assert.equal(state.status, 'conflict'); assert.equal(state.accepted, null); assert.equal(state.heads.length, 2);
});
test('duplicate atomic positions and groups with multiple authors are rejected', () => {
  const groupId = randomUUID(), a = payment({ groupId, groupSize: 2 }), b = payment({ groupId, groupSize: 2 });
  assert.throws(() => checked(a, b), /position/);
  assert.throws(() => checked(a, { ...b, groupIndex: 1, deviceId: randomUUID() }), /authors/);
});
test('same operation ID with different content, mixed vaults and foreign parents are rejected', () => {
  const base = payment();
  assert.throws(() => checked(base, { ...base, payload: { ...base.payload, amountCents: 2 } }), /collision/);
  assert.throws(() => checked(base, payment({ vaultId: randomUUID() })), /Mixed vaults/);
  assert.throws(() => checked(base, payment({ action: 'replace', parentRevisionIds: [base.operationId] })), /another entity/);
  const device = payment({ entityId: base.entityId, entityType: 'device', payload: { label: 'Synthetic device', retired: false } });
  assert.throws(() => checked(base, device), /across types/);
});
test('the .NET fixture includes exact debt capacity, scheduled movement, Plata and full remaining horizon', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/financial-reference.v1.json', import.meta.url)));
  assert.equal(fixture.synthetic, true); assert.equal(fixture.cases.length, 8);
  const capacity = fixture.cases.find(c => c.id === 'available-debt');
  assert.deepEqual(capacity.steps.map(s => s.expected.cards[0].freeDebtCents), [1000000, 400000, 450000, 300000, 300000, 0]);
  const start = fixture.cases.find(c => c.id === 'initial-current-period').steps[0].expected;
  assert(start.cards[0].cuts.every(c => c.cutDate >= '2026-10-03'));
  const plata = fixture.cases.find(c => c.id === 'plata-deadline').steps.at(-1).expected.cards[0];
  assert.equal(plata.plans[0].quotas[0].dueDate, '2026-12-02'); assert.equal(plata.plans[0].quotas[1].dueDate, '2027-01-02');
  assert.equal(fixture.rounding.quotas.reduce((s, q) => s + q.principalCents, 0), 12001);
  assert.equal(fixture.rounding.quotas.at(-1).cutDate, '2036-09-11');
  for (const row of fixture.paydays) assert(row.expectedPayday <= row.dueDate);
});
