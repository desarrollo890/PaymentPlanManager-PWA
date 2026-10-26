import { useState } from 'react';
import type { VaultSession } from '@paymentplan/application';
import { live, vocalEventSummary, vocalPendingReport, vocalSummaryText, vocalView } from '@paymentplan/domain';
import type { Change, VocalEventSummary, VocalGroupView } from '@paymentplan/domain';
import { Field, MoneyField, SelectField, csvCell, download, money, optionalMoney, parseMoney, shortDate, str } from './ui.tsx';

type Act = (prepare: () => Change[] | Promise<Change[]>) => void;
type Editing = { kind: 'group'; id?: string } | { kind: 'event'; id?: string } | { kind: 'student'; id: string } | { kind: 'payment'; eventId: string; studentId: string; id?: string };
const methodLabel = { cash: 'Efectivo', transfer: 'Transferencia' } as const;
const defaultCycle = (today: string) => { const y = Number(today.slice(0, 4)), start = Number(today.slice(5, 7)) >= 8 ? y : y - 1; return `${start}-${start + 1}`; };

// Vocalía: cuotas de padres por grupo y evento. El dinero es de terceros y no entra a Presupuesto ni al saldo libre.
export function VocaliaView({ session, today, busy, blocked, act }: { session: VaultSession; today: string; busy: boolean; blocked: boolean; act: Act }) {
  const p = session.portfolio, groups = vocalView(p, today), [selected, setSelected] = useState(''), [editing, setEditing] = useState<Editing | null>(null);
  const [open, setOpen] = useState<string | null>(null), [showArchived, setShowArchived] = useState(false), [message, setMessage] = useState('');
  const cmd = () => session.commands(today), off = busy || blocked;
  const visible = groups.filter(g => showArchived || !g.value.archived), group = visible.find(g => g.id === selected) ?? visible[0];
  const accounts = live(p.cashAccounts).filter(a => !a.value.archived);
  const done = (changes: Change[]) => { setEditing(null); return changes; };
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setMessage(`${label} copiado. Pégalo en el chat del grupo.`); } catch { setMessage('No se pudo copiar. Selecciona y copia el texto manualmente.'); }
  };
  const heldByAccount = accounts.map(a => ({ name: a.value.name, cents: live(p.vocalEvents).filter(e => e.value.accountId === a.id && !e.value.settled).reduce((t, e) => t + vocalEventSummary(p, e.id, today).transferCents, 0) })).filter(x => x.cents > 0);
  const csv = (g: VocalGroupView, e: VocalEventSummary) => {
    const rows = [['Alumno', 'Estado', 'Cuota', 'Pagado', 'Pendiente', 'Método', 'Fecha de pago'], ...e.students.map(s => [s.name, !s.owed ? 'No aplica' : s.pendingCents === 0 ? 'Pagó' : s.paidCents > 0 ? 'Abonó' : 'Pendiente',
      s.owed ? (e.value.quotaCents / 100).toFixed(2) : '', (s.paidCents / 100).toFixed(2), (s.pendingCents / 100).toFixed(2), s.payments.map(x => methodLabel[x.value.method]).join(' / '), s.payments.map(x => x.value.date).join(' / ')])];
    download(`vocalia-${g.value.name}-${e.value.name}.csv`.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]+/g, '_'), '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  const groupForm = () => { const old = editing?.kind === 'group' && editing.id ? p.vocalGroups.find(g => g.id === editing.id)?.value : undefined;
    return <form key={editing?.kind === 'group' ? editing.id ?? 'new' : 'x'} className="form-grid" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget);
      act(() => done(cmd().saveVocalGroup({ name: str(d, 'name'), cycle: str(d, 'cycle'), color: old?.color ?? '#0067D8', archived: old?.archived ?? false }, old ? (editing as { id: string }).id : undefined))); }}>
      <Field label="Grupo" name="name" value={old?.name} hint="Ej. 3° A, Primaria." /><Field label="Ciclo escolar" name="cycle" value={old?.cycle ?? defaultCycle(today)} />
      <div className="inline-actions"><button className="primary" disabled={off}>Guardar grupo</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancelar</button></div></form>; };
  const eventForm = (g: VocalGroupView) => { const old = editing?.kind === 'event' && editing.id ? p.vocalEvents.find(e => e.id === editing.id)?.value : undefined, active = g.students.filter(s => s.value.leftDate === null).length;
    return <form key={editing?.kind === 'event' ? editing.id ?? 'new' : 'x'} className="form-grid" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget);
      act(() => done(cmd().saveVocalEvent({ groupId: g.id, name: str(d, 'name'), date: str(d, 'date'), goalCents: parseMoney(d.get('goal')), quotaCents: optionalMoney(d, 'quota'), accountId: str(d, 'account') || null,
        settled: old?.settled ?? false, archived: old?.archived ?? false }, old ? (editing as { id: string }).id : undefined))); }}>
      <Field label="Evento" name="name" value={old?.name} hint="Ej. Posada, Día del niño, Material." /><Field label="Fecha del evento" name="date" type="date" value={old?.date ?? today} hint="Los alumnos dados de alta después de esta fecha no deben cuota." />
      <MoneyField label="Meta total a recaudar" name="goal" value={old?.goalCents ?? null} />
      <MoneyField label="Cuota por alumno (opcional)" name="quota" required={false} value={old?.quotaCents ?? null} hint={`Déjala vacía para dividir la meta entre los ${active} alumnos activos y redondear hacia arriba.`} />
      <SelectField label="Cuenta donde recibes transferencias" name="account" value={old?.accountId ?? ''}><option value="">Sin cuenta (solo efectivo)</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.value.name}</option>)}</SelectField>
      <div className="inline-actions"><button className="primary" disabled={off}>Guardar evento</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancelar</button></div></form>; };
  const paymentForm = (e: VocalEventSummary) => { if (editing?.kind !== 'payment' || editing.eventId !== e.id) return null; const student = e.students.find(s => s.id === editing.studentId), old = editing.id ? p.vocalPayments.find(x => x.id === editing.id)?.value : undefined;
    return <form key={editing.studentId + (editing.id ?? '')} className="form-grid" onSubmit={ev => { ev.preventDefault(); const d = new FormData(ev.currentTarget);
      act(() => done(cmd().recordVocalPayment({ eventId: e.id, studentId: editing.studentId, date: str(d, 'date'), amountCents: parseMoney(d.get('amount')), method: str(d, 'method') as 'cash' | 'transfer', note: str(d, 'note') }, editing.id))); }}>
      <p className="form-note">Pago de {student?.name}</p><Field label="Fecha real" name="date" type="date" value={old?.date ?? today} max={today} />
      <MoneyField label="Importe" name="amount" value={old?.amountCents ?? student?.pendingCents ?? e.value.quotaCents} />
      <SelectField label="Forma de pago" name="method" value={old?.method ?? 'cash'}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></SelectField>
      <Field label="Nota (opcional)" name="note" value={old?.note} required={false} />
      <div className="inline-actions"><button className="primary" disabled={off}>Guardar pago</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancelar</button></div></form>; };
  const pay = (e: VocalEventSummary, studentId: string, cents: number, method: 'cash' | 'transfer') => act(() => cmd().recordVocalPayment({ eventId: e.id, studentId, date: today, amountCents: cents, method, note: '' }));
  return <>
    <section className="panel"><div className="section-heading"><div><h2>Vocalía</h2>
      <p className="caption">Cuotas de los padres por grupo y evento. Este dinero es de terceros: no entra a tu presupuesto y lo recibido por transferencia se descuenta de tu saldo disponible.</p></div>
      <button className="secondary" disabled={off} onClick={() => setEditing({ kind: 'group' })}>Nuevo grupo</button></div>
      {heldByAccount.map(h => <p className="alert" role="status" key={h.name}>En {h.name} hay {money(h.cents)} de cuotas recibidas por transferencia que no son tuyas.</p>)}
      {message && <p className="alert" role="status">{message}</p>}
      {editing?.kind === 'group' && groupForm()}
      {groups.some(g => g.value.archived) && <label className="check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /><span>Ver grupos archivados</span></label>}
      {visible.length > 0 && <div className="segmented" role="group" aria-label="Grupo">{visible.map(g => <button type="button" key={g.id} className={g.id === group?.id ? 'active' : ''} aria-pressed={g.id === group?.id} onClick={() => { setSelected(g.id); setEditing(null); setOpen(null); }}>{g.value.name}</button>)}</div>}
      {!visible.length && !editing && <p className="caption">Crea un grupo (por ejemplo «3° A», ciclo {defaultCycle(today)}) para empezar.</p>}</section>
    {group && <>
      <section className="panel"><div className="section-heading"><h2>{group.value.name}<small> · Ciclo {group.value.cycle}{group.value.archived && ' · Archivado'}</small></h2>
        <div className="row-actions"><button className="text-button" disabled={off} onClick={() => setEditing({ kind: 'group', id: group.id })}>Editar</button>
          <button className="text-button" disabled={off} onClick={() => act(() => cmd().saveVocalGroup({ ...group.value, archived: !group.value.archived }, group.id))}>{group.value.archived ? 'Reactivar' : 'Archivar'}</button></div></div>
        <details><summary>Alumnos ({group.students.filter(s => s.value.leftDate === null).length} activos de {group.students.length})</summary>
          {!group.value.archived && <form className="form-grid" onSubmit={e => { e.preventDefault(); const form = e.currentTarget, names = [...new Set(str(new FormData(form), 'names').split('\n').map(n => n.trim()).filter(Boolean))];
            act(() => { const changes = names.flatMap(name => cmd().saveVocalStudent({ groupId: group.id, name, joinedDate: today, leftDate: null })); form.reset(); return changes; }); }}>
            <label className="field"><span>Agregar alumnos (uno por línea)</span><textarea name="names" rows={3} required /></label>
            <div className="inline-actions"><button className="secondary" disabled={off}>Agregar</button></div></form>}
          {group.students.map(s => <div className="settings-row" key={s.id}><span>{s.value.name}<small>Alta {shortDate(s.value.joinedDate)}{s.value.leftDate && ` · Baja ${shortDate(s.value.leftDate)}`}</small></span>
            <div className="row-actions">{s.value.leftDate === null
              ? <button className="text-button" disabled={off} onClick={() => act(() => cmd().saveVocalStudent({ ...s.value, leftDate: today }, s.id))}>Dar de baja</button>
              : <button className="text-button" disabled={off} onClick={() => act(() => cmd().saveVocalStudent({ ...s.value, leftDate: null }, s.id))}>Reactivar</button>}</div></div>)}
          <p className="caption">Una baja no borra sus pagos. Un alumno dado de alta después de la fecha de un evento no debe cuota de ese evento, aunque puedes registrarle un pago.</p></details></section>
      <section className="panel"><div className="section-heading"><h2>Eventos</h2><button className="secondary" disabled={off || group.value.archived || !group.students.some(s => s.value.leftDate === null)} onClick={() => setEditing({ kind: 'event' })}>Nuevo evento</button></div>
        {editing?.kind === 'event' && eventForm(group)}
        {!group.events.length && !editing && <p className="caption">Aún no hay eventos en este grupo.</p>}
        {group.events.map(e => { const account = accounts.find(a => a.id === e.value.accountId), expanded = open === e.id, readOnly = e.value.settled || e.value.archived;
          return <article className="loan-card" key={e.id}><div className="section-heading"><h3>{e.value.name}<small> · {shortDate(e.value.date)}{e.value.settled && ' · Liquidado'}{e.overdue && !e.value.settled && ' · Con pendientes'}</small></h3>
            <div className="row-actions"><button className="text-button" disabled={off} onClick={() => setEditing({ kind: 'event', id: e.id })}>Editar</button>
              <button className="text-button" disabled={off} onClick={() => act(() => cmd().saveVocalEvent({ ...e.value, settled: !e.value.settled }, e.id))}>{e.value.settled ? 'Reabrir' : 'Marcar liquidado'}</button></div></div>
            <progress aria-label={'Avance de ' + e.value.name} value={Math.min(e.collectedCents, e.expectedCents)} max={Math.max(e.expectedCents, 1)} />
            <div className="focus-grid"><div><small>Recaudado</small><strong>{money(e.collectedCents)}</strong><small>meta {money(e.value.goalCents)}</small></div>
              <div><small>Falta por cobrar</small><strong className={e.pendingCents > 0 ? 'negative' : ''}>{money(e.pendingCents)}</strong><small>{e.paidCount} de {e.owedCount} alumnos pagaron</small></div>
              <div><small>Cuota por alumno</small><strong>{money(e.value.quotaCents)}</strong></div>
              <div><small>Efectivo en mano</small><strong>{money(e.cashCents)}</strong>{e.transferCents > 0 && <small>Transferencias {money(e.transferCents)}{account && ` en ${account.value.name}`}</small>}</div></div>
            {e.expectedCents < e.value.goalCents && <p className="caption">Con la cuota actual se cubre {money(e.expectedCents)} de la meta: faltan {money(e.value.goalCents - e.expectedCents)} (por altas, bajas o redondeo).</p>}
            <div className="inline-actions"><button className="secondary" onClick={() => setOpen(expanded ? null : e.id)}>{expanded ? 'Ocultar cobros' : 'Ver cobros'}</button>
              <button className="text-button" onClick={() => void copy(vocalPendingReport(group.value, e), 'Listado de pendientes')}>Copiar pendientes</button>
              <button className="text-button" onClick={() => void copy(vocalSummaryText(group.value, e), 'Resumen')}>Copiar resumen del grupo</button>
              <button className="text-button" onClick={() => csv(group, e)}>Exportar CSV</button></div>
            {expanded && <>{paymentForm(e)}<div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Estado</th><th className="numeric">Pagado</th><th>Acciones</th></tr></thead><tbody>
              {e.students.map(s => <tr key={s.id}><td data-label="Alumno">{s.name}</td>
                <td data-label="Estado">{!s.owed ? 'No aplica' : s.pendingCents === 0 ? 'Pagó' : s.paidCents > 0 ? `Abonó · debe ${money(s.pendingCents)}` : `Pendiente ${money(s.pendingCents)}`}{s.payments.map(x => <small key={x.id}>{shortDate(x.value.date)} · {methodLabel[x.value.method]}{x.value.note && ` · ${x.value.note}`}</small>)}</td>
                <td className="numeric" data-label="Pagado">{money(s.paidCents)}</td>
                <td data-label="Acciones"><div className="row-actions">{!readOnly && (s.owed && s.pendingCents > 0 && s.paidCents === 0
                  ? <><button className="text-button" disabled={off} onClick={() => pay(e, s.id, s.pendingCents, 'cash')}>Pagó en efectivo</button><button className="text-button" disabled={off} onClick={() => pay(e, s.id, s.pendingCents, 'transfer')}>Pagó por transferencia</button>
                    <button className="text-button" disabled={off} onClick={() => setEditing({ kind: 'payment', eventId: e.id, studentId: s.id })}>Otro importe</button></>
                  : s.payments.length ? s.payments.map(x => <span key={x.id}><button className="text-button" disabled={off} onClick={() => setEditing({ kind: 'payment', eventId: e.id, studentId: s.id, id: x.id })}>Editar pago</button>
                    <button className="text-button" disabled={off} onClick={() => act(() => cmd().voidExtension('vocalPayment', x.id))}>Anular</button></span>)
                  : <button className="text-button" disabled={off} onClick={() => setEditing({ kind: 'payment', eventId: e.id, studentId: s.id })}>Registrar pago</button>)}</div></td></tr>)}
            </tbody></table></div></>}</article>; })}</section></>}
  </>;
}
