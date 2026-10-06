import test from 'node:test';
import assert from 'node:assert/strict';
import { argon2, randomUUID, pbkdf2Sync } from 'node:crypto';
import { promisify } from 'node:util';
import { importDataKey, passwordParameters, derivePbkdf2, seal, open } from '../crypto-proof.mjs';
const bytes = text => new TextEncoder().encode(text);
const header = purpose => ({ vaultId: randomUUID(), keyId: randomUUID(), blockId: randomUUID(), purpose });
const randomKey = () => crypto.getRandomValues(new Uint8Array(32));

test('AES-GCM roundtrip uses a fresh IV; altered ciphertext or authenticated purpose is rejected', async () => {
  const key = await importDataKey(randomKey()), h = header('batch'), data = bytes('{"synthetic":true}');
  const block = await seal(key, data, h), again = await seal(key, data, h);
  assert.deepEqual(await open(key, block, h), data); assert.notEqual(block.ivBase64, again.ivBase64);
  const damaged = Buffer.from(block.ciphertextBase64, 'base64'); damaged[0] ^= 1;
  await assert.rejects(open(key, { ...block, ciphertextBase64: damaged.toString('base64') }, h));
  await assert.rejects(open(key, { ...block, purpose: 'snapshot' }, { ...h, purpose: 'snapshot' }));
  await assert.rejects(open(key, block, { ...h, vaultId: randomUUID() }), /identity/);
});
test('password wrapping interoperates with PBKDF2 SHA256 and password rotation keeps the data key', async () => {
  const kdf = passwordParameters(), raw = randomKey(), h = { ...header('dataKeyWrap'), kdf };
  const oldKey = await derivePbkdf2('Synthetic password for checks', kdf);
  const wrapped = await seal(oldKey, raw, h);
  const independent = await importDataKey(pbkdf2Sync('Synthetic password for checks', Buffer.from(kdf.saltBase64, 'base64'), kdf.iterations, 32, 'sha256'));
  assert.deepEqual(await open(independent, wrapped, h), raw);
  const wrong = await derivePbkdf2('Wrong synthetic password', kdf);
  await assert.rejects(open(wrong, wrapped, h));
  const changedKdf = passwordParameters(), changed = await derivePbkdf2('New synthetic password', changedKdf);
  const newHeader = { ...h, blockId: randomUUID(), kdf: changedKdf };
  assert.deepEqual(await open(changed, await seal(changed, raw, newHeader), newHeader), raw);
});
test('recovery key independently recovers the same data key and KDF resource abuse is rejected', async () => {
  const raw = randomKey(), recovery = await importDataKey(randomKey()), h = header('recoveryKeyWrap');
  assert.deepEqual(await open(recovery, await seal(recovery, raw, h), h), raw);
  await assert.rejects(derivePbkdf2('test', { ...passwordParameters(), iterations: 2000001 }), /Invalid/);
});
test('Argon2id matches RFC 9106 section 5.3 known vector', async () => {
  const result = await promisify(argon2)('argon2id', { message: Buffer.alloc(32, 1), nonce: Buffer.alloc(16, 2),
    parallelism: 4, tagLength: 32, memory: 32, passes: 3, secret: Buffer.alloc(8, 3), associatedData: Buffer.alloc(12, 4) });
  assert.equal(result.toString('hex'), '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
});
