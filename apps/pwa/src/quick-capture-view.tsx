import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { VaultSession } from '@paymentplan/application';
import type { Change } from '@paymentplan/domain';
import { live } from '@paymentplan/domain';
import { Dialog, parseMoney, str } from './ui.tsx';
import { interpretQuickCapture } from './quick-capture.ts';
import type { QuickKind, QuickProposal, QuickTarget } from './quick-capture.ts';
import { CaptureText } from './capture-text.tsx';
import type { CaptureDraft } from './capture-inbox.ts';

const kinds: { id: QuickKind; label: string; target: QuickTarget['kind'] }[] = [
  { id: 'cardExpense', label: 'Gasto con tarjeta', target: 'card' },
  { id: 'cardPayment', label: 'Pago o bonificación de tarjeta', target: 'card' },
  { id: 'accountExpense', label: 'Gasto de cuenta', target: 'account' },
  { id: 'accountIncome', label: 'Ingreso a cuenta', target: 'account' },
  { id: 'loanPayment', label: 'Abono a préstamo personal', target: 'loan' },
  { id: 'loanAdvance', label: 'Otro préstamo de una persona', target: 'loan' },
  { id: 'loanNew', label: 'Nuevo préstamo de una persona sin ficha', target: 'loan' },
];

export function QuickCapture({ session, today, close, save, draft }: {
  session: VaultSession; today: string; close: () => void; save: (changes: Change[]) => Promise<void>; draft?: CaptureDraft;
}) {
  const [text, setText] = useState(draft?.text ?? ''), [proposal, setProposal] = useState<QuickProposal | null>(null);
  const [kind, setKind] = useState<QuickKind | ''>('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [listening, setListening] = useState(false);
  const inFlight = useRef(false);
  const p = session.portfolio;
  const targets: QuickTarget[] = [
    ...live(p.cards).filter(c => !c.value.archived).map(c => ({ id: c.id, name: c.value.name, kind: 'card' as const })),
    ...live(p.cashAccounts).filter(a => !a.value.archived).map(a => ({ id: a.id, name: a.value.name, kind: 'account' as const })),
    ...live(p.loans).filter(l => l.value.loanType !== 'bank').map(l => ({ id: l.id, name: l.value.person, kind: 'loan' as const })),
  ];
  function interpret() {
    if (!text.trim()) { setError('Escribe o dicta un movimiento.'); return; }
    const result = interpretQuickCapture(text, draft?.date ?? today, targets);
    setError(''); setKind(result.kind); setProposal(result);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || listening) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const data = new FormData(event.currentTarget), selected = kinds.find(k => k.id === kind);
      if (!selected) throw Error('Selecciona el tipo de operación.');
      const targetId = str(data, 'target'), target = targets.find(t => t.id === targetId && t.kind === selected.target);
      if (kind !== 'loanNew' && !target) throw Error('Selecciona una tarjeta, cuenta o persona válida.');
      const date = str(data, 'date'), amount = parseMoney(data.get('amount')), description = str(data, 'description').trim();
      if (!date || !description || amount <= 0) throw Error('Revisa la fecha, la descripción y un importe mayor a cero.');
      const cmd = session.commands(today);
      let changes: Change[];
      if (kind === 'cardExpense' || kind === 'cardPayment') {
        const accountId = str(data, 'payAccount');
        changes = kind === 'cardPayment' && accountId ? cmd.payCardFromAccount(accountId, targetId, date, amount, description) :
          cmd.recordMovement({ cardId: targetId, date, amountCents: amount, kind: kind === 'cardPayment' ? 'payment' : 'expense', description, statementId: null, allocations: [] });
      } else if (kind === 'accountExpense' || kind === 'accountIncome') {
        changes = cmd.saveCashEntry({ accountId: targetId, toAccountId: null, cardMovementId: null, date, amountCents: amount,
          kind: kind === 'accountIncome' ? 'income' : 'expense', description, categoryId: null });
      } else if (kind === 'loanPayment') changes = cmd.loanPayment(targetId, date, amount, description);
      else if (kind === 'loanAdvance') changes = cmd.addLoanAdvance(targetId, date, amount, description, data.has('received'));
      else if (kind === 'loanNew') {
        const person = str(data, 'person').trim(), key = person.toLocaleLowerCase('es-MX');
        if (!person) throw Error('Escribe el nombre de la persona.');
        if (live(p.loans).some(l => l.value.loanType !== 'bank' && l.value.person.trim().toLocaleLowerCase('es-MX') === key))
          throw Error('Ya existe una ficha para esa persona. Elige «Otro préstamo de una persona».');
        changes = cmd.saveLoan({ person, description, principalCents: amount, balanceDate: date, dueDate: str(data, 'dueDate') || null,
          loanType: 'personal', includeReceivedMoney: data.has('received'), archived: false });
      }
      else throw Error('Selecciona el tipo de operación.');
      await save(changes); close();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el movimiento.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const selectedKind = kinds.find(k => k.id === kind);
  return <Dialog title="Registrar con texto o voz" close={() => { if (!busy) close(); }}>
    <p className="caption">Ejemplos: «Gasté 250 en supermercado con Santander», «Recibí 500 en Nómina» o «Juan me prestó 300». Usa el nombre exacto de la tarjeta, cuenta o persona; los importes deben escribirse con números.</p>
    {draft && <p className="form-note">Capturado el {draft.date}. «Hoy» y «ayer» se interpretan respecto de esa fecha.</p>}
    <CaptureText text={text} change={value => { setText(value); setProposal(null); }} disabled={busy} onListening={setListening} />
    <button type="button" className="secondary" disabled={busy || listening} onClick={interpret}>Interpretar</button>
    {proposal && <form onSubmit={e => void submit(e)}>
      <p className="form-note">Revisa y corrige todos los datos antes de guardar. La interpretación es local y no registra nada automáticamente.</p>
      <div className="form-grid">
        <label className="field"><span>Operación</span><select required value={kind} onChange={e => setKind(kinds.find(k => k.id === e.target.value)?.id ?? '')}><option value="">Selecciona el tipo</option>{kinds.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        {kind === 'loanNew' ? <label className="field"><span>Nombre de la persona</span><input name="person" required maxLength={300} /></label> :
          <label className="field"><span>Tarjeta, cuenta o persona</span><select key={kind} name="target" required defaultValue={selectedKind?.id === proposal.kind ? proposal.targetId : ''}><option value="">Selecciona</option>{targets.filter(t => t.kind === selectedKind?.target).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        <label className="field"><span>Importe MXN</span><input name="amount" inputMode="decimal" defaultValue={proposal.amount} required maxLength={18} /></label>
        <label className="field"><span>Fecha</span><input name="date" type="date" defaultValue={proposal.date} required /></label>
        <label className="field"><span>Descripción</span><input name="description" defaultValue={proposal.description} maxLength={300} required />{!proposal.description && <small>Escribe el concepto: no se encontró una descripción en la frase.</small>}</label>
        {kind === 'cardPayment' && <><label className="field"><span>Cuenta de origen (opcional)</span><select name="payAccount" defaultValue=""><option value="">Sin descontar de una cuenta</option>{targets.filter(t => t.kind === 'account').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><p className="form-note">Elige cuenta solo si realmente pagaste desde ella. Para una bonificación déjala sin seleccionar.</p></>}
        {kind === 'loanNew' && <label className="field"><span>Fecha de vencimiento (opcional)</span><input type="date" name="dueDate" /></label>}
        {(kind === 'loanAdvance' || kind === 'loanNew') && <label className="check"><input type="checkbox" name="received" /><span>También sumar este dinero recibido a mi presupuesto</span></label>}
        {(kind === 'loanPayment' || kind === 'loanAdvance' || kind === 'loanNew') && <p className="form-note">Esta operación modifica el préstamo, pero no registra un movimiento en tus cuentas.</p>}
      </div>
      <div className="dialog-actions"><button type="button" className="secondary" onClick={close} disabled={busy}>Cancelar</button><button className="primary" disabled={busy || listening}>{busy ? 'Guardando…' : 'Confirmar y guardar'}</button></div>
    </form>}
    {error && <p className="alert error" role="alert">{error}</p>}
  </Dialog>;
}
