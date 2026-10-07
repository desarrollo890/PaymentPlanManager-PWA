import { FinancialCommands } from '@paymentplan/application';
import { useState } from 'react';
import type { VaultSession } from '@paymentplan/application';
import type { Change } from '@paymentplan/domain';
import { safeInteger, applyChanges, cutOnOrAfter, financeView, installmentQuotas, latestBalance, live } from '@paymentplan/domain';
import type { CutView } from '@paymentplan/domain';
import type { Installment } from '@paymentplan/contracts';
import { PaymentAllocation } from './payment-allocation.tsx';
import { Check, Field, FormDialog, MoneyField, SelectField, amount, money, optionalMoney, parseMoney, str } from './ui.tsx';

export type FinancialModal = { type: 'card'; id?: string } | { type: 'movement'; id?: string; cardId?: string; planId?: string; quotaNumber?: number; capitalCents?: number; interestCents?: number } | { type: 'plan'; id?: string; cardId: string; purchaseId?: string }
  | { type: 'loan'; id?: string } | { type: 'loanPayment'; loanId: string } | { type: 'reconcile'; cardId: string }
  | { type: 'allocation'; id: string } | { type: 'cut'; cardId: string; cut: CutView; create?: boolean } | { type: 'reserve'; cardId: string; cut: CutView } | { type: 'budget'; payday: string };
