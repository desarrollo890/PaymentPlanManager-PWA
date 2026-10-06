import { DRIVE_SCOPE, DriveProbeClient, validatePacket } from './drive-probe.mjs';
const element = id => document.getElementById(id);
let token = null, expiresAt = 0, tokenClient = null, packet = null, busy = false, generation = 0;
const status = text => { element('status').textContent = text; };
const result = value => { element('result').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
const drive = new DriveProbeClient(() => token && Date.now() < expiresAt ? token : null);
function controls() {
  const authorized = Boolean(token && Date.now() < expiresAt);
  for (const id of ['list', 'create', 'packet']) element(id).disabled = busy || !authorized;
  element('download').disabled = busy || !packet;
  element('disconnect').disabled = busy || !token;
  element('authorize').disabled = busy || !tokenClient;
}
async function perform(work) {
  if (busy) return;
  busy = true; controls();
  try { await work(); }
  catch (error) { result(error instanceof TypeError ? 'No se pudo conectar con Google. Comprueba conexión y configuración.' : error.message || 'La prueba no se completó.'); }
  finally { busy = false; controls(); }
}
function clearSession() { generation++; token = null; expiresAt = 0; packet = null; element('packet').value = ''; controls(); }
element('origin').textContent = 'Origen a autorizar en Google Cloud: ' + location.origin;
const config = await (await fetch('/config.json')).json();
if (!config.clientId) status('Falta el Client ID web público. Configúralo en config/google-oauth.json o .env.local y reinicia esta herramienta.');
else {
  status('Client ID web configurado. Aún no se ha autorizado Drive.');
  element('prepare').disabled = false;
}
element('prepare').addEventListener('click', () => perform(async () => {
  element('prepare').disabled = true;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('No se pudo cargar Google Identity Services.')); };
    document.head.appendChild(script);
  }).catch(error => { element('prepare').disabled = false; throw error; });
  tokenClient = google.accounts.oauth2.initTokenClient({ client_id: config.clientId, scope: DRIVE_SCOPE, include_granted_scopes: false,
    callback: response => {
      busy = false;
      if (response.error || !response.access_token || !google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
        clearSession(); status('Drive no fue autorizado. Revisa el consentimiento y la cuenta de prueba.'); return;
      }
      const seconds = Number(response.expires_in);
      if (!Number.isFinite(seconds) || seconds <= 30) { clearSession(); status('Google no devolvió una autorización vigente.'); return; }
      token = response.access_token; expiresAt = Date.now() + (seconds - 30) * 1000;
      status('Drive autorizado para esta sesión. Ya puedes ejecutar la prueba.'); controls();
    },
    error_callback: () => { busy = false; clearSession(); status('La autorización fue cancelada o la ventana no pudo abrirse.'); },
  });
  status('Pulsa Autorizar Drive para seleccionar tu cuenta y dar permiso.');
}));
element('authorize').addEventListener('click', () => {
  if (!tokenClient || busy) return;
  clearSession(); result('Nueva sesión de prueba.'); busy = true; controls();
  try { tokenClient.requestAccessToken({ prompt: 'select_account' }); }
  catch { busy = false; clearSession(); status('No se pudo abrir la autorización Google.'); }
});
element('disconnect').addEventListener('click', () => { clearSession(); result('Sesión local cerrada. Los archivos sintéticos creados permanecen en Drive.'); status('Desconectado. Esto no revoca el consentimiento de Google.'); });
element('list').addEventListener('click', () => perform(async () => { const files = await drive.list(); result({ synthetic: true, files }); }));
element('create').addEventListener('click', () => perform(async () => {
  const session = generation;
  const created = await drive.create();
  const verified = await drive.verify(created);
  const files = await drive.list();
  if (!files.some(file => file.id === created.fileId)) throw new Error('El archivo creado no apareció al listar appDataFolder.');
  if (session !== generation) throw new Error('La sesión cambió durante la prueba.');
  packet = created; result({ ...verified, listedInAppDataFolder: true, androidInteroperability: 'pending' });
}));
element('download').addEventListener('click', () => {
  if (!packet || busy) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'paymentplan-f0-synthetic-probe.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element('packet').addEventListener('change', () => perform(async () => {
  const file = element('packet').files?.[0];
  if (!file || file.size > 8192) throw new Error('Selecciona un paquete sintético JSON de hasta 8 KiB.');
  const imported = JSON.parse(await file.text()); validatePacket(imported); result(await drive.verify(imported));
}));
setInterval(() => { if (token && Date.now() >= expiresAt) { token = null; expiresAt = 0; status('La autorización caducó. Vuelve a conectar Google.'); controls(); } }, 1000);
controls();
