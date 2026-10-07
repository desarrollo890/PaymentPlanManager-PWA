import { useCallback, useEffect, useRef, useState } from 'react';
import { VaultSession, assertBackup, decodeBatches, synchronizeDrive, importLegacy } from '@paymentplan/application';
import type { EncryptedBackup, ImportPreview } from '@paymentplan/application';
import { createVault, unlockVault, recoverVault, assertVaultHeader } from '@paymentplan/crypto';
import type { VaultHeader, VaultCipher } from '@paymentplan/crypto';
import { IndexedVaultStore, LocalRevisionError } from '@paymentplan/storage';
import type { VaultMetadata } from '@paymentplan/storage';
import { DriveTransport, mergeRevisions, GoogleAuthorizationError } from '@paymentplan/sync';
import type { Change } from '@paymentplan/domain';
import { live, addDays, remindersFor } from '@paymentplan/domain';
import { GoogleAccess } from './google.ts';
import { FinancialForm } from './financial-forms.tsx';
import type { FinancialModal } from './financial-forms.tsx';
import { Dashboard, CardsView, MovementsView, CalendarView, BudgetView, LoansView, PeriodsView } from './financial-views.tsx';
import { Dialog, Field, MoneyField, Icon, Check, download, money, parseMoney, shortDate, str, todayInMexico } from './ui.tsx';
import oauth from '../../../config/google-oauth.json';
import { applyUpdate } from './offline.ts';
import { BankImport } from './bank-import.tsx';
import { BrowserReminders } from './browser-reminders.tsx';
import { EducationView, InsightsView, PayoffView } from './growth-views.tsx';
import { ConflictReview } from './conflicts.tsx';

const google = new GoogleAccess(oauth.web.clientId);
const sections = [ ['inicio', 'Inicio', 'home', 'Tu espacio financiero'], ['tarjetas', 'Tarjetas', 'card', 'Tus tarjetas'],
  ['movimientos', 'Movimientos', 'activity', 'Tus movimientos'], ['plan', 'Calendario', 'calendar', 'Tu calendario de pagos'],
  ['presupuesto', 'Presupuesto', 'report', 'Tu presupuesto'], ['prestamos', 'Préstamos', 'people', 'Préstamos de personas'],
  ['periodos', 'Periodos', 'report', 'Tus resúmenes'], ['analisis', 'Análisis', 'report', 'Gastos y costos'], ['simulador', 'Simulador', 'activity', 'Explora cómo reducir tu deuda'], ['aprender', 'Aprender', 'report', 'Educación financiera'], ['preferencias', 'Preferencias', 'settings', 'A tu manera'] ] as const;
type Section = typeof sections[number][0];
const selectedSection = (): Section => sections.find(s => s[0] === window.location.hash.slice(2))?.[0] ?? 'inicio';
const message = (error: unknown): string => error instanceof Error ? error.message : 'No se pudo completar la operación.';

