import { assertOperation, canonical } from '@paymentplan/contracts';
import type { Operation } from '@paymentplan/contracts';
export interface RevisionEntity {
  readonly entityId: string; readonly entityType: Operation['entityType']; readonly status: 'accepted' | 'void' | 'merged' | 'conflict';
  readonly accepted: Operation | null; readonly heads: readonly Operation[];
}
export interface RevisionState { readonly operations: readonly Operation[]; readonly entities: readonly RevisionEntity[]; readonly pendingOperationIds: readonly string[] }
const financialBundles: Partial<Record<Operation['entityType'], readonly string[]>> = {
  movement: ['cardId', 'date', 'amountCents', 'kind', 'scheduled', 'reconciled', 'statementId', 'allocations'],
  installment: ['cardId', 'principalCents', 'months', 'interestCents', 'startDate', 'firstCutDate', 'cutDay', 'purchaseId', 'interestIncludedInDebt', 'interestIncorporatedThrough', 'amortization'],
  balance: ['cardId', 'date', 'availableCents', 'debtCents', 'includedMovementIds', 'interestIncluded'],
  statement: ['cardId', 'cutDate', 'dueDate', 'targetCents', 'minimumCents', 'initialPaidCents', 'reservedCents', 'includedPaymentIds', 'estimated', 'balanceReferenceDate'],
  loan: ['principalCents', 'balanceDate', 'dueDate', 'includeReceivedMoney', 'archived'],
  loanPayment: ['loanId', 'date', 'amountCents', 'scheduled'],
  income: ['income15Cents', 'incomeEndCents', 'expensesCents', 'reserveCents'],
  budget: ['payday', 'expectedIncomeCents', 'receivedIncomeCents', 'expensesCents', 'reserveCents'],
};
function fieldMerge(base: Operation, heads: readonly Operation[]): Operation | null {
  if (!base.payload || heads.some(h => h.payload === null)) return null;
  const original = base.payload as unknown as Record<string, unknown>, result = { ...original };
  const changed = heads.map(h => Object.keys(h.payload!).filter(key => canonical((h.payload as unknown as Record<string, unknown>)[key]) !== canonical(original[key])));
  const bundle = financialBundles[base.entityType] ?? [];
  const financialWriters = changed.filter(fields => fields.some(field => bundle.includes(field)));
  if (financialWriters.length > 1) return null;
  for (const key of Object.keys(original)) {
    const values = heads.filter((_, index) => changed[index]!.includes(key)).map(h => (h.payload as unknown as Record<string, unknown>)[key]);
    if (new Set(values.map(canonical)).size > 1) return null;
    if (values.length) result[key] = values[0];
  }
  return { ...base, payload: result } as unknown as Operation;
}
export function mergeRevisions(input: readonly Operation[]): RevisionState {
  if (input.length > 100_000) throw Error('La cartera excede el límite de operaciones de esta versión.');
  const unique = new Map<string, Operation>(), sequences = new Map<string, string>();
  for (const op of input) {
    assertOperation(op);
    if (unique.has(op.operationId) && canonical(unique.get(op.operationId)) !== canonical(op)) throw Error('Colisión de ID de operación.');
    const sequence = `${op.deviceId}:${op.deviceSequence}`;
    if (sequences.has(sequence) && sequences.get(sequence) !== op.operationId) throw Error('Secuencia de dispositivo reutilizada.');
    sequences.set(sequence, op.operationId); unique.set(op.operationId, op);
  }
  const operations = [...unique.values()].sort((a, b) => a.operationId.localeCompare(b.operationId));
  if (new Set(operations.map(op => op.vaultId)).size > 1) throw Error('Las operaciones pertenecen a distintas carteras.');
  const groups = new Map<string, Operation[]>(), entityTypes = new Map<string, Operation['entityType']>();
  for (const op of operations) {
    if (entityTypes.has(op.entityId) && entityTypes.get(op.entityId) !== op.entityType) throw Error('Un ID fue usado por distintos tipos de registro.');
    entityTypes.set(op.entityId, op.entityType);
    const key = op.groupId ?? `single:${op.operationId}`;
    groups.set(key, [...(groups.get(key) ?? []), op]);
    for (const id of op.parentRevisionIds) {
      const parent = unique.get(id);
      if (parent && (parent.entityId !== op.entityId || parent.entityType !== op.entityType)) throw Error('Una revisión padre pertenece a otro registro.');
    }
  }
  // Reject cycles when all referenced operations are present, including dependencies across groups.
  const indegree = new Map<string, number>(), children = new Map<string, string[]>();
  for (const op of operations) {
    const parents = [...new Set([...op.parentRevisionIds, ...op.dependencyOperationIds])].filter(id => unique.has(id));
    indegree.set(op.operationId, parents.length);
    for (const id of parents) children.set(id, [...(children.get(id) ?? []), op.operationId]);
  }
  const ready = operations.filter(op => indegree.get(op.operationId) === 0).map(op => op.operationId);
  let seen = 0;
  for (let index = 0; index < ready.length; index++) {
    seen++;
    for (const id of children.get(ready[index]!) ?? []) { const count = indegree.get(id)! - 1; indegree.set(id, count); if (count === 0) ready.push(id); }
  }
  if (seen !== operations.length) throw Error('Las revisiones contienen un ciclo.');
  const applied = new Map<string, Operation>(), pending = new Set(groups.keys());
  let progress = true;
  while (progress) {
    progress = false;
    for (const key of [...pending].sort()) {
      const group = groups.get(key)!, first = group[0]!;
      if (group.some(op => op.deviceId !== first.deviceId || op.groupSize !== first.groupSize || op.groupIndex >= first.groupSize) ||
        new Set(group.map(op => op.groupIndex)).size !== group.length) throw Error('Metadatos del grupo atómico inválidos.');
      if (group.length !== first.groupSize) continue;
      const internal = new Set(group.map(op => op.operationId));
      if (group.some(op => [...op.parentRevisionIds, ...op.dependencyOperationIds].some(id => !internal.has(id) && !applied.has(id)))) continue;
      group.forEach(op => applied.set(op.operationId, op)); pending.delete(key); progress = true;
    }
  }
  const byEntity = new Map<string, Operation[]>();
  for (const op of applied.values()) byEntity.set(op.entityId, [...(byEntity.get(op.entityId) ?? []), op]);
  function ancestry(op: Operation): Set<string> {
    const result = new Set<string>(), queue = [op.operationId];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]!; if (result.has(id)) continue; result.add(id);
      queue.push(...(applied.get(id)?.parentRevisionIds ?? []));
    }
    return result;
  }
  const entities: RevisionEntity[] = [];
  for (const [entityId, revisions] of [...byEntity].sort(([a], [b]) => a.localeCompare(b))) {
    const replaced = new Set(revisions.flatMap(op => op.parentRevisionIds));
    const heads = revisions.filter(op => !replaced.has(op.operationId)).sort((a, b) => a.operationId.localeCompare(b.operationId));
    if (heads.length === 1) { entities.push({ entityId, entityType: heads[0]!.entityType, status: heads[0]!.action === 'void' ? 'void' : 'accepted', accepted: heads[0]!, heads }); continue; }
    const ancestors = heads.map(ancestry), common = [...ancestors[0]!].filter(id => ancestors.every(set => set.has(id)));
    const commonParents = new Set(common.flatMap(id => applied.get(id)!.parentRevisionIds));
    const bases = common.filter(id => !commonParents.has(id));
    const base = bases.length === 1 ? applied.get(bases[0]!)! : null, merged = base ? fieldMerge(base, heads) : null;
    entities.push({ entityId, entityType: heads[0]!.entityType, status: merged ? 'merged' : 'conflict', accepted: merged ?? base, heads });
  }
  return { operations, entities, pendingOperationIds: [...pending].flatMap(key => groups.get(key)!.map(op => op.operationId)).sort() };
}
