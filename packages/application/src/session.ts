import { assertBatch, assertBlock, assertPayload, canonical, operationVersion } from '@paymentplan/contracts';
import type { Batch, Operation } from '@paymentplan/contracts';
import { applyChanges, assertPortfolio, emptyPortfolio, entityTables, financeView, portfolioIssues } from '@paymentplan/domain';
import type { Change, FinancialEntityType, Portfolio } from '@paymentplan/domain';
import { assertVaultHeader, decodeJson, encodeJson } from '@paymentplan/crypto';
import type { VaultCipher, VaultHeader } from '@paymentplan/crypto';
import { IndexedVaultStore } from '@paymentplan/storage';
import type { StoredVault } from '@paymentplan/storage';
import { mergeRevisions } from '@paymentplan/sync';
import type { RevisionState } from '@paymentplan/sync';
import type { EncryptedBlock } from '@paymentplan/contracts';
import { FinancialCommands } from './commands.ts';
import { historyIssues } from './coherence.ts';
import type { FinancialIssue } from '@paymentplan/domain';

export interface EncryptedBackup { readonly format: 'paymentplan-encrypted-backup-v1'; readonly header: VaultHeader; readonly blocks: readonly EncryptedBlock[]; readonly createdAt: string }
export function assertBackup(value: unknown): asserts value is EncryptedBackup {
  if (!value || typeof value !== 'object') throw Error('Respaldo inválido.');
  const backup = value as EncryptedBackup; assertVaultHeader(backup.header);
  if (backup.format !== 'paymentplan-encrypted-backup-v1' || !Array.isArray(backup.blocks) || backup.blocks.length > 100_000) throw Error('Formato de respaldo incompatible.');
  for (const block of backup.blocks) {
    assertBlock(block); if (block.vaultId !== backup.header.vaultId || block.keyId !== backup.header.keyId || block.purpose !== 'batch') throw Error('El respaldo mezcla claves o carteras.');
  }
}
export function portfolioFromRevisions(state: RevisionState): Portfolio {
  let portfolio = emptyPortfolio();
  const operations = new Map(state.operations.map(op => [op.operationId, op]));
  for (const entity of state.entities) {
    if (entity.entityType === 'device') continue;
    let payload = entity.accepted?.payload;
    if (!payload && entity.status === 'void') {
      const pending = [...(entity.accepted?.parentRevisionIds ?? [])], ancestors: Operation[] = [], seen = new Set<string>();
      for (let index = 0; index < pending.length; index++) {
        const id = pending[index]!; if (seen.has(id)) continue; seen.add(id);
        const op = operations.get(id); if (op) { ancestors.push(op); pending.push(...op.parentRevisionIds, ...op.dependencyOperationIds); }
      }
      const historical = mergeRevisions(ancestors).entities.find(e => e.entityId === entity.entityId);
      payload = historical?.accepted?.payload;
      if (!payload) payload = ancestors.find(op => op.entityId === entity.entityId && op.payload !== null)?.payload;
    }
    if (!payload) continue;
    portfolio = applyChanges(portfolio, [{ entityType: entity.entityType, entityId: entity.entityId, payload, voided: entity.status === 'void' } as Change]);
  }
  return portfolio;
}
export async function decodeBatches(header: VaultHeader, cipher: VaultCipher, blocks: readonly EncryptedBlock[]): Promise<Operation[]> {
  const operations: Operation[] = [];
  for (const block of blocks) {
    if (block.keyId !== header.keyId || block.vaultId !== header.vaultId || block.purpose !== 'batch') throw Error('Bloque de otra cartera o clave.');
    const value = decodeJson(await cipher.open(block, { vaultId: header.vaultId, keyId: header.keyId, blockId: block.blockId, purpose: 'batch' }));
    assertBatch(value);
    if (value.vaultId !== header.vaultId || value.batchId !== block.blockId) throw Error('El contenido no corresponde al bloque autenticado.');
    operations.push(...value.operations);
  }
  return operations;
}
export class VaultSession {
  readonly store: IndexedVaultStore; readonly header: VaultHeader; readonly cipher: VaultCipher;
  private stored: StoredVault | null = null;
  private revisionState: RevisionState = mergeRevisions([]);
  private financialState: Portfolio = emptyPortfolio();
  private locked = false;
  private historicalIssues: FinancialIssue[] = [];
  constructor(store: IndexedVaultStore, header: VaultHeader, cipher: VaultCipher) { this.store = store; this.header = header; this.cipher = cipher; }
  get portfolio(): Portfolio { this.ensureUnlocked(); return this.financialState; }
  get revisions(): RevisionState { this.ensureUnlocked(); return this.revisionState; }
  get pendingCount(): number { return this.stored?.pending.length ?? 0; }
  get deviceId(): string { return this.stored?.metadata.deviceId ?? ''; }
  get unlocked(): boolean { return !this.locked && this.cipher.unlocked; }
  private ensureUnlocked(): void { if (!this.unlocked) throw Error('Desbloquea la cartera para continuar.'); }
  lock(): void { this.locked = true; this.cipher.lock(); this.financialState = emptyPortfolio(); this.revisionState = mergeRevisions([]); this.stored = null; this.historicalIssues = []; }
  async refresh(): Promise<void> {
    this.ensureUnlocked(); const stored = await this.store.load(this.header.vaultId);
    const operations = await decodeBatches(this.header, this.cipher, stored.blocks); this.ensureUnlocked();
    const revisions = mergeRevisions(operations), financial = portfolioFromRevisions(revisions);
    const historical = portfolioIssues(financial, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })).length ? []
      : await historyIssues(revisions, financial, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
    this.ensureUnlocked(); this.revisionState = revisions; this.financialState = financial; this.historicalIssues = historical; this.stored = stored;
  }
  issues(today: string) { return [...portfolioIssues(this.portfolio, today), ...this.historicalIssues]; }
  get hasRevisionConflicts(): boolean { return this.revisionState.entities.some(e => e.status === 'conflict') || this.revisionState.pendingOperationIds.length > 0; }
  view(today: string) { return financeView(this.portfolio, today); }
  commands(today: string): FinancialCommands {
    if (this.hasRevisionConflicts || this.issues(today).length) throw Error('Resuelve los conflictos antes de registrar cambios financieros.');
    return new FinancialCommands(this.portfolio, { today, now: new Date().toISOString(), newId: () => crypto.randomUUID() });
  }
  async commit(changes: readonly Change[], today: string, resolution = false): Promise<void> {
    this.ensureUnlocked(); if (!this.stored) throw Error('Carga la cartera antes de registrar cambios.');
    if (!changes.length) return;
    if (!resolution && (this.hasRevisionConflicts || this.issues(today).length)) throw Error('Resuelve los conflictos antes de continuar.');
    if (new Set(changes.map(c => c.entityId)).size !== changes.length) throw Error('El comando modifica dos veces el mismo registro.');
    for (const change of changes) assertPayload(change.entityType, change.payload);
    const candidate = applyChanges(this.portfolio, changes); if (!resolution) assertPortfolio(candidate, today);
    let sequence = Math.max(this.stored.metadata.sequence, ...this.revisionState.operations.filter(op => op.deviceId === this.deviceId).map(op => op.deviceSequence));
    // Imported annulled records need a causal create before their tombstone, so
    // the historical payload survives while neither revision changes the live balance.
    const steps = changes.flatMap(change => change.voided && !this.revisionState.entities.some(e => e.entityId === change.entityId)
      ? [{ change: { ...change, voided: false } as Change, id: crypto.randomUUID(), seed: true }, { change, id: crypto.randomUUID(), seed: false }]
      : [{ change, id: crypto.randomUUID(), seed: false }]);
    if (steps.length > 10000) throw Error('Un comando puede contener hasta 10 000 revisiones. Divide la importación antes de continuar.');
    const operationIds = new Map(steps.map(s => [s.change.entityId, s.id]));
    const groupId = steps.length > 1 ? crypto.randomUUID() : null, now = new Date().toISOString();
    const operations = steps.map(({ change, id, seed }, index) => {
      const entity = this.revisionState.entities.find(e => e.entityId === change.entityId);
      const importedSeed = !seed && steps.find(s => s.seed && s.change.entityId === change.entityId);
      const parents = importedSeed ? [importedSeed.id] : entity?.heads.map(op => op.operationId) ?? [];
      const referenced = new Set<string>();
      const payload = change.payload as unknown as Record<string, unknown>;
      for (const key of ['cardId', 'loanId', 'purchaseId', 'statementId', 'categoryId', 'movementId', 'recurrenceId', 'accountId', 'toAccountId', 'goalId', 'cardMovementId']) if (typeof payload[key] === 'string') referenced.add(payload[key]);
      if (Array.isArray(payload.allocations)) for (const allocation of payload.allocations as { planId: string }[]) referenced.add(allocation.planId);
      if (Array.isArray(payload.includedMovementIds)) for (const id of payload.includedMovementIds) referenced.add(id);
      const dependencies = [...referenced].flatMap(id => operationIds.has(id) ? [operationIds.get(id)!] : this.revisionState.entities.find(e => e.entityId === id)?.heads.map(op => op.operationId) ?? []);
      if (resolution) {
        const reviewed = new Set(this.issues(today).flatMap(issue => issue.entityIds));
        dependencies.push(...this.revisionState.entities.filter(e => reviewed.has(e.entityId)).flatMap(e => e.heads.map(op => op.operationId)));
      }
      return { schemaVersion: operationVersion(change.entityType), vaultId: this.header.vaultId, operationId: id, entityId: change.entityId,
        entityType: change.entityType, deviceId: this.deviceId, deviceSequence: ++sequence, parentRevisionIds: parents,
        dependencyOperationIds: [...new Set(dependencies)].filter(dependency => dependency !== id), groupId, groupIndex: index, groupSize: steps.length,
        updatedAt: now, action: change.voided ? 'void' : parents.length === 0 ? 'create' : parents.length > 1 && resolution ? 'resolve' : entity?.status === 'void' ? 'restore' : 'replace',
        payload: change.voided ? null : change.payload } as Operation;
    });
    mergeRevisions([...this.revisionState.operations, ...operations]);
    const blocks: EncryptedBlock[] = [], chunks: Operation[][] = []; let chunk: Operation[] = [], size = 400;
    for (const operation of operations) {
      const bytes = encodeJson(operation).byteLength + 1;
      if (bytes > 999600) throw Error('Un registro excede el tamaño admitido.');
      if (chunk.length && (chunk.length === 1000 || size + bytes > 1000000)) { chunks.push(chunk); chunk = []; size = 400; }
      chunk.push(operation); size += bytes;
    }
    if (chunk.length) chunks.push(chunk);
    for (const operations of chunks) {
      const batchId = crypto.randomUUID(), batch: Batch = { schemaVersion: operations.some(op => op.schemaVersion === 2) ? 2 : 1, vaultId: this.header.vaultId, batchId, deviceId: this.deviceId, operations };
      assertBatch(batch); blocks.push(await this.cipher.seal(encodeJson(batch), { vaultId: this.header.vaultId, keyId: this.header.keyId, blockId: batchId, purpose: 'batch' })); this.ensureUnlocked();
    }
    await this.store.commit(this.header.vaultId, this.stored.metadata.version, sequence, blocks, true); await this.refresh();
  }
  async resolve(entityId: string, headId: string, today: string): Promise<void> {
    const entity = this.revisions.entities.find(e => e.entityId === entityId), head = entity?.heads.find(op => op.operationId === headId);
    if (!entity || !head || entity.entityType === 'device') throw Error('Conflicto no encontrado.');
    const table = entityTables[entity.entityType], existing = this.portfolio[table].find(r => r.id === entityId);
    const payload = head.payload ?? existing?.value; if (!payload) throw Error('No hay datos para conservar el historial.');
    await this.commit([{ entityType: entity.entityType, entityId, payload, voided: head.action === 'void' } as Change], today, true);
  }
  async voidForResolution(entityType: FinancialEntityType, entityId: string, today: string): Promise<void> {
    const row = this.portfolio[entityTables[entityType]].find(r => r.id === entityId); if (!row) throw Error('Registro no encontrado.');
    await this.commit([{ entityType, entityId, payload: row.value, voided: true } as Change], today, true);
  }
  async acknowledgeForResolution(entityType: FinancialEntityType, entityId: string, today: string, revert = false): Promise<void> {
    const row = this.portfolio[entityTables[entityType]].find(r => r.id === entityId), entity = this.revisions.entities.find(e => e.entityId === entityId);
    if (!row || row.voided || !entity?.accepted) throw Error('Registro no encontrado.');
    const parentId = entity.accepted.parentRevisionIds[0], previous = parentId ? this.revisions.operations.find(op => op.operationId === parentId)?.payload : null;
    if (revert && !previous) throw Error('No hay una versión anterior disponible.');
    await this.commit([{ entityType, entityId, payload: revert ? previous! : row.value, voided: false } as Change], today, true);
  }
  async receive(blocks: readonly EncryptedBlock[]): Promise<void> {
    this.ensureUnlocked(); await this.refresh(); if (!this.stored) throw Error('Cartera no cargada.');
    const operations = await decodeBatches(this.header, this.cipher, blocks);
    mergeRevisions([...this.revisionState.operations, ...operations]); this.ensureUnlocked();
    const known = new Map(this.stored.blocks.map(b => [b.blockId, b]));
    for (const b of blocks) if (known.has(b.blockId) && canonical(known.get(b.blockId)) !== canonical(b)) throw Error('Un bloque fue reemplazado con contenido distinto.');
    const fresh = blocks.filter(b => !known.has(b.blockId));
    if (fresh.length) await this.store.commit(this.header.vaultId, this.stored.metadata.version, this.stored.metadata.sequence, fresh, false);
    await this.refresh();
  }
  async backup(): Promise<EncryptedBackup> {
    this.ensureUnlocked(); await this.refresh(); return { format: 'paymentplan-encrypted-backup-v1', header: this.header, blocks: this.stored!.blocks, createdAt: new Date().toISOString() };
  }
  async pending(): Promise<readonly EncryptedBlock[]> { return (await this.store.load(this.header.vaultId)).pending; }
  async acknowledge(blockId: string): Promise<void> { await this.store.acknowledge(this.header.vaultId, blockId); await this.refresh(); }
}
