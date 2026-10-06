import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { EncryptedBlock } from '@paymentplan/contracts';
import { MemoryBlockTransport } from '@paymentplan/sync/testing';
import { TransportError } from '@paymentplan/sync';

const vaultId = randomUUID();
function block(vault: string = vaultId): EncryptedBlock {
  return { schemaVersion: 1, vaultId: vault, keyId: randomUUID(), blockId: randomUUID(), purpose: 'batch',
    algorithm: 'AES-256-GCM', ivBase64: Buffer.alloc(12).toString('base64'), ciphertextBase64: Buffer.alloc(16).toString('base64'), kdf: null };
}
async function all(transport: MemoryBlockTransport, vault: string = vaultId) {
  const files = [];
  let cursor: string | null = null;
  do { const page = await transport.list(vault, cursor); files.push(...page.files); cursor = page.nextCursor; } while (cursor !== null);
  return files;
}

test('two devices can append immutable blocks and read every page without mixing vaults', async () => {
  const remote = new MemoryBlockTransport(2);
  const pc = [block(), block()], phone = [block(), block(), block()];
  await Promise.all([...pc, ...phone].map(b => remote.upload(b)));
  const other = block(randomUUID()); await remote.upload(other);
  assert.equal((await remote.list(vaultId)).files.length, 2);
  assert.equal((await all(remote)).length, 5);
  assert.equal((await all(remote, other.vaultId)).length, 1);
  const received = await Promise.all((await all(remote)).reverse().map(info => remote.download(info.remoteId)));
  assert.deepEqual(received.map(b => b.blockId).sort(), [...pc, ...phone].map(b => b.blockId).sort());
});
test('failed upload before writing preserves an empty remote; a retry can succeed', async () => {
  const remote = new MemoryBlockTransport(); remote.failNextUpload('beforeUpload');
  const pending = block();
  await assert.rejects(remote.upload(pending), (e: unknown) => e instanceof TransportError && e.failure === 'beforeUpload');
  assert.equal((await all(remote)).length, 0);
  await remote.upload(pending); assert.equal((await all(remote)).length, 1);
});
test('lost upload response produces duplicate files on retry with the same authenticated block ID', async () => {
  const remote = new MemoryBlockTransport(1), pending = block(); remote.failNextUpload('responseLost');
  await assert.rejects(remote.upload(pending), (e: unknown) => e instanceof TransportError && e.failure === 'responseLost');
  await remote.upload(pending);
  const files = await all(remote);
  assert.equal(files.length, 2); assert.notEqual(files[0]?.remoteId, files[1]?.remoteId);
  assert.equal(new Set(files.map(file => file.blockId)).size, 1);
  assert.deepEqual(await remote.download(files[0]!.remoteId), await remote.download(files[1]!.remoteId));
});
test('offline and download faults are explicit and existing remote blocks survive reconnect', async () => {
  const remote = new MemoryBlockTransport(), info = await remote.upload(block()); remote.setOnline(false);
  for (const action of [() => remote.list(vaultId), () => remote.download(info.remoteId), () => remote.upload(block())])
    await assert.rejects(action(), (e: unknown) => e instanceof TransportError && e.failure === 'offline');
  remote.setOnline(true); remote.failNextDownload();
  await assert.rejects(remote.download(info.remoteId), (e: unknown) => e instanceof TransportError && e.failure === 'downloadFailed');
  assert.equal((await remote.download(info.remoteId)).blockId, info.blockId);
  assert.equal((await all(remote)).length, 1);
});
test('mutating uploads, downloaded copies or listed metadata never overwrites remote content', async () => {
  const remote = new MemoryBlockTransport(), original = block(), expected = structuredClone(original);
  const info = await remote.upload(original);
  Object.assign(original, { ciphertextBase64: 'changed' }); Object.assign(info, { blockId: randomUUID() });
  const [listed] = await all(remote); assert(listed);
  const downloaded = await remote.download(listed.remoteId); Object.assign(downloaded, { vaultId: randomUUID() });
  Object.assign(listed, { remoteId: 'changed' });
  const [again] = await all(remote); assert(again);
  assert.deepEqual(await remote.download(again.remoteId), expected);
  await assert.rejects(remote.list(vaultId, 'not-a-cursor'), /Invalid cursor/);
  await assert.rejects(remote.download('missing'), /not found/);
});
