import { useState } from 'react';
import type { VaultSession } from '@paymentplan/application';
import { cashBalance, live, tandaSchedule } from '@paymentplan/domain';
import type { Change, Tanda } from '@paymentplan/domain';
import { Field, MoneyField, money, parseMoney, shortDate, str } from './ui.tsx';

type Act = (prepare: () => Change[] | Promise<Change[]>) => void;

// Tandas: aportación quincenal con cargo desde la cuenta de nómina y cobro confirmado el día del turno.
export function TandasPanel({ session, today, busy, blocked, act }: { session: VaultSession; today: string; busy: boolean; blocked: boolean; act: Act }) {
  const [editing, setEditing] = useState<Tanda | 'new' | null>(null), [showArchived, setShowArchived] = useState(false);
  const p = session.portfolio, income = live(p.incomes)[0]?.value, payroll = live(p.cashAccounts).find(a => a.id === income?.payrollAccountId);
  const all = income?.tandas ?? [], shown = all.filter(t => showArchived || !t.archived);
  const cmd = () => session.commands(today);
  const paidCents = (t: Tanda) => live(p.cashEntries).filter(e => e.value.accountId === payroll?.id && e.value.kind === 'expense' && e.value.description.startsWith(`Tanda ${t.name} · aportación`)).length;
  return <section className="panel"><div className="section-heading"><h2>Tandas</h2><button className="secondary" disabled={busy || blocked || !payroll} onClick={() => setEditing('new')}>Nueva tanda</button></div>
    <p className="caption">{payroll ? `Cada quincena se carga tu aportación a ${payroll.value.name} al confirmar tu nómina en Presupuesto. El día de tu turno registras el cobro.` : 'Vincula primero una cuenta de nómina para registrar tandas.'}</p>
    {editing && <form key={typeof editing === 'string' ? 'new' : editing.id} className="form-grid" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget);
      const payload = { name: str(data, 'name'), contributionCents: parseMoney(data.get('contribution')), participants: Number(str(data, 'participants')), turn: Number(str(data, 'turn')),
        firstDate: str(data, 'firstDate'), archived: typeof editing === 'string' ? false : editing.archived };
      act(() => { const changes = cmd().saveTanda(payload, typeof editing === 'string' ? undefined : editing.id); setEditing(null); return changes; }); }}>
      <Field label="Nombre" name="name" value={typeof editing === 'string' ? '' : editing.name} />
      <MoneyField label="Aportación por quincena" name="contribution" value={typeof editing === 'string' ? 0 : editing.contributionCents} />
      <Field label="Participantes" name="participants" type="number" min={2} max={200} value={typeof editing === 'string' ? '' : editing.participants} />
      <Field label="Mi turno" name="turn" type="number" min={1} max={200} value={typeof editing === 'string' ? '' : editing.turn} hint="Número de la quincena en que cobras." />
      <Field label="Primera quincena" name="firstDate" type="date" value={typeof editing === 'string' ? '' : editing.firstDate} hint="Debe ser día 15 o último día del mes." />
      <div className="inline-actions"><button className="primary" disabled={busy || blocked}>Guardar tanda</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancelar</button></div></form>}
    {all.some(t => t.archived) && <label className="check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /><span>Ver tandas archivadas</span></label>}
    {shown.map(t => { let schedule: ReturnType<typeof tandaSchedule> = []; try { schedule = tandaSchedule(t); } catch { /* Tanda inválida: solo se puede editar. */ }
      const turn = schedule.find(r => r.number === t.turn), next = schedule.find(r => r.date >= today), collectible = !t.archived && turn && turn.date <= today,
        payoutRecorded = live(p.cashEntries).some(e => e.value.description === `Cobro de tanda ${t.name}` && e.value.date === turn?.date);
      return <div className="settings-row" key={t.id}><span><strong>{t.name}{t.archived && ' · Archivada'}</strong>
        <small>{money(t.contributionCents)} por quincena · {t.participants} participantes · {next ? `ronda ${next.number} de ${t.participants} (${shortDate(next.date)})` : 'terminada'} · {paidCents(t)} aportaciones cargadas</small>
        {turn && <small>Tu turno: ronda {t.turn} ({shortDate(turn.date)}) · cobras {money(turn.payoutCents)}{payoutRecorded ? ' · cobro registrado' : ''}</small>}
        {payroll && turn && <small>Saldo de {payroll.value.name}: {money(cashBalance(p, payroll.id, today))}</small>}</span>
        <div className="row-actions">
          {collectible && !payoutRecorded && <button className="text-button" disabled={busy || blocked} onClick={() => act(() => cmd().receiveTandaPayout(t.id))}>Registrar cobro</button>}
          <button className="text-button" disabled={busy || blocked} onClick={() => setEditing(t)}>Editar</button>
          <button className="text-button" disabled={busy || blocked} onClick={() => act(() => cmd().saveTanda({ ...t, archived: !t.archived }, t.id))}>{t.archived ? 'Reactivar' : 'Archivar'}</button></div></div>; })}
    {!shown.length && !editing && <p className="caption">Aún no registras tandas.</p>}</section>;
}
