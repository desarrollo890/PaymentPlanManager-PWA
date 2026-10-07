import { useState } from 'react';
import type { VaultSession } from '@paymentplan/application';
import type { Change } from '@paymentplan/domain';
import { installmentQuotas, sumCents } from '@paymentplan/domain';
import { FormDialog, MoneyField, parseMoney, money } from './ui.tsx';

export function PaymentAllocation({ id, session, today, close, save }: { id: string; session: VaultSession; today: string; close: () => void; save: (changes: Change[]) => Promise<void> }) {
  const movement = session.portfolio.movements.find(m => m.id === id)!, [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const plans = session.portfolio.installments.filter(p => p.value.cardId === movement.value.cardId && (!p.voided || movement.value.allocations.some(a => a.planId === p.id)));
  const rows = plans.flatMap(p => installmentQuotas(p.value).map(q => ({ plan: p, quota: q, old: movement.value.allocations.find(a => a.planId === p.id && a.quotaNumber === q.number) })));
  async function submit(data: FormData) {
    setBusy(true); setError(''); try {
      const allocations = rows.map((r, i) => ({ planId: r.plan.id, quotaNumber: r.quota.number,
        principalCents: parseMoney(data.get(`capital${i}`)), interestCents: parseMoney(data.get(`interest${i}`)) })).filter(a => a.principalCents || a.interestCents);
      if (sumCents(allocations.flatMap(a => [a.principalCents, a.interestCents])) > movement.value.amountCents) throw Error('El desglose supera el importe del pago.');
      await save(session.commands(today).assignPayment(id, allocations)); close();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  return <FormDialog title="Distribuir pago entre cuotas" close={close} submit={submit} busy={busy} error={error}>
    <p className="form-note">Pago de {money(movement.value.amountCents)}. El importe y saldo bancario se conservan. Puedes repartir capital e interés entre varias cuotas; el resto conserva la distribución estimada. Los intereses futuros solo se pueden atribuir cuando ya están incorporados a la deuda.</p>
    {!rows.length && <p className="wide">Esta tarjeta no tiene cuotas para atribuir.</p>}
    {rows.map((r, i) => <div key={r.plan.id + ':' + r.quota.number} className="wide allocation-row"><strong>{r.plan.value.description} · cuota {r.quota.number}{r.plan.voided ? ' · plan cancelado' : ''}</strong><small>{r.quota.cutDate} · capital {money(r.quota.principalCents)} · interés {money(r.quota.interestCents)}</small><div className="form-grid"><MoneyField label="Capital atribuido" name={`capital${i}`} value={r.old?.principalCents ?? 0} /><MoneyField label="Interés atribuido" name={`interest${i}`} value={r.old?.interestCents ?? 0} /></div></div>)}
  </FormDialog>;
}
