import { importDataKey, seal, open } from '../architecture/crypto-proof.mjs';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const api = 'https://www.googleapis.com/drive/v3/files';
const prefix = 'paymentplan-f0-probe-';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const base64 = bytes => btoa(String.fromCharCode(...bytes));
const hex = bytes => [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
const sha256 = async bytes => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));

export class DriveProbeClient {
  constructor(getToken, fetcher = (...args) => fetch(...args)) { this.getToken = getToken; this.fetcher = fetcher; }
  async request(url, options = {}) {
    const token = this.getToken();
    if (!token) throw new Error('Autoriza Drive o vuelve a conectar Google.');
    const response = await this.fetcher(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, redirect: 'error' });
    if (!response.ok) {
      const messages = { 401: 'La autorización caducó. Vuelve a conectar Google.', 403: 'Acceso denegado. Revisa el permiso appdata, la API y la cuenta de prueba.', 404: 'El archivo no está disponible para esta cuenta o aplicación.', 429: 'Límite temporal de Drive. Intenta de nuevo más tarde.' };
      throw new Error(messages[response.status] || `Drive no completó la prueba (HTTP ${response.status}).`);
    }
    return response;
  }
  async list() {
    const files = [], seen = new Set(); let pageToken = null;
    do {
      const query = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and name contains '${prefix}'`, fields: 'nextPageToken,files(id,name)', pageSize: '100' });
      if (pageToken) query.set('pageToken', pageToken);
      const data = await (await this.request(`${api}?${query}`)).json();
      if (!Array.isArray(data.files)) throw new Error('Respuesta de listado inválida.');
      for (const file of data.files) {
        if (typeof file.id !== 'string' || typeof file.name !== 'string') throw new Error('Metadatos de prueba inválidos.');
        if (file.name.startsWith(prefix)) files.push({ id: file.id, name: file.name });
      }
      pageToken = data.nextPageToken ?? null;
      if (pageToken !== null && (typeof pageToken !== 'string' || seen.has(pageToken))) throw new Error('Paginación de Drive inválida.');
      if (pageToken) seen.add(pageToken);
      if (files.length > 10000 || seen.size > 100) throw new Error('Demasiados archivos de prueba.');
    } while (pageToken);
    return files;
  }
  async create() {
    const vaultId = crypto.randomUUID(), keyId = crypto.randomUUID(), blockId = crypto.randomUUID(), deviceId = crypto.randomUUID();
    const plaintext = encoder.encode(JSON.stringify({ schemaVersion: 1, vaultId, batchId: blockId, deviceId, operations: [{
      schemaVersion: 1, vaultId, operationId: crypto.randomUUID(), entityId: crypto.randomUUID(), entityType: 'device',
      deviceId, deviceSequence: 1, parentRevisionIds: [], dependencyOperationIds: [], groupId: null, groupIndex: 0, groupSize: 1,
      action: 'create', updatedAt: new Date().toISOString(), payload: { label: 'Synthetic F0 Google interoperability probe', retired: false },
    }] }));
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await seal(await importDataKey(bytes), plaintext, { vaultId, keyId, blockId, purpose: 'batch' });
    const name = prefix + blockId + '.json', boundary = 'paymentplan_' + crypto.randomUUID();
    const metadata = JSON.stringify({ name, mimeType: 'application/json', parents: ['appDataFolder'] });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(encrypted)}\r\n--${boundary}--\r\n`;
    const created = await (await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    })).json();
    if (typeof created.id !== 'string' || created.name !== name) throw new Error('Drive no confirmó el archivo de prueba.');
    return { type: 'PaymentPlanF0GoogleProbe', probeVersion: 1, synthetic: true, fileId: created.id, name,
      vaultId, keyId, blockId, purpose: 'batch', syntheticKeyBase64: base64(bytes), plaintextSha256: await sha256(plaintext) };
  }
  async verify(packet) {
    validatePacket(packet);
    const response = await this.request(`${api}/${encodeURIComponent(packet.fileId)}?alt=media`);
    const text = await response.text();
    if (text.length > 8192) throw new Error('Archivo de prueba demasiado grande.');
    const encrypted = JSON.parse(text);
    const bytes = Uint8Array.from(atob(packet.syntheticKeyBase64), c => c.charCodeAt(0));
    const plaintext = await open(await importDataKey(bytes), encrypted, packet);
    if (await sha256(plaintext) !== packet.plaintextSha256) throw new Error('El contenido no coincide con la prueba original.');
    const batch = JSON.parse(decoder.decode(plaintext));
    if (batch.vaultId !== packet.vaultId || batch.batchId !== packet.blockId || batch.operations?.length !== 1 ||
      batch.operations[0].entityType !== 'device' || batch.operations[0].payload?.label !== 'Synthetic F0 Google interoperability probe')
      throw new Error('No es un lote sintético de esta prueba.');
    return { fileId: packet.fileId, blockId: packet.blockId, integrityVerified: true, synthetic: true };
  }
}
export function validatePacket(packet) {
  if (!packet || packet.type !== 'PaymentPlanF0GoogleProbe' || packet.probeVersion !== 1 || packet.synthetic !== true || packet.purpose !== 'batch' ||
    ![packet.vaultId, packet.keyId, packet.blockId].every(value => typeof value === 'string' && uuid.test(value)) ||
    typeof packet.fileId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(packet.fileId) || packet.name !== prefix + packet.blockId + '.json' ||
    typeof packet.syntheticKeyBase64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(packet.syntheticKeyBase64) ||
    typeof packet.plaintextSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(packet.plaintextSha256)) throw new Error('Paquete sintético de prueba inválido.');
  const bytes = Uint8Array.from(atob(packet.syntheticKeyBase64), c => c.charCodeAt(0));
  if (bytes.length !== 32 || base64(bytes) !== packet.syntheticKeyBase64) throw new Error('Clave sintética inválida.');
}
