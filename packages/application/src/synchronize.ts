import type { DriveTransport, RemoteBlockTransport } from '@paymentplan/sync';
import { GoogleAuthorizationError } from '@paymentplan/sync';
import type { VaultSession } from './session.ts';
export interface SyncResult { readonly downloaded: number; readonly uploaded: number; readonly remaining: number }
export async function synchronize(session: VaultSession, remote: RemoteBlockTransport): Promise<SyncResult> {
  await session.refresh();
  const files = [], cursors = new Set<string>(); let cursor: string | null = null;
  do {
    const page = await remote.list(session.header.vaultId, cursor); files.push(...page.files); cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw Error('El servidor repitió una página.'); if (cursor) cursors.add(cursor);
    if (files.length > 100_000 || cursors.size > 1000) throw Error('La cartera excede el límite de esta versión.');
  } while (cursor);
  const known = new Set((await session.backup()).blocks.map(b => b.blockId)), fetched = new Set<string>();
  let downloaded = 0, uploaded = 0;
  for (const file of files) {
    if (file.vaultId !== session.header.vaultId) throw Error('El servidor mezcló carteras.');
    if (known.has(file.blockId) || fetched.has(file.blockId)) continue;
    const block = await remote.download(file.remoteId);
    if (block.blockId !== file.blockId) throw Error('La identidad remota no coincide con el bloque.');
    await session.receive([block]); fetched.add(file.blockId); downloaded++;
  }
  // Never acknowledge before remote upload succeeds; a lost response leaves the block queued.
  const uploadedIds = new Set(files.map(file => file.blockId));
  for (const block of await session.pending()) {
    if (!uploadedIds.has(block.blockId)) { await remote.upload(block); uploaded++; }
    await session.acknowledge(block.blockId);
  }
  return { downloaded, uploaded, remaining: session.pendingCount };
}
export async function synchronizeDrive(session: VaultSession, remote: DriveTransport): Promise<SyncResult> {
  try { await remote.publishHeader(session.header); return await synchronize(session, remote); }
  catch (error) { if (error instanceof GoogleAuthorizationError) throw error; throw error; }
}
