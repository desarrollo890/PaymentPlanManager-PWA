// Portable Web Crypto feasibility code, deliberately outside application runtime.
const encoder = new TextEncoder();
function b64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
const unb64 = text => typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(text, 'base64')) : Uint8Array.from(atob(text), c => c.charCodeAt(0));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function decode(text, length) {
  if (typeof text !== 'string' || text.length > 1400000) throw new Error('Invalid encoded field');
  const bytes = unb64(text);
  if (b64(bytes) !== text || length !== undefined && bytes.length !== length) throw new Error('Invalid base64');
  return bytes;
}
function metadata(block) {
  if (block.schemaVersion !== 1 || block.algorithm !== 'AES-256-GCM' ||
    !['batch', 'snapshot', 'dataKeyWrap', 'recoveryKeyWrap'].includes(block.purpose) ||
    [block.vaultId, block.keyId, block.blockId].some(id => !uuidPattern.test(id) || id === '00000000-0000-0000-0000-000000000000'))
    throw new Error('Invalid block metadata');
  const kdf = block.kdf;
  let parameters = null;
  if (block.purpose === 'dataKeyWrap') {
    if (!kdf) throw new Error('Missing KDF');
    decode(kdf.saltBase64, 16);
    if (kdf.algorithm === 'PBKDF2-SHA256' && Number.isInteger(kdf.iterations) && kdf.iterations >= 600000 && kdf.iterations <= 2000000)
      parameters = [kdf.algorithm, kdf.iterations, kdf.saltBase64];
    else if (kdf.algorithm === 'Argon2id' && kdf.version === 19 && kdf.parallelism === 1 &&
      Number.isInteger(kdf.memoryKiB) && kdf.memoryKiB >= 19456 && kdf.memoryKiB <= 65536 &&
      Number.isInteger(kdf.passes) && kdf.passes >= 2 && kdf.passes <= 6)
      parameters = [kdf.algorithm, kdf.version, kdf.memoryKiB, kdf.passes, kdf.parallelism, kdf.saltBase64];
    else throw new Error('Unsupported or excessive KDF parameters');
  } else if (kdf !== null) throw new Error('Unexpected KDF');
  return encoder.encode(JSON.stringify(['paymentplan-encrypted-block-v1', block.schemaVersion, block.vaultId,
    block.keyId, block.blockId, block.purpose, block.algorithm, parameters]));
}
export async function importDataKey(bytes) {
  if (bytes.byteLength !== 32) throw new Error('Expected 256-bit key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function derivePbkdf2(password, kdf) {
  if (typeof password !== 'string' || !password || password.length > 1024 || kdf.algorithm !== 'PBKDF2-SHA256' ||
    !Number.isInteger(kdf.iterations) || kdf.iterations < 600000 || kdf.iterations > 2000000)
    throw new Error('Invalid derivation parameters');
  const salt = decode(kdf.saltBase64, 16);
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: kdf.iterations },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export function passwordParameters() {
  return { algorithm: 'PBKDF2-SHA256', iterations: 600000, saltBase64: b64(crypto.getRandomValues(new Uint8Array(16))) };
}
export async function seal(key, plaintext, header) {
  if (!(plaintext instanceof Uint8Array) || plaintext.byteLength > 1048576) throw new Error('Invalid plaintext size');
  const block = { schemaVersion: 1, ...header, algorithm: 'AES-256-GCM', kdf: header.kdf ?? null };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: metadata(block), tagLength: 128 }, key, plaintext);
  return { ...block, ivBase64: b64(iv), ciphertextBase64: b64(new Uint8Array(encrypted)) };
}
export async function open(key, block, expected) {
  for (const name of ['vaultId', 'keyId', 'blockId', 'purpose'])
    if (block[name] !== expected[name]) throw new Error('Block identity mismatch');
  const iv = decode(block.ivBase64, 12), ciphertext = decode(block.ciphertextBase64);
  if (ciphertext.byteLength < 16 || ciphertext.byteLength > 1048592) throw new Error('Invalid ciphertext size');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: metadata(block), tagLength: 128 }, key, ciphertext));
}
