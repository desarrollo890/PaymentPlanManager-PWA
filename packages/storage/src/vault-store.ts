import type { EncryptedBlock } from '@paymentplan/contracts';
import { canonical } from '@paymentplan/contracts';

// Only public envelope metadata and authenticated encrypted blocks reach IndexedDB.
export interface VaultMetadata {
  readonly vaultId: string; readonly version: number; readonly deviceId: string; readonly sequence: number; readonly header: unknown;
}
export interface StoredVault { readonly metadata: VaultMetadata; readonly blocks: readonly EncryptedBlock[]; readonly pending: readonly EncryptedBlock[] }
export class LocalRevisionError extends Error { constructor() { super('Otra pestaña actualizó la cartera. Recarga antes de guardar.'); } }
function request<T>(req: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function complete(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new LocalRevisionError()); tx.onerror = () => {}; }); }
export class IndexedVaultStore {
  private database: Promise<IDBDatabase>;
  constructor(name = 'paymentplan-encrypted-v1') {
    this.database = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('meta', { keyPath: 'vaultId' });
        for (const name of ['blocks', 'outbox']) db.createObjectStore(name, { keyPath: ['vaultId', 'blockId'] });
      };
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error); req.onblocked = () => reject(Error('Cierra otras pestañas para actualizar el almacenamiento.'));
    });
  }
  async list(): Promise<VaultMetadata[]> {
    const db = await this.database, tx = db.transaction('meta', 'readonly'), done = complete(tx);
    const result = await request(tx.objectStore('meta').getAll()) as VaultMetadata[]; await done; return result;
  }
  async initialize(header: { readonly vaultId: string }, replaceHeader = false): Promise<void> {
    const db = await this.database, tx = db.transaction('meta', 'readwrite', { durability: 'strict' }), done = complete(tx), store = tx.objectStore('meta');
    const existing = await request(store.get(header.vaultId)) as VaultMetadata | undefined;
    if (existing && !replaceHeader) { tx.abort(); await done; }
    store.put(existing ? { ...existing, header, version: existing.version + 1 } : { vaultId: header.vaultId, version: 0, deviceId: crypto.randomUUID(), sequence: 0, header });
    await done;
  }
  async load(vaultId: string): Promise<StoredVault> {
    const db = await this.database, tx = db.transaction(['meta', 'blocks', 'outbox'], 'readonly'), done = complete(tx);
    const [metadata, blocks, pending] = await Promise.all([request(tx.objectStore('meta').get(vaultId)),
      request(tx.objectStore('blocks').getAll(IDBKeyRange.bound([vaultId, ''], [vaultId, '\uffff']))),
      request(tx.objectStore('outbox').getAll(IDBKeyRange.bound([vaultId, ''], [vaultId, '\uffff'])))]);
    await done; if (!metadata) throw Error('Cartera no encontrada.'); return { metadata, blocks, pending } as StoredVault;
  }
  async commit(vaultId: string, expectedVersion: number, sequence: number, blocks: readonly EncryptedBlock[], queue: boolean): Promise<void> {
    const db = await this.database, tx = db.transaction(['meta', 'blocks', 'outbox'], 'readwrite', { durability: 'strict' }), done = complete(tx);
    const meta = await request(tx.objectStore('meta').get(vaultId)) as VaultMetadata | undefined;
    if (!meta || meta.version !== expectedVersion || sequence < meta.sequence || blocks.some(b => b.vaultId !== vaultId)) { tx.abort(); await done; return; }
    // Existing IDs are immutable. A retry may only repeat the exact encrypted block.
    const store = tx.objectStore('blocks');
    for (const block of blocks) {
      const old = await request(store.get([vaultId, block.blockId])) as EncryptedBlock | undefined;
      if (old && canonical(old) !== canonical(block)) { tx.abort(); await done; return; }
      store.put(block); if (queue) tx.objectStore('outbox').put(block);
    }
    tx.objectStore('meta').put({ ...meta, version: meta.version + 1, sequence }); await done;
  }
  async acknowledge(vaultId: string, blockId: string): Promise<void> {
    const db = await this.database, tx = db.transaction('outbox', 'readwrite', { durability: 'strict' }), done = complete(tx);
    tx.objectStore('outbox').delete([vaultId, blockId]); await done;
  }
  async close(): Promise<void> { (await this.database).close(); }
}