export function FinancialForm(props: FinancialFormProps) { return props.modal.type === 'allocation' ? <PaymentAllocation id={props.modal.id} session={props.session} today={props.today} close={props.close} save={props.save} /> : <FinancialEditor {...props} modal={props.modal} />; }
type FinancialFormProps = { modal: FinancialModal; session: VaultSession; today: string; close: () => void; save: (changes: Change[]) => Promise<void> };
function FinancialEditor({ modal, session, today, close, save }: {
  modal: Exclude<FinancialModal, { type: 'allocation' }>; session: VaultSession; today: string; close: () => void; save: (changes: Change[]) => Promise<void>;
}) {
  const p = session.portfolio, cmd = session.commands(today), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [kind, setKind] = useState(modal.type === 'movement' ? p.movements.find(m => m.id === modal.id)?.value.kind ?? (modal.planId ? 'payment' : 'expense') : 'expense');
  const oldMovement = modal.type === 'movement' ? p.movements.find(m => m.id === modal.id)?.value : null;
  const [selectedPlan, setSelectedPlan] = useState(oldMovement && oldMovement.allocations.length > 1 ? 'preserve' : oldMovement?.allocations[0]?.planId ?? (modal.type === 'movement' ? modal.planId : '') ?? '');
  const [selectedStatement, setSelectedStatement] = useState(oldMovement?.statementId ?? '');
  const [selectedCard, setSelectedCard] = useState(oldMovement?.cardId ?? (modal.type === 'movement' ? modal.cardId : undefined) ?? live(p.cards).find(c => !c.value.archived)?.id ?? '');
  const view = financeView(p, today);
  const [planSource, setPlanSource] = useState(modal.type === 'plan' && modal.purchaseId ? 'existing' : 'debt');
  const [amortization, setAmortization] = useState(modal.type === 'plan' ? p.installments.find(r => r.id === modal.id)?.value.amortization?.method ?? 'total' : 'total');
  const [planPreview, setPlanPreview] = useState<ReturnType<typeof installmentQuotas> | null>(null);
  const [balanceWarning, setBalanceWarning] = useState('');
  function checkBalance(data: FormData) {
    if (modal.type !== 'reconcile' && !(modal.type === 'card' && !modal.id)) return;
    try { const debt = parseMoney(data.get('debt')), credit = parseMoney(data.get('credit')), available = parseMoney(data.get('available'));
      const limit = modal.type === 'card' ? parseMoney(data.get('limit')) : p.cards.find(c => c.id === modal.cardId)!.value.limitCents;
      const difference = available + debt - credit - limit;
      setBalanceWarning(debt && credit ? 'Captura deuda o saldo a favor, no ambos.' : Math.abs(difference) > 1 ? `Los saldos difieren del límite por ${money(Math.abs(difference))}. Puedes guardarlos para revisar el cuadre con tu banco.` : debt > limit ? 'La deuda supera el límite de esta tarjeta.' : '');
    } catch { setBalanceWarning(''); }
  }
  async function submit(data: FormData, previewOnly = false) {
    setBusy(true); setError('');
    try {
      let changes: Change[];
      switch (modal.type) {
        case 'card': {
          const previous = p.cards.find(c => c.id === modal.id);
          const credit = previous ? 0 : parseMoney(data.get('credit'));
          const debt = previous ? 0 : parseMoney(data.get('debt'));
          if (credit && debt) throw Error('Captura deuda o saldo a favor, no ambos.');
          changes = cmd.saveCard({ name: str(data, 'name'), bank: str(data, 'bank'), limitCents: parseMoney(data.get('limit')), cutDay: Number(str(data, 'cutDay')),
            dueDay: Number(str(data, 'dueDay')), dueMonthOffset: str(data, 'dueOffset') === 'auto' ? null : Number(str(data, 'dueOffset')),
            color: str(data, 'color'), initialDebtOrigin: str(data, 'origin') as 'currentPeriod' | 'previousStatement' | 'unknown', archived: previous?.value.archived ?? false },
          previous ? undefined : { date: str(data, 'date'), availableCents: parseMoney(data.get('available')), debtCents: debt - credit }, modal.id); break;
        }
        case 'movement': {
          const planId = str(data, 'planId');
          changes = cmd.recordMovement({ cardId: str(data, 'cardId'), date: str(data, 'date'), amountCents: parseMoney(data.get('amount')), kind,
            description: str(data, 'description'), statementId: kind === 'payment' ? selectedStatement || null : null, allocations: kind === 'payment' && planId === 'preserve' ? oldMovement?.allocations ?? [] : kind === 'payment' && planId ? [{ planId, quotaNumber: Number(str(data, 'quota')),
              principalCents: parseMoney(data.get('capitalPaid')), interestCents: parseMoney(data.get('interestPaid')) }] : [] }, modal.id); break;
        }
        case 'plan': {
          const previous = p.installments.find(r => r.id === modal.id)?.value;
          let table = null;
          if (amortization === 'bankTable') table = str(data, 'table').trim().split(/\r?\n/).map(line => {
            const cells = line.split(';'); if (cells.length !== 2) throw Error('Usa una fila por cuota: capital;interés.');
            return { principalCents: parseMoney(cells[0]!), interestCents: parseMoney(cells[1]!) };
          });
          const input: Omit<Installment, 'recordedAt' | 'legacyOrdinal' | 'interestIncorporatedThrough'> = {
            cardId: modal.cardId, description: str(data, 'description'), principalCents: parseMoney(data.get('capital')), months: Number(str(data, 'months')),
            interestCents: amortization === 'bankPayment' ? safeInteger(BigInt(parseMoney(data.get('bankPayment'))) * BigInt(str(data, 'months')) - BigInt(parseMoney(data.get('capital')))) : parseMoney(data.get('interest')), startDate: previous?.startDate ?? (planSource === 'purchase' ? str(data, 'purchaseDate') : today),
            firstCutDate: str(data, 'firstCut'), cutDay: previous?.cutDay ?? p.cards.find(c => c.id === modal.cardId)!.value.cutDay,
            purchaseId: previous?.purchaseId ?? (planSource === 'existing' ? str(data, 'purchaseId') || null : null),
            interestIncludedInDebt: data.has('interestIncluded'), amortization: amortization === 'total' || amortization === 'bankPayment' ? null : {
              method: amortization as 'fixedPayment' | 'fixedPrincipal' | 'bankTable', monthlyRate: str(data, 'monthlyRate') || '0', interestTaxRate: str(data, 'taxRate') || '0', table },
          };
          changes = cmd.savePlan(input, modal.id, planSource === 'purchase' && !modal.id); break;
        }
        case 'loan': {
          const previous = p.loans.find(l => l.id === modal.id);
          changes = cmd.saveLoan({ person: str(data, 'person'), description: str(data, 'description'), principalCents: parseMoney(data.get('capital')), balanceDate: str(data, 'date'),
            dueDate: str(data, 'dueDate') || null, includeReceivedMoney: data.has('received'), archived: previous?.value.archived ?? false }, modal.id); break;
        }
        case 'loanPayment': changes = cmd.loanPayment(modal.loanId, str(data, 'date'), parseMoney(data.get('amount')), str(data, 'description')); break;
        case 'reconcile': {
          const debt = parseMoney(data.get('debt')), credit = parseMoney(data.get('credit'));
          if (debt && credit) throw Error('Captura deuda o saldo a favor, no ambos.');
          changes = cmd.reconcile(modal.cardId, { date: str(data, 'date'), debtCents: debt - credit, availableCents: parseMoney(data.get('available')) }); break;
        }
        case 'cut': changes = cmd.saveStatement(modal.cardId, { cutDate: str(data, 'date'), dueDate: str(data, 'dueDate'), targetCents: parseMoney(data.get('target')),
          minimumCents: parseMoney(data.get('minimum')), initialPaidCents: parseMoney(data.get('paid')) }, !modal.create && modal.cut.estimated && parseMoney(data.get('target')) === modal.cut.targetCents, modal.create ? undefined : modal.cut.id); break;
        case 'reserve': changes = cmd.reserve(modal.cardId, modal.cut.cutDate, parseMoney(data.get('reserved'))); break;
        case 'budget': changes = cmd.saveBudget({ payday: modal.payday, expectedIncomeCents: parseMoney(data.get('income')), receivedIncomeCents: optionalMoney(data, 'receivedIncome'),
          expensesCents: parseMoney(data.get('expenses')), reserveCents: parseMoney(data.get('reserve')), note: str(data, 'note') }); break;
      }
      if (modal.type === 'movement' && kind !== 'payment') {
        const movement = changes.find(c => c.entityType === 'movement')!;
        const updated = new FinancialCommands(applyChanges(p, changes), cmd.context);
        changes.push(...await updated.setCategory(movement.entityId, str(data, 'categoryId') || null));
      }
      if (previewOnly) { const candidate = applyChanges(p, changes), changed = changes.find(c => c.entityType === 'installment')!; setPlanPreview(installmentQuotas(candidate.installments.find(r => r.id === changed.entityId)!.value)); } else { await save(changes); close(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  let title = '', fields;
  if (modal.type === 'card') {
    const card = p.cards.find(c => c.id === modal.id)?.value;
    title = card ? 'Editar tarjeta' : 'Registrar tarjeta';
    fields = <><Field label="Nombre de la tarjeta" name="name" value={card?.name} /><Field label="Banco" name="bank" value={card?.bank} />
      <MoneyField label="Límite de crédito" name="limit" value={card?.limitCents ?? null} /><Field label="Color de tu tarjeta" name="color" type="color" value={card?.color ?? '#0067D8'} />
      <Field label="Día de corte" name="cutDay" type="number" value={card?.cutDay ?? 11} min={1} max={31} /><Field label="Día límite de pago" name="dueDay" type="number" value={card?.dueDay ?? 25} min={1} max={31} />
      <SelectField label="Mes del vencimiento" name="dueOffset" value={card?.dueMonthOffset == null ? 'auto' : String(card.dueMonthOffset)}><option value="auto">Automático, después del corte</option><option value="0">Mismo mes del corte</option><option value="1">Mes siguiente al corte (ej. Plata)</option><option value="2">Dos meses después del corte</option></SelectField>
      <SelectField label="Origen de la deuda inicial" name="origin" value={card?.initialDebtOrigin ?? 'currentPeriod'}><option value="currentPeriod">Al periodo en curso / próximo corte</option><option value="previousStatement">Incluye deuda de un corte anterior</option><option value="unknown">No estoy seguro</option></SelectField>
      {!card && <><Field label="Fecha de los saldos iniciales" name="date" type="date" value={today} max={today} /><MoneyField label="Disponible inicial" name="available" value={null} />
        <MoneyField label="Deuda total inicial" name="debt" /><MoneyField label="Saldo a favor inicial" name="credit" hint="Solo si no tienes deuda. No se resta de otras tarjetas." /></>}
      <p className="form-note">La deuda total incluye el capital a meses. Registra después sus planes mediante «Dividir deuda». Disponible + deuda − saldo a favor debería coincidir con el límite; las diferencias generan alertas para revisar con tu banco.</p></>;
  } else if (modal.type === 'movement') {
    const m = p.movements.find(m => m.id === modal.id)?.value;
    title = m ? 'Editar movimiento' : 'Registrar movimiento';
    fields = <><label className="field"><span>Tarjeta</span><select name="cardId" value={selectedCard} onChange={e => { setSelectedCard(e.target.value); setSelectedPlan(''); setSelectedStatement(''); }}>{live(p.cards).filter(c => !c.value.archived).map(c => <option key={c.id} value={c.id}>{c.value.name}</option>)}</select></label>
      <label className="field"><span>Tipo de movimiento</span><select name="kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="expense">Gasto / compra</option><option value="payment">Pago</option><option value="interest">Interés</option><option value="fee">Comisión</option></select></label>
      <Field label="Fecha del movimiento" name="date" type="date" value={m?.date ?? today} /><MoneyField label="Importe" name="amount" value={m?.amountCents ?? (modal.planId ? (modal.capitalCents ?? 0) + (modal.interestCents ?? 0) : null)} /><Field label="Descripción" name="description" value={m?.description ?? (modal.planId ? 'Pago de cuota' : undefined)} />{kind !== 'payment' && <SelectField label="Categoría" name="categoryId" value={p.classifications.find(c => !c.voided && c.value.movementId === modal.id)?.value.categoryId ?? ''}><option value="">Sin categoría</option>{live(p.categories).filter(c => !c.value.archived || c.id === p.classifications.find(r => !r.voided && r.value.movementId === modal.id)?.value.categoryId).map(c => <option key={c.id} value={c.id}>{c.value.name}</option>)}</SelectField>}
      {kind === 'payment' && <><label className="field"><span>Corte al que aplicas el pago</span><select name="statementId" value={selectedStatement} onChange={e => setSelectedStatement(e.target.value)}><option value="">Automático, corte vigente</option>{live(p.statements).filter(s => s.value.cardId === selectedCard).toSorted((a, b) => b.value.cutDate.localeCompare(a.value.cutDate)).map(s => <option key={s.id} value={s.id}>{s.value.cutDate} · {s.value.estimated ? 'Estimado' : 'Confirmado'}</option>)}</select></label><label className="field"><span>Atribución a un plan (opcional)</span><select name="planId" value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}><option value="">Distribución estimada automática</option>{oldMovement && oldMovement.allocations.length > 1 && <option value="preserve">Conservar las atribuciones de este pago</option>}{live(p.installments).filter(r => r.value.cardId === selectedCard).map(plan => <option key={plan.id} value={plan.id}>{plan.value.description}</option>)}</select></label>
        {selectedPlan && selectedPlan !== 'preserve' && <><SelectField label="Número de cuota" name="quota" value={String(oldMovement?.allocations[0]?.quotaNumber ?? modal.quotaNumber ?? 1)}>{installmentQuotas(p.installments.find(r => r.id === selectedPlan)!.value).map(q => <option key={q.number} value={q.number}>{q.number} · {q.cutDate} · {money(q.principalCents + q.interestCents)}</option>)}</SelectField><MoneyField label="Capital de la cuota que cubres" name="capitalPaid" value={oldMovement?.allocations[0]?.principalCents ?? modal.capitalCents ?? 0} /><MoneyField label="Interés de la cuota que cubres" name="interestPaid" value={oldMovement?.allocations[0]?.interestCents ?? modal.interestCents ?? 0} /></>}</>}
      <p className="form-note">Una fecha futura crea un movimiento programado. No reduce tu deuda hasta que lo marques realizado. Las atribuciones explícitas permiten registrar anticipos a cuotas futuras.</p></>;
  } else if (modal.type === 'plan') {
    const plan = p.installments.find(r => r.id === modal.id)?.value, card = p.cards.find(c => c.id === modal.cardId)!.value;
    const balance = view.cards.find(c => c.id === modal.cardId)!, planView = balance.plans.find(r => r.id === modal.id);
    title = plan ? 'Editar plan a meses' : 'Registrar plan a meses';
    fields = <>{planView?.editReason && <p className="form-note">{planView.editReason}</p>}
      {!plan && <label className="field"><span>Qué quieres financiar</span><select name="source" value={planSource} onChange={e => setPlanSource(e.target.value)}><option value="debt">Dividir deuda ya registrada</option><option value="purchase">Nueva compra a meses</option><option value="existing">Compra registrada que el banco dividió</option></select></label>}
      <Field label="Descripción del plan" name="description" value={plan?.description ?? p.movements.find(m => m.id === modal.purchaseId)?.value.description} /><MoneyField key={planSource} label="Capital a meses" name="capital" value={plan?.principalCents ?? (modal.purchaseId ? Math.min(balance.freeDebtCents, p.movements.find(m => m.id === modal.purchaseId)!.value.amountCents) : planSource === 'purchase' ? null : balance.freeDebtCents)} hint={`Deuda libre vigente: ${money(balance.freeDebtCents)}`} />
      <Field label="Meses restantes" name="months" type="number" value={plan?.months ?? 3} min={2} max={120} /><Field label="Primer corte de las cuotas restantes" name="firstCut" type="date" value={plan?.firstCutDate ?? cutOnOrAfter(card.cutDay, today)} />
      {planSource === 'purchase' && !plan && <Field label="Fecha de la compra" name="purchaseDate" type="date" value={today} max={today} />}
      {planSource === 'existing' && !plan && <SelectField label="Compra registrada" name="purchaseId" value={modal.purchaseId}>{live(p.movements).filter(m => m.value.cardId === modal.cardId && m.value.kind === 'expense' && !m.value.scheduled).map(m => <option key={m.id} value={m.id}>{m.value.description} · {money(m.value.amountCents)}</option>)}</SelectField>}
      <label className="field"><span>Cálculo del interés</span><select value={amortization} onChange={e => setAmortization(e.target.value)}><option value="total">MSI / interés total informado</option><option value="bankPayment">Mensualidad fija informada por el banco</option><option value="fixedPayment">MCI · cuota fija</option><option value="fixedPrincipal">MCI · capital fijo</option><option value="bankTable">MCI · tabla del banco</option></select></label>
      <MoneyField label="Interés total informado" name="interest" value={plan?.interestCents ?? 0} hint={amortization === 'total' ? '0 para meses sin intereses.' : 'Se calcula desde la tasa o tabla; este campo se sustituirá por el total calculado.'} />
      {amortization === 'bankPayment' && <MoneyField label="Mensualidad total del banco" name="bankPayment" value={null} hint="Incluye los cargos de financiación que quieres distribuir. El costo total será mensualidad × meses − capital." />}
      {amortization !== 'total' && amortization !== 'bankPayment' && <><Field label="Tasa mensual (%)" name="monthlyRate" value={plan?.amortization?.monthlyRate ?? '0'} /><Field label="IVA del interés (%)" name="taxRate" value={plan?.amortization?.interestTaxRate ?? '0'} hint="Usa el impuesto reportado por el banco; no se aplica por defecto." /></>}
      {amortization === 'bankTable' && <label className="field wide"><span>Tabla bancaria: capital;interés por cuota (MXN)</span><textarea name="table" rows={6} required defaultValue={plan?.amortization?.table?.map(q => `${amount(q.principalCents)};${amount(q.interestCents)}`).join('\n')} /></label>}
      <button type="button" className="secondary wide" disabled={busy} onClick={e => void submit(new FormData(e.currentTarget.form!), true)}>Previsualizar amortización</button>{planPreview && <div className="wide table-wrap"><p className="caption">Vista previa. Si modificas campos, vuelve a calcularla antes de guardar.</p><table><thead><tr><th>Cuota</th><th>Corte</th><th>Capital</th><th>Interés</th><th>Total</th></tr></thead><tbody>{planPreview.map(q => <tr key={q.number}><td>{q.number}</td><td>{q.cutDate}</td><td>{money(q.principalCents)}</td><td>{money(q.interestCents)}</td><td>{money(q.principalCents + q.interestCents)}</td></tr>)}</tbody></table></div>}
      <Check name="interestIncluded" label="El interés de estas cuotas ya forma parte de la deuda registrada" checked={plan?.interestIncludedInDebt} />
      <p className="form-note">Dividir deuda reclasifica lo que ya debes. Una nueva compra registra también un gasto, una sola vez. Para deuda inicial a meses, captura únicamente el capital y las cuotas restantes.</p></>;
  } else if (modal.type === 'loan') {
    const loan = p.loans.find(l => l.id === modal.id)?.value;
    title = loan ? 'Editar préstamo' : 'Registrar préstamo recibido';
    fields = <><Field label="Persona que te prestó" name="person" value={loan?.person} /><Field label="Concepto" name="description" value={loan?.description} />
      <MoneyField label="Capital inicial pendiente" name="capital" value={loan?.principalCents ?? null} /><Field label="Fecha del saldo / dinero recibido" name="date" type="date" value={loan?.balanceDate ?? today} max={today} />
      <Field label="Fecha acordada de pago (opcional)" name="dueDate" type="date" value={loan?.dueDate ?? ''} required={false} /><Check name="received" label="También sumar este dinero recibido a mi presupuesto" checked={loan?.includeReceivedMoney} />
      <p className="form-note">Pago único o abonos sin intereses. Deja desmarcada la opción de dinero recibido si estás capturando una deuda anterior.</p></>;
  } else if (modal.type === 'loanPayment') {
    title = 'Registrar abono a persona'; const loan = view.loans.find(l => l.id === modal.loanId)!;
    fields = <><p className="form-note">{loan.person} · saldo pendiente {money(loan.balanceCents)} · programado {money(loan.scheduledCents)}</p><Field label="Fecha del abono" name="date" type="date" value={today} />
      <MoneyField label="Importe del abono" name="amount" value={loan.balanceCents - loan.scheduledCents} /><Field label="Descripción" name="description" /><p className="form-note">Los abonos futuros se programan y requieren confirmación cuando pagues.</p></>;
  } else if (modal.type === 'reconcile') {
    const balance = view.cards.find(c => c.id === modal.cardId)!;
    title = 'Conciliar saldos con el banco'; fields = <><Field label="Fecha del saldo bancario" name="date" type="date" value={today} min={latestBalance(p, modal.cardId).value.date} max={today} />
      <MoneyField label="Disponible reportado por el banco" name="available" value={balance.availableCents} /><MoneyField label="Deuda reportada por el banco" name="debt" value={Math.max(0, balance.debtCents)} /><MoneyField label="Saldo a favor" name="credit" value={Math.max(0, -balance.debtCents)} />
      <p className="form-note">Los movimientos realizados hasta esta fecha quedarán incorporados al saldo bancario. Se conserva el historial y no se vuelven a sumar. Esta acción es distinta de confirmar el importe del corte.</p></>;
  } else if (modal.type === 'reserve') {
    title = 'Dinero apartado para el corte'; fields = <><MoneyField label="Importe apartado" name="reserved" value={modal.cut.reservedCents} /><p className="form-note">Es dinero que tienes listo para pagar esta tarjeta. Apartarlo no registra un pago ni reduce tu deuda. Pendiente del corte: {money(modal.cut.pendingCents)}.</p></>;
  } else if (modal.type === 'cut') {
    const c = modal.cut, stored = p.statements.find(s => s.id === c.id)?.value;
    title = modal.create ? 'Registrar otro corte' : 'Revisar y confirmar corte'; fields = <><p className="form-note">Estimado del sistema: {money(c.targetCents)}. Confirma únicamente cuando lo hayas comparado con tu banco; puedes editarlo.</p>
      <Field label="Fecha del corte" name="date" type="date" value={c.cutDate} max={today} /><Field label="Fecha límite de pago" name="dueDate" type="date" value={c.dueDate} />
      <MoneyField label="Pago para no generar intereses" name="target" value={c.targetCents} /><MoneyField label="Pago mínimo reportado" name="minimum" value={stored?.minimumCents ?? 0} />
      <MoneyField label="Pagado antes de registrarlo aquí" name="paid" value={stored?.initialPaidCents ?? 0} /></>;
  } else {
    const saved = p.budgets.find(b => b.value.payday === modal.payday)?.value, b = view.budgets.find(b => b.payday === modal.payday)!;
    title = `Presupuesto · ${modal.payday}`; fields = <><MoneyField label="Ingreso esperado" name="income" value={saved?.expectedIncomeCents ?? b.incomeCents} />
      <MoneyField label="Ingreso recibido (opcional)" name="receivedIncome" value={saved?.receivedIncomeCents ?? null} required={false} /><MoneyField label="Gastos esenciales" name="expenses" value={b.expensesCents} />
      <MoneyField label="Reserva" name="reserve" value={b.reserveCents} hint="Dinero que conservas para imprevistos y no asignas a pagos." /><Field label="Nota (opcional)" name="note" value={saved?.note} required={false} /></>;
  }
  return <FormDialog title={title} close={close} submit={submit} busy={busy} error={error} onInput={checkBalance}>{fields}{balanceWarning && <p className="alert wide" role="status">{balanceWarning}</p>}</FormDialog>;
}
