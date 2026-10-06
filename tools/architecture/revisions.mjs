// F0 feasibility prototype. It does not implement financial projection or field merging.
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
export function mergeRevisions(operations) {
  const unique = new Map();
  for (const op of operations) {
    if (unique.has(op.operationId) && canonical(unique.get(op.operationId)) !== canonical(op)) throw new Error('Operation ID collision');
    unique.set(op.operationId, op);
  }
  if (new Set([...unique.values()].map(op => op.vaultId)).size > 1) throw new Error('Mixed vaults');
  const groups = new Map(), entityTypes = new Map();
  for (const op of unique.values()) {
    if (entityTypes.has(op.entityId) && entityTypes.get(op.entityId) !== op.entityType) throw new Error('Entity ID collision across types');
    entityTypes.set(op.entityId, op.entityType);
    const key = op.groupId === null ? `operation:${op.operationId}` : `group:${op.groupId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(op);
    for (const id of op.parentRevisionIds) {
      const parent = unique.get(id);
      if (parent && (parent.entityId !== op.entityId || parent.entityType !== op.entityType)) throw new Error('Parent belongs to another entity');
    }
  }
  const applied = new Map(), pending = new Set(groups.keys());
  let progress = true;
  while (progress) {
    progress = false;
    for (const key of [...pending].sort()) {
      const group = groups.get(key), size = group[0].groupSize;
      if (group.some(op => op.deviceId !== group[0].deviceId)) throw new Error('Atomic group has multiple authors');
      if (group.some(op => op.groupSize !== size || op.groupIndex >= size)) throw new Error('Invalid group metadata');
      if (new Set(group.map(op => op.groupIndex)).size !== group.length) throw new Error('Duplicate group position');
      if (group.length !== size) continue;
      const internal = new Set(group.map(op => op.operationId));
      if (group.some(op => [...op.parentRevisionIds, ...op.dependencyOperationIds].some(id => !internal.has(id) && !applied.has(id)))) continue;
      const remaining = [...group];
      const ready = new Map(applied);
      while (remaining.length) {
        const index = remaining.findIndex(op => [...op.parentRevisionIds, ...op.dependencyOperationIds].every(id => ready.has(id)));
        if (index < 0) throw new Error('Cyclic operation group');
        const [op] = remaining.splice(index, 1); ready.set(op.operationId, op);
      }
      for (const op of group) applied.set(op.operationId, op);
      pending.delete(key); progress = true;
    }
  }
  const entities = new Map();
  for (const op of applied.values()) {
    if (!entities.has(op.entityId)) entities.set(op.entityId, []);
    entities.get(op.entityId).push(op);
  }
  function ancestry(op, seen = new Set()) {
    if (seen.has(op.operationId)) return seen;
    seen.add(op.operationId);
    for (const id of op.parentRevisionIds) ancestry(applied.get(id), seen);
    return seen;
  }
  const result = [...entities.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([entityId, revisions]) => {
    const replaced = new Set(revisions.flatMap(op => op.parentRevisionIds));
    const heads = revisions.filter(op => !replaced.has(op.operationId)).sort((a, b) => a.operationId.localeCompare(b.operationId));
    if (heads.length === 1) return { entityId, status: heads[0].action === 'void' ? 'void' : 'accepted', accepted: heads[0], heads: heads.map(op => op.operationId) };
    const ancestors = heads.map(op => ancestry(op));
    const common = [...ancestors[0]].filter(id => ancestors.every(set => set.has(id)));
    const commonParents = new Set(common.flatMap(id => applied.get(id).parentRevisionIds));
    const bases = common.filter(id => !commonParents.has(id));
    return { entityId, status: 'conflict', accepted: bases.length === 1 ? applied.get(bases[0]) : null, heads: heads.map(op => op.operationId) };
  });
  return { entities: result, pendingOperationIds: [...pending].flatMap(key => groups.get(key).map(op => op.operationId)).sort(), appliedCount: applied.size };
}
