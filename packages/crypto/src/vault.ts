import { assertBlock } from '@paymentplan/contracts';
import type { EncryptedBlock } from '@paymentplan/contracts';
import type { BlockCipher, BlockContext } from './index.ts';

const encoder = new TextEncoder(), decoder = new TextDecoder();
export interface VaultHeader {
  readonly format: 'paymentplan-vault-v1'; readonly vaultId: string; readonly keyId: string; readonly createdAt: string;
  readonly passwordWrap: EncryptedBlock; readonly recoveryWrap: EncryptedBlock;
}
export function base64(bytes: Uint8Array): string {
  let binary = ''; for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
export function decodeBase64(value: string, length?: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > 1_400_000) throw Error('Codificación inválida.');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (base64(bytes) !== value || (length !== undefined && bytes.length !== length)) throw Error('Codificación inválida.');
  return bytes;
}
function parameters(block: EncryptedBlock): Uint8Array<ArrayBuffer> {
  assertBlock(block);
  const k = block.kdf;
  if (k && k.algorithm !== 'PBKDF2-SHA256') throw Error('Este dispositivo no admite la derivación indicada.');
  return encoder.encode(JSON.stringify(['paymentplan-encrypted-block-v1', block.schemaVersion, block.vaultId, block.keyId, block.blockId, block.purpose,
    block.algorithm, k ? [k.algorithm, k.iterations, k.saltBase64] : null]));
}
async function importKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.length !== 32) throw Error('La clave debe tener 256 bits.');
  return crypto.subtle.importKey('raw', bytes.slice().buffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(key: CryptoKey, plaintext: Uint8Array, context: BlockContext, kdf: EncryptedBlock['kdf'] = null): Promise<EncryptedBlock> {
  if (plaintext.byteLength > 1_048_576) throw Error('El lote excede el tamaño permitido.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header: EncryptedBlock = { schemaVersion: 1, ...context, algorithm: 'AES-256-GCM', kdf, ivBase64: base64(iv), ciphertextBase64: base64(new Uint8Array(16)) };
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: parameters(header), tagLength: 128 }, key, plaintext.slice().buffer);
  return { ...header, ciphertextBase64: base64(new Uint8Array(encrypted)) };
}
async function open(key: CryptoKey, block: EncryptedBlock, expected: BlockContext): Promise<Uint8Array<ArrayBuffer>> {
  for (const field of ['vaultId', 'keyId', 'blockId', 'purpose'] as const) if (block[field] !== expected[field]) throw Error('El bloque pertenece a otro contexto.');
  const iv = decodeBase64(block.ivBase64, 12), ciphertext = decodeBase64(block.ciphertextBase64);
  if (ciphertext.length < 16 || ciphertext.length > 1_048_592) throw Error('Tamaño de bloque inválido.');
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: parameters(block), tagLength: 128 }, key, ciphertext)); }
  catch { throw Error('No se pudo descifrar: revisa la contraseña o la integridad del archivo.'); }
}
export class VaultCipher implements BlockCipher {
  private key: CryptoKey | null;
  constructor(key: CryptoKey) { this.key = key; }
  lock(): void { this.key = null; }
  get unlocked(): boolean { return this.key !== null; }
  seal(plaintext: Uint8Array, context: BlockContext): Promise<EncryptedBlock> {
    if (!this.key) throw Error('La cartera está bloqueada.'); return seal(this.key, plaintext, context);
  }
  open(block: EncryptedBlock, expected: BlockContext): Promise<Uint8Array> {
    if (!this.key) throw Error('La cartera está bloqueada.'); return open(this.key, block, expected);
  }
}
export function assertVaultHeader(value: unknown): asserts value is VaultHeader {
  if (!value || typeof value !== 'object') throw Error('Respaldo de cartera inválido.');
  const h = value as VaultHeader;
  if (Object.keys(value).some(key => !['format', 'vaultId', 'keyId', 'createdAt', 'passwordWrap', 'recoveryWrap'].includes(key))) throw Error('El encabezado contiene campos no admitidos.');
  if (h.format !== 'paymentplan-vault-v1' || !Number.isFinite(Date.parse(h.createdAt))) throw Error('Formato de cartera incompatible.');
  assertBlock(h.passwordWrap); assertBlock(h.recoveryWrap);
  if (h.passwordWrap.purpose !== 'dataKeyWrap' || h.recoveryWrap.purpose !== 'recoveryKeyWrap' ||
    [h.passwordWrap, h.recoveryWrap].some(b => b.vaultId !== h.vaultId || b.keyId !== h.keyId)) throw Error('La protección de claves no corresponde a la cartera.');
}
function passwordCheck(password: string): void {
  if (password.length < 12 || password.length > 1024) throw Error('Usa una contraseña maestra de 12 a 1024 caracteres.');
}
function passwordParameters(): NonNullable<EncryptedBlock['kdf']> {
  return { algorithm: 'PBKDF2-SHA256', iterations: 600_000, saltBase64: base64(crypto.getRandomValues(new Uint8Array(16))) };
}
async function passwordKey(password: string, kdf: EncryptedBlock['kdf']): Promise<CryptoKey> {
  if (!password || password.length > 1024 || !kdf || kdf.algorithm !== 'PBKDF2-SHA256' || kdf.iterations < 600_000 || kdf.iterations > 2_000_000)
    throw Error('Parámetros de contraseña inválidos.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: decodeBase64(kdf.saltBase64, 16), iterations: kdf.iterations }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function createVault(password: string): Promise<{ header: VaultHeader; cipher: VaultCipher; recoveryKey: string }> {
  passwordCheck(password);
  const vaultId = crypto.randomUUID(), keyId = crypto.randomUUID(), data = crypto.getRandomValues(new Uint8Array(32)), recovery = crypto.getRandomValues(new Uint8Array(32));
  const kdf = passwordParameters();
  try {
    const passwordWrap = await seal(await passwordKey(password, kdf), data, { vaultId, keyId, blockId: crypto.randomUUID(), purpose: 'dataKeyWrap' }, kdf);
    const recoveryWrap = await seal(await importKey(recovery), data, { vaultId, keyId, blockId: crypto.randomUUID(), purpose: 'recoveryKeyWrap' });
    const recoveryKey = [...recovery].map(b => b.toString(16).padStart(2, '0')).join('').match(/.{1,4}/g)!.join('-');
    return { header: { format: 'paymentplan-vault-v1', vaultId, keyId, createdAt: new Date().toISOString(), passwordWrap, recoveryWrap },
      cipher: new VaultCipher(await importKey(data)), recoveryKey };
  } finally { data.fill(0); recovery.fill(0); }
}
export async function unlockVault(header: VaultHeader, password: string): Promise<VaultCipher> {
  assertVaultHeader(header);
  const bytes = await open(await passwordKey(password, header.passwordWrap.kdf), header.passwordWrap, header.passwordWrap);
  try { return new VaultCipher(await importKey(bytes)); } finally { bytes.fill(0); }
}
export async function recoverVault(header: VaultHeader, recoveryKey: string, password: string): Promise<{ header: VaultHeader; cipher: VaultCipher }> {
  assertVaultHeader(header); passwordCheck(password);
  const hex = recoveryKey.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw Error('Clave de recuperación inválida.');
  const recovery = Uint8Array.from(hex.match(/../g)!, b => parseInt(b, 16));
  const bytes = await open(await importKey(recovery), header.recoveryWrap, header.recoveryWrap); recovery.fill(0);
  const kdf = passwordParameters();
  try { return { header: { ...header, passwordWrap: await seal(await passwordKey(password, kdf), bytes,
    { vaultId: header.vaultId, keyId: header.keyId, blockId: crypto.randomUUID(), purpose: 'dataKeyWrap' }, kdf) }, cipher: new VaultCipher(await importKey(bytes)) }; }
  finally { bytes.fill(0); }
}
export const encodeJson = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));
export const decodeJson = (bytes: Uint8Array): unknown => JSON.parse(decoder.decode(bytes));
export async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
