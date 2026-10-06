import type { EncryptedBlock, Uuid } from '@paymentplan/contracts';

export interface EncryptedRecord {
  readonly recordId: Uuid;
  readonly revision: string;
  readonly block: EncryptedBlock;
}
export interface LocalCommit {
  readonly vaultId: Uuid;
  readonly expectedRevisions: ReadonlyArray<{ readonly recordId: Uuid; readonly revision: string | null }>;
  readonly records: ReadonlyArray<EncryptedRecord>;
  readonly outbox: ReadonlyArray<EncryptedBlock>;
}

// F3 must implement revision checks, records and outbox in one IndexedDB transaction.
export interface EncryptedLocalStore {
  read(vaultId: Uuid, recordId: Uuid): Promise<EncryptedRecord | null>;
  commit(change: LocalCommit): Promise<void>;
  pending(vaultId: Uuid): Promise<ReadonlyArray<EncryptedBlock>>;
  acknowledge(vaultId: Uuid, blockId: Uuid): Promise<void>;
}

export * from './vault-store.ts';
