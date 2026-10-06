import type { EncryptedBlock, Uuid } from '@paymentplan/contracts';
import { TransportError } from '../index.ts';
import type { RemoteBlockInfo, RemoteBlockTransport, RemotePage } from '../index.ts';

// Synthetic transport only. It deliberately permits duplicate remote files on retries.
export class MemoryBlockTransport implements RemoteBlockTransport {
  private readonly files: Array<{ info: RemoteBlockInfo; block: EncryptedBlock }> = [];
  private online = true;
  private uploadFailure: 'beforeUpload' | 'responseLost' | null = null;
  private downloadFailure = false;
  private readonly pageSize: number;

  constructor(pageSize = 2) {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size');
    this.pageSize = pageSize;
  }
  setOnline(online: boolean): void { this.online = online; }
  failNextUpload(failure: 'beforeUpload' | 'responseLost'): void { this.uploadFailure = failure; }
  failNextDownload(): void { this.downloadFailure = true; }
  private requireOnline(): void { if (!this.online) throw new TransportError('offline'); }

  async list(vaultId: Uuid, cursor: string | null = null): Promise<RemotePage> {
    this.requireOnline();
    if (cursor !== null && !/^offset:[0-9]+$/.test(cursor)) throw new Error('Invalid cursor');
    const offset = cursor === null ? 0 : Number(cursor.slice(7));
    const files = this.files.filter(file => file.info.vaultId === vaultId);
    if (!Number.isSafeInteger(offset) || offset > files.length) throw new Error('Invalid cursor');
    const end = offset + this.pageSize;
    return { files: structuredClone(files.slice(offset, end).map(file => file.info)), nextCursor: end < files.length ? `offset:${end}` : null };
  }
  async download(remoteId: string): Promise<EncryptedBlock> {
    this.requireOnline();
    if (this.downloadFailure) { this.downloadFailure = false; throw new TransportError('downloadFailed'); }
    const file = this.files.find(file => file.info.remoteId === remoteId);
    if (!file) throw new Error('Remote file not found');
    return structuredClone(file.block);
  }
  async upload(block: EncryptedBlock): Promise<RemoteBlockInfo> {
    this.requireOnline();
    const failure = this.uploadFailure;
    this.uploadFailure = null;
    if (failure === 'beforeUpload') throw new TransportError(failure);
    const info = { remoteId: `synthetic-${this.files.length + 1}`, blockId: block.blockId, vaultId: block.vaultId };
    this.files.push({ info, block: structuredClone(block) });
    if (failure === 'responseLost') throw new TransportError(failure);
    return structuredClone(info);
  }
}
