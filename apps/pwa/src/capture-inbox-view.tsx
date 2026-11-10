import { useEffect, useRef, useState } from 'react';
import type { VaultSession } from '@paymentplan/application';
import type { Change } from '@paymentplan/domain';
import type { IndexedVaultStore } from '@paymentplan/storage';
import { CaptureText } from './capture-text.tsx';
import { enqueueCapture, openCapture, prepareInbox } from './capture-inbox.ts';
import type { CaptureDraft } from './capture-inbox.ts';
import { QuickCapture } from './quick-capture-view.tsx';
import { Dialog } from './ui.tsx';

export function LockedCapture({ store, vaultId, today, close, saved }: { store: IndexedVaultStore; vaultId: string; today: string; close: () => void; saved: () => void }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [listening, setListening] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current || listening) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await enqueueCapture(store, vaultId, { text: text.trim(), date: today }); saved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la captura pendiente.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Dialog title="Captura pendiente sin desbloquear" close={() => { if (!busy) close(); }}>
    <p className="caption">Se guardará cifrada solo en este dispositivo. No modifica saldos hasta que desbloquees, revises y confirmes. Si borras los datos de la aplicación antes de revisar, se perderá.</p>
    <CaptureText text={text} change={setText} disabled={busy} onListening={setListening} />
    {error && <p className="alert error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button><button type="button" className="primary" disabled={busy || listening || !text.trim()} onClick={() => void submit()}>{busy ? 'Guardando…' : 'Guardar pendiente'}</button></div>
  </Dialog>;
}

type Row = { id: string; draft?: CaptureDraft; error?: string };
export function CaptureInbox({ session, today, blocked, save }: {
  session: VaultSession; today: string; blocked: boolean; save: (changes: Change[], id: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([]), [selected, setSelected] = useState<Row | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await prepareInbox(session);
        const key = await session.store.inboxKey(session.header.vaultId);
        if (!key) throw Error('No se pudo preparar la bandeja de capturas.');
        const entries = await session.store.inboxEntries(session.header.vaultId);
        const loaded = await Promise.all(entries.map(async entry => {
          try { return { id: entry.id, draft: await openCapture(session, key, entry) }; }
          catch { return { id: entry.id, error: 'No se pudo descifrar esta captura. Podría estar dañada o pertenecer a otra clave.' }; }
        }));
        if (active && session.unlocked) { setRows(loaded); setReady(true); setError(''); }
      } catch (e) { if (active && session.unlocked) { setReady(false); setError(e instanceof Error ? e.message : 'No se pudo abrir la bandeja de capturas.'); } }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [session, generation]);
  async function remove(row: Row) {
    if (!window.confirm('¿Descartar esta captura pendiente? No se registrará ningún movimiento.')) return;
    setBusy(true); setError('');
    try { await session.store.deleteInboxEntry(session.header.vaultId, row.id); setGeneration(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descartar la captura.'); }
    finally { setBusy(false); }
  }
  return <>{error && <p className="alert error" role="alert">Bandeja de capturas: {error} <button type="button" className="text-button" onClick={() => setGeneration(n => n + 1)}>Reintentar</button></p>}
    {!loading && ready && rows.length === 0 && <p className="caption" role="status">Captura sin desbloquear preparada en este dispositivo.</p>}
    {!loading && rows.length > 0 && <section className="panel"><h2>Capturas pendientes ({rows.length})</h2><p className="caption">Estas frases no han modificado tus saldos. Revísalas y confirma cada registro; permanecen solo en este dispositivo.</p>
      {rows.map(row => <div className="settings-row" key={row.id}><span>{row.draft ? <><strong>{row.draft.text}</strong><small>Capturada el {row.draft.date}</small></> : <strong>{row.error}</strong>}</span><div className="row-actions">
        {row.draft && <button className="secondary" disabled={busy || blocked} onClick={() => setSelected(row)}>Revisar</button>}
        <button className="text-button" disabled={busy} onClick={() => void remove(row)}>Descartar</button></div></div>)}</section>}
    {selected?.draft && !blocked && <QuickCapture key={selected.id} session={session} today={today} draft={selected.draft} close={() => setSelected(null)} save={async changes => {
      await save(changes, selected.id); setGeneration(n => n + 1);
    }} />}
  </>;
}
