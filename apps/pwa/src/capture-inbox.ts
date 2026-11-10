import { base64, decodeBase64, decodeJson, encodeJson } from '@paymentplan/crypto';
import type { VaultSession } from '@paymentplan/application';
import type { InboxEntry, InboxKey, IndexedVaultStore } from '@paymentplan/storage';

export type CaptureDraft = { text: string; date: string };
const context = (vaultId: string, id: string) => new TextEncoder().encode(JSON.stringify(['paymentplan-inbox-v1', vaultId, id]));

async function verifyInboxKey(session: VaultSession, config: InboxKey): Promise<void> {
  const block = config.privateBlock;
  const bytes = await session.cipher.open(block, { vaultId: session.header.vaultId, keyId: session.header.keyId, blockId: block.blockId, purpose: 'snapshot' });
  try {
    const key = await crypto.subtle.importKey('pkcs8', bytes.slice().buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
    const privateJwk = await crypto.subtle.exportKey('jwk', key);
    if (config.vaultId !== session.header.vaultId || !config.publicKey.n || !config.publicKey.e ||
      config.publicKey.n !== privateJwk.n || config.publicKey.e !== privateJwk.e || config.publicKey.d)
      throw Error('Las claves de la bandeja no coinciden. No captures nuevos pendientes hasta resolverlo.');
    await crypto.subtle.importKey('jwk', config.publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    if (!session.unlocked) throw Error('La cartera está bloqueada.');
  } finally { bytes.fill(0); }
}

export async function prepareInbox(session: VaultSession): Promise<void> {
  const existing = await session.store.inboxKey(session.header.vaultId);
  if (existing) { await verifyInboxKey(session, existing); return; }
  const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  try {
    const blockId = crypto.randomUUID();
    const privateBlock = await session.cipher.seal(privateKey, { vaultId: session.header.vaultId, keyId: session.header.keyId, blockId, purpose: 'snapshot' });
    if (!session.unlocked) throw Error('La cartera se bloqueó antes de preparar la captura.');
    const actual = await session.store.ensureInboxKey({ vaultId: session.header.vaultId, publicKey, privateBlock });
    await verifyInboxKey(session, actual);
  } finally { privateKey.fill(0); }
}

export async function enqueueCapture(store: IndexedVaultStore, vaultId: string, draft: CaptureDraft): Promise<void> {
  if (!draft.text.trim() || draft.text.length > 300 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw Error('Escribe una frase válida de hasta 300 caracteres.');
  const config = await store.inboxKey(vaultId);
  if (!config) throw Error('Desbloquea primero esta cartera para preparar la captura en este dispositivo.');
  const id = crypto.randomUUID(), iv = crypto.getRandomValues(new Uint8Array(12));
  const publicKey = await crypto.subtle.importKey('jwk', config.publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  try {
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const [encryptedKey, ciphertext] = await Promise.all([
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, raw),
      crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(vaultId, id) }, key, encodeJson(draft).slice().buffer),
    ]);
    await store.addInboxEntry({ vaultId, id, encryptedKey: base64(new Uint8Array(encryptedKey)), iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) });
  } finally { raw.fill(0); }
}

export async function openCapture(session: VaultSession, config: InboxKey, entry: InboxEntry): Promise<CaptureDraft> {
  if (config.vaultId !== session.header.vaultId || entry.vaultId !== session.header.vaultId) throw Error('La captura pertenece a otra cartera.');
  const block = config.privateBlock;
  const bytes = await session.cipher.open(block, { vaultId: session.header.vaultId, keyId: session.header.keyId, blockId: block.blockId, purpose: 'snapshot' });
  try {
    const privateKey = await crypto.subtle.importKey('pkcs8', bytes.slice().buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, decodeBase64(entry.encryptedKey)));
    try {
      const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64(entry.iv, 12), additionalData: context(entry.vaultId, entry.id) }, key, decodeBase64(entry.ciphertext));
      const value = decodeJson(new Uint8Array(plaintext));
      if (!value || typeof value !== 'object' || !('text' in value) || !('date' in value) ||
        typeof value.text !== 'string' || !value.text.trim() || value.text.length > 300 ||
        typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw Error('La captura no tiene un formato válido.');
      if (!session.unlocked) throw Error('La cartera está bloqueada.');
      return { text: value.text, date: value.date };
    } finally { raw.fill(0); }
  } finally { bytes.fill(0); }
}
