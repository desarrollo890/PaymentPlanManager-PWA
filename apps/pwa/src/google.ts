import { DRIVE_SCOPE } from '@paymentplan/sync';
interface TokenResponse { access_token?: string; expires_in?: string | number; scope?: string; error?: string }
interface GoogleSdk {
  accounts: { oauth2: {
    initTokenClient(config: { client_id: string; scope: string; include_granted_scopes: boolean; callback: (response: TokenResponse) => void; error_callback: () => void }): { requestAccessToken(options: { prompt: string }): void };
    revoke(token: string, callback: (result: { successful?: boolean }) => void): void;
  } };
}
declare global { interface Window { google?: GoogleSdk } }
export class GoogleAccess {
  private token: string | null = null;
  private expiresAt = 0;
  private generation = 0;
  private preparation: Promise<void> | null = null;
  readonly clientId: string;
  constructor(clientId: string) { this.clientId = clientId; }
  get ready(): boolean { return Boolean(window.google?.accounts.oauth2); }
  getToken = (): string | null => Date.now() < this.expiresAt - 30_000 ? this.token : null;
  forget(): void { this.generation++; this.token = null; this.expiresAt = 0; }
  prepare(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.preparation) return this.preparation;
    this.preparation = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
      script.onload = () => { if (this.ready) resolve(); else reject(Error('Google no cargó correctamente.')); };
      script.onerror = () => { script.remove(); reject(Error('No se pudo cargar Google. Revisa tu conexión.')); }; document.head.append(script);
    }).catch(error => { this.preparation = null; throw error; });
    return this.preparation;
  }
  authorize(): Promise<void> {
    if (!this.ready) return Promise.reject(Error('Prepara Google antes de autorizar.'));
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({ client_id: this.clientId, scope: DRIVE_SCOPE, include_granted_scopes: false,
        callback: response => {
          if (generation !== this.generation) { reject(Error('La cartera fue bloqueada o desconectada.')); return; }
          if (response.error || !response.access_token || !response.scope?.split(' ').includes(DRIVE_SCOPE)) {
            this.forget(); reject(Error('Google no concedió acceso a la carpeta privada. Puedes seguir trabajando localmente.')); return;
          }
          const seconds = Number(response.expires_in); if (!Number.isFinite(seconds) || seconds <= 30) { reject(Error('Google devolvió una autorización inválida.')); return; }
          this.token = response.access_token; this.expiresAt = Date.now() + Math.min(seconds, 3600) * 1000; resolve();
        }, error_callback: () => reject(Error('La ventana de autorización fue cerrada o bloqueada. Intenta desde el botón.')) });
      client.requestAccessToken({ prompt: 'select_account' });
    });
  }
  async revoke(): Promise<void> {
    const token = this.getToken(); if (!token || !window.google) { this.forget(); return; }
    try { await new Promise<void>((resolve, reject) => window.google!.accounts.oauth2.revoke(token, result => result.successful ? resolve() : reject(Error('Google no confirmó la revocación.')))); }
    finally { this.forget(); }
  }
}