export function App() {
  const [store] = useState(() => new IndexedVaultStore());
  const [vaults, setVaults] = useState<VaultMetadata[]>([]), [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<VaultSession | null>(null), sessionRef = useRef<VaultSession | null>(null);
  const [revision, setRevision] = useState(0), [section, setSection] = useState<Section>(selectedSection);
  const [today, setToday] = useState(todayInMexico), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), busyRef = useRef(false), [modal, setModal] = useState<FinancialModal | null>(null);
  const [googleReady, setGoogleReady] = useState(google.ready), [authorized, setAuthorized] = useState(false);
  const [remoteHeaders, setRemoteHeaders] = useState<VaultHeader[]>([]), [backup, setBackup] = useState<EncryptedBackup | null>(null);
  const [creation, setCreation] = useState<Awaited<ReturnType<typeof createVault>> | null>(null);
  const [migration, setMigration] = useState<ImportPreview | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false), [offlineUnavailable, setOfflineUnavailable] = useState(false);
  useEffect(() => { const update = () => setUpdateAvailable(true), offline = () => setOfflineUnavailable(true);
    window.addEventListener('paymentplan-update', update); window.addEventListener('paymentplan-offline-unavailable', offline);
    return () => { window.removeEventListener('paymentplan-update', update); window.removeEventListener('paymentplan-offline-unavailable', offline); }; }, []);
  const [newMode, setNewMode] = useState(false), [recoverMode, setRecoverMode] = useState(false);
  const [selectedVault, setSelectedVault] = useState(''), [lastSync, setLastSync] = useState('');
  const channel = useRef<BroadcastChannel | null>(null), lastActivity = useRef(Date.now());
  const refreshVaults = useCallback(async () => { const entries = await store.list(); setVaults(entries); setSelectedVault(v => v || entries[0]?.vaultId || ''); setLoaded(true); }, [store]);
  useEffect(() => { void refreshVaults().catch(e => { setError(message(e)); setLoaded(true); }); }, [refreshVaults]);
  useEffect(() => { const update = () => setSection(selectedSection()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const lock = useCallback(() => { sessionRef.current?.lock(); sessionRef.current = null; setSession(null); google.forget(); setAuthorized(false); setModal(null); setBankOpen(false); setBackup(null); setMigration(null); setRemoteHeaders([]); setError(''); setNotice('Cartera bloqueada.'); }, []);
  useEffect(() => {
    const touch = () => { lastActivity.current = Date.now(); };
    for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, touch, { passive: true });
    const timer = setInterval(() => { setToday(todayInMexico()); if (sessionRef.current && Date.now() - lastActivity.current > 15 * 60_000) lock(); }, 30_000);
    const hide = () => { if (document.visibilityState === 'visible' && Date.now() - lastActivity.current > 15 * 60_000) lock(); };
    document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); for (const event of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(event, touch); };
  }, [lock]);
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const c = new BroadcastChannel('paymentplan-vault-updates'); channel.current = c;
    c.onmessage = event => { const current = sessionRef.current; if (current && event.data?.vaultId === current.header.vaultId) void current.refresh().then(() => setRevision(v => v + 1)).catch(e => setError(message(e))); };
    return () => { c.close(); channel.current = null; };
  }, []);
  async function run(task: () => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try { await task(); } catch (e) { if (e instanceof GoogleAuthorizationError) { google.forget(); setAuthorized(false); } if (e instanceof LocalRevisionError && sessionRef.current) { await sessionRef.current.refresh(); setRevision(v => v + 1); } setError(message(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function enter(header: VaultHeader, cipher: VaultCipher) {
    const current = new VaultSession(store, header, cipher);
    try { await current.refresh(); } catch (e) { current.lock(); throw e; }
    sessionRef.current?.lock(); sessionRef.current = current; lastActivity.current = Date.now(); setSession(current); setRevision(v => v + 1);
    setCreation(null); setBackup(null); setRemoteHeaders([]); setNewMode(false); setRecoverMode(false); setNotice('Cartera desbloqueada.'); await refreshVaults();
  }
  async function save(changes: Change[]) {
    if (!session || busyRef.current) throw Error('Espera a que termine la operación en curso.');
    busyRef.current = true; setBusy(true);
    try { await session.commit(changes, today); setRevision(v => v + 1); channel.current?.postMessage({ vaultId: session.header.vaultId }); setNotice('Cambios guardados y cifrados en este dispositivo.'); }
    catch (e) { if (e instanceof LocalRevisionError) { await session.refresh(); setRevision(v => v + 1); } throw e; }
    finally { busyRef.current = false; setBusy(false); }
  }
  const act = (prepare: () => Change[] | Promise<Change[]>) => { void run(async () => {
    if (!session) return; const changes = await prepare(); await session.commit(changes, today); setRevision(v => v + 1); channel.current?.postMessage({ vaultId: session.header.vaultId }); setNotice('Cambios guardados.');
  }); };
  async function sync() { const current = sessionRef.current; if (!current) return; const result = await synchronizeDrive(current, new DriveTransport(google.getToken));
    setRevision(v => v + 1); setLastSync(new Date().toLocaleTimeString('es-MX')); setNotice(`Sincronización terminada: ${result.downloaded} recibidos, ${result.uploaded} enviados.`); channel.current?.postMessage({ vaultId: current.header.vaultId }); }
  useEffect(() => {
    if (!session || !authorized) return;
    const automatic = () => { if (!busyRef.current && navigator.onLine && google.getToken()) void run(sync); };
    const timer = setInterval(automatic, 60_000), debounce = setTimeout(automatic, 2500);
    window.addEventListener('online', automatic); return () => { clearInterval(timer); clearTimeout(debounce); window.removeEventListener('online', automatic); };
    // Re-arm when financial state changes, without prompting for authorization.
  }, [session, authorized, session?.pendingCount]);
  function authorize() { const promise = google.authorize(); void run(async () => { await promise; setAuthorized(true);
    if (sessionRef.current) await sync(); else {
      const transport = new DriveTransport(google.getToken), headers: VaultHeader[] = [];
      for (const info of await transport.vaults()) { const value = await transport.header(info.remoteId); assertVaultHeader(value); if (value.vaultId !== info.vaultId || value.keyId !== info.keyId || value.passwordWrap.blockId !== info.wrapId) throw Error('Encabezado de Drive inconsistente.'); headers.push(value); }
      setRemoteHeaders(headers.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))); setNotice(headers.length ? 'Elige la cartera que quieres recuperar de Drive.' : 'No hay una cartera guardada en esta cuenta.');
    } }); }
  async function readBackup(file?: File) {
    if (!file) return; if (file.size > 100_000_000) throw Error('El respaldo excede 100 MB.');
    const value: unknown = JSON.parse(await file.text()); assertBackup(value); setBackup(value); setNotice('Respaldo seleccionado. Verifica la contraseña para importarlo.');
  }
  async function importBackup(password: string, recoveryKey?: string) {
    if (!backup) return; const { blocks } = backup;
    const recovered = recoveryKey ? await recoverVault(backup.header, recoveryKey, password) : null;
    const header = recovered?.header ?? backup.header, cipher = recovered?.cipher ?? await unlockVault(header, password);
    try {
      mergeRevisions(await decodeBatches(header, cipher, blocks));
      const existing = (await store.list()).find(v => v.vaultId === header.vaultId);
      if (existing) { assertVaultHeader(existing.header); if (existing.header.keyId !== header.keyId) throw Error('Esta cartera usa otra clave.'); }
      if (!existing || recovered) await store.initialize(header, Boolean(existing));
      const chosenHeader = recovered || !existing ? header : existing.header as VaultHeader;
      const target = new VaultSession(store, chosenHeader, cipher); await target.refresh(); await target.receive(blocks);
      // A restored local backup must also be queued, so it can seed an empty Drive.
      const stored = await store.load(header.vaultId); await store.commit(header.vaultId, stored.metadata.version, stored.metadata.sequence, blocks, true);
      await enter(chosenHeader, cipher); setNotice('Respaldo importado. Los registros repetidos no se duplicaron.');
    } catch (e) { cipher.lock(); throw e; }
  }
  const sectionData = sections.find(s => s[0] === section)!;
  const problems = session?.issues(today) ?? [];
  const view = session && !problems.length ? session.view(today) : null;
  const blocked = Boolean(session?.hasRevisionConflicts || problems.length);
  const googleButtons = <div className="inline-actions">{!googleReady ? <button className="secondary" disabled={busy} onClick={() => void run(async () => { await google.prepare(); setGoogleReady(true); })}>Preparar Google Drive</button> : <button className="secondary" disabled={busy} onClick={authorize}>{authorized ? 'Renovar autorización' : 'Autorizar Google Drive'}</button>}{authorized && <button className="text-button" disabled={busy} onClick={() => { google.forget(); setAuthorized(false); setRemoteHeaders([]); setNotice('Google desconectado de esta sesión.'); }}>Desconectar</button>}</div>;
  return <div className="app-layout"><a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Ir al contenido</a>
    <aside className="sidebar"><a className="brand" href="#/inicio"><span className="brand-symbol">P</span><span>Payment<span className="brand-light">Plan</span></span></a><p className="nav-label">MI ESPACIO</p>
      <nav aria-label="Navegación principal">{sections.map(([id, label, icon]) => <a key={id} href={`#/${id}`} className={`nav-item ${section === id ? 'active' : ''}`} aria-current={section === id ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></a>)}</nav>
      <div className="sidebar-note"><Icon name="shield" /><p>Tu información cifrada.<br />Tu plan, en cada quincena.</p></div></aside>
    <div className="main-shell"><header className="topbar"><span>Finanzas personales <span className="separator">/</span> <strong>{sectionData[1]}</strong></span>
      {session && <div className="header-actions"><button className="primary" disabled={busy || blocked || !view?.cards.length} onClick={() => setModal({ type: 'movement' })}><Icon name="plus" size={16} /><span>Registrar movimiento</span></button>
        <button className="icon-button" aria-label="Sincronizar" title={authorized ? 'Sincronizar' : 'Autoriza Google en Preferencias'} disabled={busy || !authorized} onClick={() => void run(sync)}><Icon name="sync" /></button>
        <button className="icon-button" aria-label="Bloquear cartera" title="Bloquear cartera" disabled={busy} onClick={lock}><Icon name="lock" /></button></div>}</header>
      <main id="main" tabIndex={-1}><div className="page-heading"><div><p className="eyebrow">UN PLAN PARA TUS PRÓXIMAS QUINCENAS</p><h1>{sectionData[3]}</h1><p className="subtitle">{session ? 'Tus registros conectados. Tus decisiones, más claras.' : 'Un espacio personal, protegido por tu contraseña.'}</p></div><span className="currency-tag">MXN</span></div>
        {error && <p role="alert" className="alert error">{error}<button className="text-button" onClick={() => setError('')}>Cerrar</button></p>}{notice && <p role="status" className="notice">{notice}</p>}
        {updateAvailable && <p className="alert">Hay una versión nueva disponible. Se bloqueará la cartera para actualizar.<button className="text-button" disabled={busy || Boolean(modal) || bankOpen || Boolean(migration) || Boolean(backup)} onClick={() => { lock(); applyUpdate(); }}>Actualizar aplicación</button></p>}
        {offlineUnavailable && <p className="alert">No se pudo preparar el acceso sin conexión. Revisa el almacenamiento y vuelve a abrir la aplicación con conexión.</p>}
        {!loaded ? <p>Cargando almacenamiento local…</p> : !session ? <section className="panel unlock-panel"><Icon name="lock" size={30} />
          {creation ? <><h2>Guarda tu clave de recuperación</h2><p>Esta clave permite recuperar tu cartera si olvidas la contraseña. Guárdala por separado del respaldo. No podemos recuperarla por ti.</p><code className="recovery-key">{creation.recoveryKey}</code>
            <button className="secondary" onClick={() => download('paymentplan-clave-recuperacion.txt', creation.recoveryKey, 'text/plain')}>Descargar clave</button>
            <form onSubmit={e => { e.preventDefault(); void run(async () => { await store.initialize(creation.header); await enter(creation.header, creation.cipher); }); }}><label className="check"><input type="checkbox" required />Guardé la clave de recuperación en un lugar seguro</label><button className="primary" disabled={busy}>Abrir mi cartera</button></form></> : <>
            <h2>{newMode || (!vaults.length && !remoteHeaders.length && !backup) ? 'Crea tu cartera' : recoverMode ? 'Recupera el acceso' : 'Desbloquea tu cartera'}</h2>
            <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run(async () => {
              const password = str(data, 'password');
              if (backup) { if (recoverMode && password !== str(data, 'confirmation')) throw Error('Las contraseñas no coinciden.'); await importBackup(password, recoverMode ? str(data, 'recovery') : undefined); return; }
              if (newMode || (!vaults.length && !remoteHeaders.length)) { if (password !== str(data, 'confirmation')) throw Error('Las contraseñas no coinciden.'); setCreation(await createVault(password)); return; }
              const remote = remoteHeaders.find(h => h.passwordWrap.blockId === str(data, 'vault'));
              const local = vaults.find(v => v.vaultId === str(data, 'vault')); const header = remote ?? local?.header; assertVaultHeader(header);
              if (recoverMode) { if (password !== str(data, 'confirmation')) throw Error('Las contraseñas no coinciden.'); const recovered = await recoverVault(header, str(data, 'recovery'), password);
                if (!local) throw Error('Primero importa un respaldo cifrado o recupera la cartera desde Drive.'); await store.initialize(recovered.header, true); await enter(recovered.header, recovered.cipher); }
              else { const cipher = await unlockVault(header, password); try {
                if (remote && !local) { if (!(await store.list()).some(v => v.vaultId === header.vaultId)) await store.initialize(header); const target = new VaultSession(store, header, cipher); await target.refresh(); await synchronizeDrive(target, new DriveTransport(google.getToken)); }
                await enter(header, cipher);
              } catch (e) { cipher.lock(); throw e; } }
            }); }}>
              {!newMode && !backup && (vaults.length > 0 || remoteHeaders.length > 0) && <label className="field"><span>Cartera</span><select name="vault" value={selectedVault || remoteHeaders[0]?.passwordWrap.blockId || ''} onChange={e => setSelectedVault(e.target.value)}>{vaults.map(v => <option key={v.vaultId} value={v.vaultId}>Local · {v.vaultId.slice(0, 8)}</option>)}{remoteHeaders.map(v => <option key={v.passwordWrap.blockId} value={v.passwordWrap.blockId}>Drive · {v.vaultId.slice(0, 8)} · {v.createdAt.slice(0, 10)}</option>)}</select></label>}
              {recoverMode && <Field label="Clave de recuperación" name="recovery" />}
              <Field label={recoverMode ? 'Nueva contraseña maestra' : 'Contraseña maestra'} name="password" type="password" />
              {(newMode || recoverMode || (!vaults.length && !remoteHeaders.length && !backup)) && <Field label="Repite la contraseña" name="confirmation" type="password" />}
              <p className="caption">Al menos 12 caracteres. Cifrado local AES-256-GCM; la contraseña y los tokens permanecen en memoria durante esta sesión.</p><button className="primary" disabled={busy}>{busy ? 'Verificando…' : backup ? 'Importar respaldo' : newMode || (!vaults.length && !remoteHeaders.length) ? 'Crear cartera' : recoverMode ? 'Cambiar contraseña y desbloquear' : 'Desbloquear'}</button></form>
            <div className="inline-actions">{vaults.length > 0 && <button className="text-button" onClick={() => { setNewMode(!newMode); setRecoverMode(false); }}> {newMode ? 'Volver a mi cartera' : 'Crear otra cartera'}</button>}{(vaults.length > 0 || backup) && <button className="text-button" onClick={() => { setRecoverMode(!recoverMode); setNewMode(false); }}>{recoverMode ? 'Usar contraseña' : 'Olvidé mi contraseña'}</button>}
              <label className="file-button secondary">Importar respaldo cifrado<input type="file" accept=".json" onChange={e => void run(() => readBackup(e.target.files?.[0]))} /></label>{backup && <button className="text-button" onClick={() => setBackup(null)}>Cancelar importación</button>}</div>
            <hr /><h3>¿Ya tienes tu cartera en otro dispositivo?</h3><p className="caption">Autoriza Drive para buscar tu cartera cifrada. Google es opcional para trabajar en este dispositivo.</p>{googleButtons}</>}
          </section> : <>
          {blocked && <ConflictReview session={session} today={today} issues={problems} busy={busy} perform={work => void run(async () => { await work(); setRevision(v => v + 1); channel.current?.postMessage({ vaultId: session.header.vaultId }); })} />}
          {view && section === 'inicio' && remindersFor(session.portfolio, view).length > 0 && <section className="panel"><h2>Tus avisos</h2>{remindersFor(session.portfolio, view).map(r => <div className="settings-row" key={r.key}><span><strong className={r.overdue ? 'negative' : ''}>{r.title}</strong><small>{shortDate(r.date)} · {money(r.amountCents)} · los pagos requieren que los realices tú</small></span><div className="row-actions"><button className="text-button" disabled={busy || blocked} onClick={() => act(() => session.commands(today).dismissReminder({ reminderKey: r.key, postponedUntil: null }))}>Atendido</button><button className="text-button" disabled={busy || blocked} onClick={() => act(() => session.commands(today).dismissReminder({ reminderKey: r.key, postponedUntil: addDays(today, 1) }))}>Mañana</button></div></div>)}</section>}
          {view && section === 'inicio' && <Dashboard view={view} modal={m => { if (!blocked) setModal(m); }} p={session.portfolio} />}
          {view && section === 'tarjetas' && <CardsView view={view} session={session} modal={m => { if (!blocked) setModal(m); }} act={act} />}
          {section === 'movimientos' && <><div className="section-heading"><span className="caption">Tus registros y movimientos bancarios</span><button className="secondary" disabled={busy || blocked || !view?.cards.length} onClick={() => setBankOpen(true)}>Importar CSV / Excel</button></div><MovementsView session={session} today={today} modal={m => { if (!blocked) setModal(m); }} act={act} /></>}
          {view && section === 'plan' && <CalendarView view={view} modal={m => { if (!blocked) setModal(m); }} />}
          {view && section === 'presupuesto' && <BudgetView view={view} p={session.portfolio} modal={m => { if (!blocked) setModal(m); }} />}
          {view && section === 'prestamos' && <LoansView session={session} view={view} modal={m => { if (!blocked) setModal(m); }} act={act} />}
          {view && <BrowserReminders p={session.portfolio} view={view} controls={section === 'preferencias'} />}
          {view && section === 'aprender' && <EducationView view={view} />}
          {view && section === 'analisis' && <InsightsView p={session.portfolio} today={today} view={view} />}
          {section === 'simulador' && <PayoffView />}
          {section === 'periodos' && <PeriodsView session={session} today={today} act={act} />}
          {section === 'preferencias' && <><section className="panel"><h2>Ingresos y reserva</h2><p className="caption">Recibes ingresos el 15 y el último día del mes. La reserva es dinero para imprevistos que se descuenta del presupuesto disponible para pagar.</p>
            <form key={revision} className="form-grid" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); act(() => session.commands(today).saveIncome({ income15Cents: parseMoney(data.get('income15')), incomeEndCents: parseMoney(data.get('incomeEnd')), expensesCents: parseMoney(data.get('expenses')), reserveCents: parseMoney(data.get('reserve')) })); }}>
              <MoneyField label="Ingreso del 15" name="income15" value={live(session.portfolio.incomes)[0]?.value.income15Cents ?? 0} /><MoneyField label="Ingreso de fin de mes" name="incomeEnd" value={live(session.portfolio.incomes)[0]?.value.incomeEndCents ?? 0} />
              <MoneyField label="Gastos esenciales por quincena" name="expenses" value={live(session.portfolio.incomes)[0]?.value.expensesCents ?? 0} /><MoneyField label="Reserva por quincena" name="reserve" value={live(session.portfolio.incomes)[0]?.value.reserveCents ?? 0} /><button className="primary" disabled={busy || blocked}>Guardar ingresos</button></form></section>
            <section className="panel"><h2>Avisos en la aplicación</h2><form key={'reminders' + revision} className="form-grid" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); act(() => session.commands(today).reminders({ enabled: d.has('enabled'), cuts: d.has('cuts'), payments: d.has('payments'), daysBefore: Number(str(d, 'daysBefore')) })); }}><Check name="enabled" label="Mostrar avisos al abrir Inicio" checked={live(session.portfolio.reminderPreferences)[0]?.value.enabled ?? true} /><Field label="Días de anticipación" name="daysBefore" type="number" min={0} max={30} value={live(session.portfolio.reminderPreferences)[0]?.value.daysBefore ?? 3} /><Check name="cuts" label="Cortes de tarjetas" checked={live(session.portfolio.reminderPreferences)[0]?.value.cuts ?? true} /><Check name="payments" label="Pagos y abonos" checked={live(session.portfolio.reminderPreferences)[0]?.value.payments ?? true} /><button className="primary" disabled={busy || blocked}>Guardar avisos</button></form><p className="caption">Los avisos aparecen dentro de la aplicación; no se envían notificaciones cuando está cerrada.</p></section>
            <section className="panel"><h2>Google Drive</h2><p className="caption">Solo se envían bloques cifrados a la carpeta privada de esta aplicación. La sincronización automática revisa cada minuto mientras la cartera está abierta y hay autorización vigente.</p>{googleButtons}
              <div className="settings-row"><span>{authorized ? 'Conectado en esta sesión' : 'Sin conectar'}{lastSync && ` · última sincronización ${lastSync}`}</span><strong>{session.pendingCount} bloques por enviar</strong></div>
              <button className="secondary" disabled={busy || !authorized} onClick={() => void run(sync)}>Sincronizar ahora</button>{authorized && <button className="text-button danger" onClick={() => void run(async () => { await google.revoke(); setAuthorized(false); setNotice('Permiso revocado en Google.'); })}>Revocar permiso de Google</button>}</section>
            <section className="panel"><h2>Migrar desde la aplicación anterior</h2><p className="caption">Selecciona el JSON exportado desde PaymentPlanManager. Se conservan identificadores, planes, pagos y cierres; verás el cuadre antes de guardar. El archivo se procesa en este dispositivo.</p><label className="file-button secondary">Seleccionar respaldo anterior<input type="file" accept=".json" disabled={busy || blocked} onChange={e => { const file = e.target.files?.[0]; void run(async () => { if (!file) return; if (file.size > 20_000_000) throw Error('El respaldo anterior excede 20 MB.'); setMigration(await importLegacy(JSON.parse(await file.text()), session.portfolio, today)); }); }} /></label></section>
            <section className="panel"><h2>Respaldo y recuperación</h2><p className="caption">Descarga un respaldo cifrado antes de borrar los datos del navegador. Para restaurarlo necesitas tu contraseña o clave de recuperación. Las exportaciones CSV son archivos legibles; guárdalas en un lugar privado.</p>
              <div className="inline-actions"><button className="secondary" disabled={busy} onClick={() => void run(async () => download(`paymentplan-respaldo-${today}.json`, JSON.stringify(await session.backup())))}>Descargar respaldo cifrado</button><label className="file-button secondary">Importar respaldo cifrado<input type="file" accept=".json" onChange={e => void run(() => readBackup(e.target.files?.[0]))} /></label></div>
              <p className="caption">Cartera {session.header.vaultId.slice(0, 8)} · America/Mexico_City · bloqueo tras 15 minutos sin actividad.</p></section></>}
          {modal && !blocked && <FinancialForm key={JSON.stringify(modal)} modal={modal} session={session} today={today} close={() => setModal(null)} save={save} />}
          {bankOpen && !blocked && <BankImport session={session} today={today} close={() => setBankOpen(false)} save={save} />}
          {backup && <Dialog title="Importar respaldo cifrado" close={() => setBackup(null)}><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run(() => importBackup(str(data, 'password'))); }}><p>Se fusionarán los registros sin duplicar sus identificadores. Si hay diferencias financieras, podrás revisarlas.</p><Field label="Contraseña del respaldo" name="password" type="password" /><button className="primary" disabled={busy}>Verificar e importar</button></form></Dialog>}
          {migration && <Dialog title="Revisar migración" close={() => setMigration(null)}><p>{migration.changes.length} registros nuevos · {migration.skipped} registros ya existentes.</p><p>Deuda de tarjetas {money(migration.view.debtCents)} · préstamos {money(migration.view.loanDebtCents)}</p><div className="table-wrap"><table><thead><tr><th>Tarjeta</th><th>Disponible</th><th>Deuda</th><th>A meses</th></tr></thead><tbody>{migration.view.cards.map(c => <tr key={c.id}><td>{c.name}</td><td>{money(c.availableCents)}</td><td>{money(c.debtCents)}</td><td>{money(c.installmentDebtCents)}</td></tr>)}</tbody></table></div>{migration.warnings.map(w => <p className="alert" key={w}>{w}</p>)}<p className="caption">Compara estos saldos con la aplicación anterior antes de confirmar.</p><button className="primary" disabled={busy || blocked} onClick={() => void run(async () => { await session.commit(migration.changes, today); setMigration(null); setRevision(v => v + 1); setNotice('Migración guardada y cifrada.'); })}>Confirmar migración</button></Dialog>}
        </>}
        <footer>PaymentPlan <span>Guardado local cifrado · tus pagos bancarios los realizas tú.</span></footer></main></div></div>;
}
