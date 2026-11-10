import type { EncryptedBlock } from '@paymentplan/contracts';
import { canonical } from '@paymentplan/contracts';

// Only public envelope metadata and authenticated encrypted blocks reach IndexedDB.
export interface VaultMetadata {
  readonly vaultId: string; readonly version: number; readonly deviceId: string; readonly sequence: number; readonly header: unknown;
}
export interface StoredVault { readonly metadata: VaultMetadata; readonly blocks: readonly EncryptedBlock[]; readonly pending: readonly EncryptedBlock[] }
export interface InboxKey { vaultId: string; publicKey: JsonWebKey; privateBlock: EncryptedBlock }
export interface InboxEntry { vaultId: string; id: string; encryptedKey: string; iv: string; ciphertext: string }
export class LocalRevisionError extends Error { constructor() { super('Otra pestaña actualizó la cartera. Recarga antes de guardar.'); } }
function request<T>(req: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function complete(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new LocalRevisionError()); tx.onerror = () => {}; }); }
export class IndexedVaultStore {
  private database: Promise<IDBDatabase>;
  constructor(name = 'paymentplan-encrypted-v1') {
    this.database = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'vaultId' });
        for (const name of ['blocks', 'outbox']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: ['vaultId', 'blockId'] });
        if (!db.objectStoreNames.contains('inboxKeys')) db.createObjectStore('inboxKeys', { keyPath: 'vaultId' });
        if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { keyPath: ['vaultId', 'id'] });
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
  async commit(vaultId: string, expectedVersion: number, sequence: number, blocks: readonly EncryptedBlock[], queue: boolean, inboxId?: string): Promise<void> {
    const db = await this.database, tx = db.transaction(['meta', 'blocks', 'outbox', 'inbox'], 'readwrite', { durability: 'strict' }), done = complete(tx);
    const meta = await request(tx.objectStore('meta').get(vaultId)) as VaultMetadata | undefined;
    if (!meta || meta.version !== expectedVersion || sequence < meta.sequence || blocks.some(b => b.vaultId !== vaultId)) { tx.abort(); await done; return; }
    if (inboxId && !await request(tx.objectStore('inbox').get([vaultId, inboxId]))) { tx.abort(); await done; return; }
    // Existing IDs are immutable. A retry may only repeat the exact encrypted block.
    const store = tx.objectStore('blocks');
    for (const block of blocks) {
      const old = await request(store.get([vaultId, block.blockId])) as EncryptedBlock | undefined;
      if (old && canonical(old) !== canonical(block)) { tx.abort(); await done; return; }
      store.put(block); if (queue) tx.objectStore('outbox').put(block);
    }
    if (inboxId) tx.objectStore('inbox').delete([vaultId, inboxId]);
    tx.objectStore('meta').put({ ...meta, version: meta.version + 1, sequence }); await done;
  }
  async inboxKey(vaultId: string): Promise<InboxKey | undefined> {
    const db = await this.database, tx = db.transaction('inboxKeys', 'readonly'), done = complete(tx);
    const value = await request(tx.objectStore('inboxKeys').get(vaultId)) as InboxKey | undefined; await done; return value;
  }
  async ensureInboxKey(value: InboxKey): Promise<InboxKey> {
    const db = await this.database, tx = db.transaction('inboxKeys', 'readwrite', { durability: 'strict' }), done = complete(tx), store = tx.objectStore('inboxKeys');
    const existing = await request(store.get(value.vaultId)) as InboxKey | undefined;
    if (!existing) store.add(value); await done; return existing ?? value;
  }
  async inboxEntries(vaultId: string): Promise<InboxEntry[]> {
    const db = await this.database, tx = db.transaction('inbox', 'readonly'), done = complete(tx);
    const entries = await request(tx.objectStore('inbox').getAll(IDBKeyRange.bound([vaultId, ''], [vaultId, '\uffff']))) as InboxEntry[];
    await done; return entries;
  }
  async addInboxEntry(entry: InboxEntry): Promise<void> {
    const db = await this.database, tx = db.transaction(['inbox', 'inboxKeys'], 'readwrite', { durability: 'strict' }), done = complete(tx);
    if (!await request(tx.objectStore('inboxKeys').get(entry.vaultId))) { tx.abort(); await done; return; }
    tx.objectStore('inbox').add(entry); await done;
  }
  async deleteInboxEntry(vaultId: string, id: string): Promise<void> {
    const db = await this.database, tx = db.transaction('inbox', 'readwrite', { durability: 'strict' }), done = complete(tx);
    tx.objectStore('inbox').delete([vaultId, id]); await done;
  }
  async acknowledge(vaultId: string, blockId: string): Promise<void> {
    const db = await this.database, tx = db.transaction('outbox', 'readwrite', { durability: 'strict' }), done = complete(tx);
    tx.objectStore('outbox').delete([vaultId, blockId]); await done;
  }
  async close(): Promise<void> { (await this.database).close(); }
}
