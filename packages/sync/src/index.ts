import type { EncryptedBlock, Uuid } from '@paymentplan/contracts';

export interface RemoteBlockInfo {
  readonly remoteId: string;
  readonly blockId: Uuid;
  readonly vaultId: Uuid;
}
export interface RemotePage {
  readonly files: ReadonlyArray<RemoteBlockInfo>;
  readonly nextCursor: string | null;
}
export interface RemoteBlockTransport {
  list(vaultId: Uuid, cursor?: string | null): Promise<RemotePage>;
  download(remoteId: string): Promise<EncryptedBlock>;
  upload(block: EncryptedBlock): Promise<RemoteBlockInfo>;
}

export type TransportFailure = 'offline' | 'beforeUpload' | 'responseLost' | 'downloadFailed';
export class TransportError extends Error {
  readonly failure: TransportFailure;
  constructor(failure: TransportFailure) {
    super(`Remote transport: ${failure}`);
    this.name = 'TransportError';
    this.failure = failure;
  }
}
