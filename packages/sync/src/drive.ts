import { assertBlock } from '@paymentplan/contracts';
import type { EncryptedBlock } from '@paymentplan/contracts';
import type { RemoteBlockInfo, RemoteBlockTransport, RemotePage } from './index.ts';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const filesApi = 'https://www.googleapis.com/drive/v3/files';
interface DriveFile { id: string; name: string; appProperties?: Record<string, string> }
export interface RemoteVaultInfo { readonly remoteId: string; readonly vaultId: string; readonly keyId: string; readonly wrapId: string }
export class GoogleAuthorizationError extends Error { constructor() { super('La autorización de Google caducó o fue revocada. Vuelve a autorizar desde el botón.'); } }
export class DriveTransport implements RemoteBlockTransport {
  private getToken: () => string | null;
  private fetcher: typeof fetch;
  constructor(getToken: () => string | null, fetcher: typeof fetch = fetch) { this.getToken = getToken; this.fetcher = fetcher; }
  private async request(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken(); if (!token) throw new GoogleAuthorizationError();
    let response: Response;
    try { response = await this.fetcher.call(globalThis, url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw Error('No se pudo conectar con Drive. Tus cambios siguen guardados en este dispositivo.'); }
    if (response.status === 401) throw new GoogleAuthorizationError();
    if (response.status === 403) throw Error('Drive denegó el acceso. Revisa la cuenta de prueba y el permiso drive.appdata.');
    if (response.status === 429 || response.status >= 500) throw Error('Drive no está disponible temporalmente. Intenta sincronizar más tarde.');
    if (!response.ok) throw Error(`Drive no completó la operación (HTTP ${response.status}).`);
    return response;
  }
  private async json(response: Response, maximum = 1_600_000): Promise<unknown> {
    if (!response.body) throw Error('Respuesta vacía de Drive.');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > maximum) throw Error('El archivo de Drive excede el tamaño admitido.'); chunks.push(part.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally { await reader.cancel().catch(() => {}); }
  }
  private async page(query: string, cursor: string | null = null): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
    const params = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and (${query})`, fields: 'nextPageToken,files(id,name,appProperties)', pageSize: '100' });
    if (cursor) params.set('pageToken', cursor);
    const value = await this.json(await this.request(`${filesApi}?${params}`)) as { files?: DriveFile[]; nextPageToken?: string };
    if (!Array.isArray(value.files) || value.files.some(f => !/^[a-zA-Z0-9_-]{1,200}$/.test(f.id) || typeof f.name !== 'string') ||
      (value.nextPageToken !== undefined && typeof value.nextPageToken !== 'string')) throw Error('Listado de Drive inválido.');
    return { files: value.files, nextPageToken: value.nextPageToken ?? null };
  }
  async list(vaultId: string, cursor: string | null = null): Promise<RemotePage> {
    if (!/^[0-9a-f-]{36}$/.test(vaultId)) throw Error('ID de cartera inválido.');
    const page = await this.page(`name contains 'paymentplan-v1-${vaultId}-block-'`, cursor);
    const files: RemoteBlockInfo[] = [];
    for (const f of page.files) {
      if (!f.name.startsWith(`paymentplan-v1-${vaultId}-block-`)) continue;
      const blockId = f.appProperties?.blockId;
      if (f.appProperties?.vaultId !== vaultId || !blockId || !/^[0-9a-f-]{36}$/.test(blockId)) throw Error('Archivo sin metadatos válidos de cartera.');
      files.push({ remoteId: f.id, blockId, vaultId });
    }
    return { files, nextCursor: page.nextPageToken };
  }
  async download(remoteId: string): Promise<EncryptedBlock> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(remoteId)) throw Error('ID remoto inválido.');
    const block = await this.json(await this.request(`${filesApi}/${encodeURIComponent(remoteId)}?alt=media`)); assertBlock(block); return block;
  }
  private async create(name: string, value: unknown, properties: Record<string, string>): Promise<DriveFile> {
    const boundary = 'paymentplan_' + crypto.randomUUID();
    const metadata = { name, mimeType: 'application/json', parents: ['appDataFolder'], appProperties: { product: 'paymentplan-v1', ...properties } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(value)}\r\n--${boundary}--\r\n`;
    const created = await this.json(await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,appProperties',
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })) as DriveFile;
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(created.id) || created.name !== name) throw Error('Drive no confirmó el archivo.'); return created;
  }
  async upload(block: EncryptedBlock): Promise<RemoteBlockInfo> {
    assertBlock(block); if (block.purpose !== 'batch') throw Error('Solo se transportan lotes financieros cifrados.');
    const result = await this.create(`paymentplan-v1-${block.vaultId}-block-${block.blockId}.json`, block,
      { vaultId: block.vaultId, keyId: block.keyId, blockId: block.blockId });
    return { remoteId: result.id, vaultId: block.vaultId, blockId: block.blockId };
  }
  async vaults(): Promise<readonly RemoteVaultInfo[]> {
    const result: RemoteVaultInfo[] = [], seen = new Set<string>(); let cursor: string | null = null;
    do {
      const page = await this.page("name contains 'paymentplan-v1-vault-'", cursor);
      for (const f of page.files.filter(f => f.name.startsWith('paymentplan-v1-vault-'))) {
        const a = f.appProperties;
        if (!a || !['vaultId', 'keyId', 'wrapId'].every(k => /^[0-9a-f-]{36}$/.test(a[k] ?? ''))) throw Error('Encabezado remoto inválido.');
        result.push({ remoteId: f.id, vaultId: a.vaultId!, keyId: a.keyId!, wrapId: a.wrapId! });
      }
      cursor = page.nextPageToken;
      if (cursor && seen.has(cursor)) throw Error('Drive repitió una página.'); if (cursor) seen.add(cursor);
      if (seen.size > 1000 || result.length > 10000) throw Error('Demasiadas carteras remotas.');
    } while (cursor);
    return result;
  }
  async publishHeader(header: { vaultId: string; keyId: string; passwordWrap: { blockId: string } }): Promise<void> {
    const remote = await this.vaults();
    if (!remote.some(v => v.vaultId === header.vaultId && v.keyId === header.keyId && v.wrapId === header.passwordWrap.blockId))
      await this.create(`paymentplan-v1-vault-${header.vaultId}-${header.passwordWrap.blockId}.json`, header,
        { vaultId: header.vaultId, keyId: header.keyId, wrapId: header.passwordWrap.blockId });
  }
  async header(remoteId: string): Promise<unknown> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(remoteId)) throw Error('ID remoto inválido.');
    return this.json(await this.request(`${filesApi}/${encodeURIComponent(remoteId)}?alt=media`), 8192);
  }
}
