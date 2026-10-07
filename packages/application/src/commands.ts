import { canonical } from '@paymentplan/contracts';
import type { Category, CategoryRule, CategoryBudget, CashAccount, CashEntry, SavingsGoal, SavingsEntry, Recurrence, EntityPayloads, Balance, Budget, Card, Income, Installment, Loan, Movement, ReminderPreferences, ReminderState, Statement } from '@paymentplan/contracts';
import { activePlans, applyChanges, assertPortfolio, cutOnOrAfter, estimateStatement, freeDebt, installmentQuotas, latestBalance,
  live, addMonths, recurrenceDates, goalSaved, periodReport, planEditReason, statementsFor, sumCents } from '@paymentplan/domain';
import type { FinancialEntityType, Change, FinancialRecord, Portfolio } from '@paymentplan/domain';
import { sha256 } from '@paymentplan/crypto';

export interface CommandContext { readonly today: string; readonly now: string; readonly newId: () => string }
function record<T>(records: readonly FinancialRecord<T>[], id: string): FinancialRecord<T> {
  const row = records.find(r => r.id === id); if (!row) throw Error('Registro no encontrado.'); return row;
}
export class FinancialCommands {
  readonly portfolio: Portfolio; readonly context: CommandContext;
  constructor(portfolio: Portfolio, context: CommandContext) { this.portfolio = portfolio; this.context = context; }
  private stamp() { return { recordedAt: this.context.now, legacyOrdinal: null }; }
  private checked(changes: Change[]): Change[] { assertPortfolio(applyChanges(this.portfolio, changes), this.context.today); return changes; }
  private editableDate(cardId: string, date: string): void {
    if (live(this.portfolio.closures).some(c => c.value.cardId === cardId && c.value.from <= date && c.value.to >= date)) throw Error('Reabre el periodo cerrado antes de modificar sus movimientos.');
  }
  saveCard(value: Card, base?: Pick<Balance, 'date' | 'availableCents' | 'debtCents'>, id?: string): Change[] {
    const entityId = id ?? this.context.newId();
    const changes: Change[] = [{ entityType: 'card', entityId, payload: { ...value, name: value.name.trim(), bank: value.bank.trim(), color: value.color.toUpperCase() }, voided: false }];
    if (!id) {
      if (!base || base.date > this.context.today || base.availableCents < 0) throw Error('Indica saldos iniciales y una fecha de hoy o anterior.');
      changes.push({ entityType: 'balance', entityId: this.context.newId(), payload: { ...base, cardId: entityId, includedMovementIds: [], interestIncluded: false, ...this.stamp() }, voided: false });
    } else record(this.portfolio.cards, id);
    return this.checked(changes);
  }
  recordMovement(input: Omit<Movement, 'recordedAt' | 'legacyOrdinal' | 'scheduled' | 'reconciled' | 'importReference'>, id?: string): Change[] {
    const base = latestBalance(this.portfolio, input.cardId);
    if (input.date < base.value.date) throw Error('Registra movimientos desde la fecha del último saldo bancario.');
    this.editableDate(input.cardId, input.date);
    const previous = id ? record(this.portfolio.movements, id) : null;
    if (previous) {
      this.editableDate(input.cardId, previous.value.date);
      if (previous.value.reconciled || this.portfolio.balances.some(b => b.value.includedMovementIds.includes(previous.id))) throw Error('El movimiento ya está incorporado a una conciliación bancaria.');
      if (activePlans(this.portfolio, input.cardId).some(p => p.value.purchaseId === id)) throw Error('Deshaz el plan antes de modificar su compra.');
    }
    const changes: Change[] = [];
    let statementId = input.statementId;
    if (input.kind === 'payment') {
      const card = record(this.portfolio.cards, input.cardId), cuts = statementsFor(this.portfolio, card, this.context.today);
      const cut = statementId ? cuts.find(s => s.id === statementId) : cuts.find(s => s.value.cutDate <= this.context.today) ?? cuts[0];
      if (statementId && (!cut || input.date < cut.value.cutDate)) throw Error('El pago aplicado no puede ser anterior al corte.');
      if (cut && input.date >= cut.value.cutDate) {
        statementId = cut.id.startsWith('estimate:') ? this.context.newId() : cut.id;
        if (!this.portfolio.statements.some(s => s.id === statementId)) changes.push({ entityType: 'statement', entityId: statementId, payload: cut.value, voided: false });
      }
    }
    if (id && input.kind === 'payment') for (const classification of live(this.portfolio.classifications).filter(c => c.value.movementId === id))
      changes.push({ entityType: 'classification', entityId: classification.id, payload: classification.value, voided: true });
    changes.push({ entityType: 'movement', entityId: id ?? this.context.newId(), payload: { ...input, description: input.description.trim(), statementId,
      scheduled: input.date > this.context.today, reconciled: false, importReference: previous?.value.importReference ?? null,
      ...(previous ? { recordedAt: previous.value.recordedAt, legacyOrdinal: previous.value.legacyOrdinal } : this.stamp()) }, voided: false });
    return this.checked(changes);
  }
  changeMovement(id: string, action: 'void' | 'restore' | 'realize'): Change[] {
    const movement = record(this.portfolio.movements, id), m = movement.value;
    this.editableDate(m.cardId, m.date);
    if (m.reconciled || this.portfolio.balances.some(b => b.value.includedMovementIds.includes(id))) throw Error('Un movimiento conciliado conserva su historial.');
    if (activePlans(this.portfolio, m.cardId).some(p => p.value.purchaseId === id)) throw Error('Deshaz el plan antes de modificar su compra.');
    if (action === 'realize' && (movement.voided || (!m.scheduled && m.date <= this.context.today))) throw Error('El movimiento ya está realizado o está anulado.');
    if (action === 'realize') this.editableDate(m.cardId, this.context.today);
    return this.checked([{ entityType: 'movement', entityId: id, payload: action === 'realize' ? { ...m, scheduled: false, date: this.context.today } : m, voided: action === 'void' }]);
  }
  assignPayment(id: string, allocations: Movement['allocations']): Change[] {
    const row = record(this.portfolio.movements, id);
    if (row.voided || row.value.kind !== 'payment') throw Error('Selecciona un pago vigente.');
    this.editableDate(row.value.cardId, row.value.date);
    return this.checked([{ entityType: 'movement', entityId: id, payload: { ...row.value, allocations }, voided: false }]);
  }
  deleteCard(id: string): Change[] {
    const card = record(this.portfolio.cards, id);
    if (card.voided) throw Error('La tarjeta ya está eliminada.');
    const changes: Change[] = [{ entityType: 'card', entityId: id, payload: card.value, voided: true }];
    const movementIds = new Set(this.portfolio.movements.filter(m => m.value.cardId === id).map(m => m.id));
    if (live(this.portfolio.cashEntries).some(e => e.value.cardMovementId !== null && movementIds.has(e.value.cardMovementId))) throw Error('La tarjeta tiene pagos vinculados a cuentas. Conserva su historial archivándola al liquidarla.');
    for (const row of live(this.portfolio.recurrences).filter(r => r.value.cardId === id)) changes.push({ entityType: 'recurrence', entityId: row.id, payload: row.value, voided: true });
    for (const row of live(this.portfolio.occurrences).filter(r => movementIds.has(r.value.movementId))) changes.push({ entityType: 'occurrence', entityId: row.id, payload: row.value, voided: true });
    for (const row of live(this.portfolio.classifications).filter(r => movementIds.has(r.value.movementId))) changes.push({ entityType: 'classification', entityId: row.id, payload: row.value, voided: true });
    for (const row of live(this.portfolio.categoryRules).filter(r => r.value.cardId === id)) changes.push({ entityType: 'categoryRule', entityId: row.id, payload: row.value, voided: true });
    const collections = [['balance', this.portfolio.balances], ['movement', this.portfolio.movements], ['installment', this.portfolio.installments],
      ['statement', this.portfolio.statements], ['closure', this.portfolio.closures]] as const;
    for (const [entityType, rows] of collections) for (const row of live(rows as readonly FinancialRecord<{ cardId: string }> []))
      if (row.value.cardId === id) changes.push({ entityType, entityId: row.id, payload: row.value, voided: true } as Change);
    return this.checked(changes);
  }
  deleteLoan(id: string): Change[] {
    const loan = record(this.portfolio.loans, id);
    if (loan.voided || this.portfolio.loanPayments.some(a => a.value.loanId === id)) throw Error('Solo puedes eliminar un préstamo sin historial de abonos.');
    return this.checked([{ entityType: 'loan', entityId: id, payload: loan.value, voided: true }]);
  }
  savePlan(input: Omit<Installment, 'recordedAt' | 'legacyOrdinal' | 'interestIncorporatedThrough'>, id?: string, newPurchase = false): Change[] {
    const card = record(this.portfolio.cards, input.cardId), previous = id ? record(this.portfolio.installments, id) : null;
    const inputPlan: Installment = { ...input, description: input.description.trim(), interestIncorporatedThrough: previous?.value.interestIncorporatedThrough ?? null,
      ...(previous ? { recordedAt: previous.value.recordedAt, legacyOrdinal: previous.value.legacyOrdinal } : this.stamp()) };
    if (inputPlan.amortization) {
      // Generate the amortization total before validating the stored plan.
      const { amortize } = domainAmortization;
      (inputPlan as { interestCents: number }).interestCents = sumCents(amortize(inputPlan.principalCents, inputPlan.months, inputPlan.amortization).map(q => q.interestCents));
    }
    installmentQuotas(inputPlan);
    const changes: Change[] = [];
    const financialChanged = !previous || canonical({ ...inputPlan, description: previous.value.description }) !== canonical(previous.value);
    if (financialChanged) {
      if (previous) {
        const reason = planEditReason(this.portfolio, previous, this.context.today); if (reason) throw Error(reason);
        if (inputPlan.cardId !== previous.value.cardId || inputPlan.startDate !== previous.value.startDate || inputPlan.purchaseId !== previous.value.purchaseId) throw Error('Conserva la tarjeta, compra y fecha original del plan.');
      }
      if (inputPlan.startDate < latestBalance(this.portfolio, card.id).value.date || inputPlan.startDate > this.context.today || inputPlan.firstCutDate < this.context.today ||
        inputPlan.firstCutDate !== cutOnOrAfter(card.value.cutDay, inputPlan.firstCutDate)) throw Error('Usa un primer corte de hoy o posterior que coincida con el día de corte de la tarjeta.');
      const without = previous ? applyChanges(this.portfolio, [{ entityType: 'installment', entityId: id!, payload: previous.value, voided: true }]) : this.portfolio;
      if (!newPurchase && inputPlan.principalCents + (inputPlan.interestIncludedInDebt ? inputPlan.interestCents : 0) > freeDebt(without, card.id, this.context.today))
        throw Error('El importe supera la deuda disponible para dividir.');
      if (newPurchase) {
        if (previous || inputPlan.purchaseId || inputPlan.interestIncludedInDebt) throw Error('Una compra nueva no tiene intereses incorporados ni compra previa.');
        const purchaseId = this.context.newId();
        changes.push({ entityType: 'movement', entityId: purchaseId, payload: { cardId: card.id, date: inputPlan.startDate, amountCents: inputPlan.principalCents,
          kind: 'expense', description: inputPlan.description, scheduled: false, reconciled: false, statementId: null, allocations: [], importReference: null, ...this.stamp() }, voided: false });
        (inputPlan as { purchaseId: string | null }).purchaseId = purchaseId;
      }
    }
    changes.push({ entityType: 'installment', entityId: id ?? this.context.newId(), payload: inputPlan, voided: false }); return this.checked(changes);
  }
  cancelPlan(id: string): Change[] {
    const plan = record(this.portfolio.installments, id); if (plan.voided) throw Error('El plan ya está deshecho.');
    const changes: Change[] = [{ entityType: 'installment', entityId: id, payload: plan.value, voided: true }];
    if (!plan.value.interestIncludedInDebt) for (const q of installmentQuotas(plan.value).filter(q => q.cutDate <= this.context.today &&
      (plan.value.interestIncorporatedThrough === null || q.cutDate > plan.value.interestIncorporatedThrough) && q.interestCents > 0)) {
      this.editableDate(plan.value.cardId, q.cutDate);
      changes.push({ entityType: 'movement', entityId: this.context.newId(), payload: { cardId: plan.value.cardId, date: q.cutDate, amountCents: q.interestCents,
        kind: 'interest', description: `Interés devengado: ${plan.value.description}`, scheduled: false, reconciled: false, statementId: null, allocations: [], importReference: null, ...this.stamp() }, voided: false });
    }
    return this.checked(changes);
  }
  reconcile(cardId: string, value: Pick<Balance, 'date' | 'debtCents' | 'availableCents'>): Change[] {
    if (value.date < latestBalance(this.portfolio, cardId).value.date || value.date > this.context.today) throw Error('La conciliación debe estar entre el último saldo y hoy.');
    const included = live(this.portfolio.movements).filter(m => m.value.cardId === cardId && !m.value.scheduled && m.value.date <= value.date);
    const changes: Change[] = included.filter(m => !m.value.reconciled).map(m => ({ entityType: 'movement', entityId: m.id, payload: { ...m.value, reconciled: true }, voided: false }));
    changes.push(...live(this.portfolio.installments).filter(p => p.value.cardId === cardId).map(p => ({ entityType: 'installment' as const, entityId: p.id,
      payload: { ...p.value, interestIncorporatedThrough: value.date }, voided: false })));
    changes.push({ entityType: 'balance', entityId: this.context.newId(), payload: { ...value, cardId, includedMovementIds: included.map(m => m.id), interestIncluded: true, ...this.stamp() }, voided: false });
    return this.checked(changes);
  }
  saveStatement(cardId: string, input: Pick<Statement, 'cutDate' | 'dueDate' | 'targetCents' | 'minimumCents' | 'initialPaidCents'>, confirmEstimate = false, id?: string): Change[] {
    if (input.cutDate > this.context.today) throw Error('Confirma el corte cuando llegue su fecha; los futuros siguen siendo proyecciones.');
    const card = record(this.portfolio.cards, cardId), previous = statementsFor(this.portfolio, card, this.context.today).find(s => s.id === id || s.value.cutDate === input.cutDate);
    if (confirmEstimate && (!previous || previous.value.targetCents !== input.targetCents)) throw Error('El estimado cambió. Vuelve a consultarlo antes de confirmar.');
    const same = previous && previous.value.cutDate === input.cutDate && previous.value.targetCents === input.targetCents;
    const included = same && confirmEstimate && previous.value.estimated ? live(this.portfolio.movements).filter(m => m.value.cardId === cardId &&
      m.value.kind === 'payment' && !m.value.scheduled && m.value.date === input.cutDate).map(m => m.id) : same && !previous.value.estimated ? previous.value.includedPaymentIds : [];
    return this.checked([{ entityType: 'statement', entityId: previous && !previous.id.startsWith('estimate:') ? previous.id : this.context.newId(), payload: { ...input,
      cardId, estimated: false, balanceReferenceDate: null, includedPaymentIds: included, reservedCents: previous?.value.reservedCents ?? 0 }, voided: false }]);
  }
  reserve(cardId: string, cutDate: string, reservedCents: number): Change[] {
    const card = record(this.portfolio.cards, cardId), previous = statementsFor(this.portfolio, card, this.context.today).find(s => s.value.cutDate === cutDate)
      ?? estimateStatement(this.portfolio, card, cutDate, this.context.today);
    return this.checked([{ entityType: 'statement', entityId: previous.id.startsWith('estimate:') ? this.context.newId() : previous.id,
      payload: { ...previous.value, reservedCents }, voided: false }]);
  }
  saveLoan(input: Omit<Loan, 'recordedAt' | 'legacyOrdinal'>, id?: string): Change[] {
    const previous = id ? record(this.portfolio.loans, id) : null;
    if (previous && this.portfolio.loanPayments.some(a => a.value.loanId === id) && (input.principalCents !== previous.value.principalCents ||
      input.balanceDate !== previous.value.balanceDate || input.includeReceivedMoney !== previous.value.includeReceivedMoney)) throw Error('Con abonos registrados conserva importe, fecha y origen del dinero.');
    return this.checked([{ entityType: 'loan', entityId: id ?? this.context.newId(), payload: { ...input, person: input.person.trim(), description: input.description.trim(),
      ...(previous ? { recordedAt: previous.value.recordedAt, legacyOrdinal: previous.value.legacyOrdinal } : this.stamp()) }, voided: false }]);
  }
  loanPayment(loanId: string, date: string, amountCents: number, description: string): Change[] {
    if (record(this.portfolio.loans, loanId).value.archived) throw Error('Reabre el préstamo antes de registrar un abono.');
    return this.checked([{ entityType: 'loanPayment', entityId: this.context.newId(), payload: { loanId, date, amountCents, description: description.trim(), scheduled: date > this.context.today, ...this.stamp() }, voided: false }]);
  }
  changeLoanPayment(id: string, action: 'void' | 'restore' | 'realize'): Change[] {
    const p = record(this.portfolio.loanPayments, id);
    if (action === 'realize' && (p.voided || (!p.value.scheduled && p.value.date <= this.context.today))) throw Error('El abono ya está realizado o anulado.');
    return this.checked([{ entityType: 'loanPayment', entityId: id, payload: action === 'realize' ? { ...p.value, date: this.context.today, scheduled: false } : p.value, voided: action === 'void' }]);
  }
  saveIncome(payload: Income): Change[] { return this.checked([{ entityType: 'income', entityId: live(this.portfolio.incomes)[0]?.id ?? '11111111-1111-4111-8111-111111111111', payload, voided: false }]); }
  saveBudget(payload: Budget): Change[] { return this.checked([{ entityType: 'budget', entityId: live(this.portfolio.budgets).find(b => b.value.payday === payload.payday)?.id ?? this.context.newId(), payload, voided: false }]); }
  reminders(payload: ReminderPreferences): Change[] { return this.checked([{ entityType: 'reminderPreferences', entityId: live(this.portfolio.reminderPreferences)[0]?.id ?? '22222222-2222-4222-8222-222222222222', payload, voided: false }]); }
  dismissReminder(payload: ReminderState): Change[] { return this.checked([{ entityType: 'reminderState', entityId: live(this.portfolio.reminderStates).find(r => r.value.reminderKey === payload.reminderKey)?.id ?? this.context.newId(), payload, voided: false }]); }

  saveExtension<K extends FinancialEntityType>(entityType: K, payload: EntityPayloads[K], id?: string): Change[] {
    if (id) record(this.portfolio[extensionTable(entityType)] as readonly FinancialRecord<EntityPayloads[K]>[], id);
    return this.checked([{ entityType, entityId: id ?? this.context.newId(), payload, voided: false } as Change]);
  }
  saveCategory(payload: Category, id?: string) { return this.saveExtension('category', { ...payload, name: payload.name.trim() }, id); }
  saveCategoryRule(payload: CategoryRule, id?: string) { return this.saveExtension('categoryRule', { ...payload, contains: payload.contains.trim() }, id); }
  async setCategory(movementId: string, categoryId: string | null): Promise<Change[]> {
    const movement = record(this.portfolio.movements, movementId);
    if (movement.value.kind === 'payment') throw Error('Los pagos no son gastos nuevos.');
    const existing = this.portfolio.classifications.find(r => r.value.movementId === movementId);
    if (categoryId === null) return existing && !existing.voided ? this.checked([{ entityType: 'classification', entityId: existing.id, payload: existing.value, voided: true }]) : [];
    if (record(this.portfolio.categories, categoryId).value.archived && existing?.value.categoryId !== categoryId) throw Error('Selecciona una categoría activa.');
    return this.checked([{ entityType: 'classification', entityId: existing?.id ?? await stableId('classification:' + movementId), payload: { movementId, categoryId }, voided: false }]);
  }
  async saveCategoryBudget(payload: CategoryBudget): Promise<Change[]> {
    return this.checked([{ entityType: 'categoryBudget', entityId: this.portfolio.categoryBudgets.find(b => b.value.categoryId === payload.categoryId && b.value.payday === payload.payday)?.id ?? await stableId('category-budget:' + payload.categoryId + ':' + payload.payday), payload, voided: false }]);
  }
  saveRecurrence(payload: Recurrence, id?: string) {
    if (record(this.portfolio.cards, payload.cardId).value.archived) throw Error('Selecciona una tarjeta activa.');
    if (payload.startDate < latestBalance(this.portfolio, payload.cardId).value.date) throw Error('La recurrencia debe empezar desde el último saldo bancario.');
    return this.saveExtension('recurrence', { ...payload, description: payload.description.trim() }, id);
  }
  async prepareRecurrences(through: string): Promise<Change[]> {
    if (through > addMonths(this.context.today, 120)) throw Error('Las propuestas admiten hasta diez años de proyección.');
    const changes: Change[] = [];
    for (const recurrence of live(this.portfolio.recurrences)) {
      const r = recurrence.value;
      if (!r.enabled || record(this.portfolio.cards, r.cardId).value.archived) continue;
      const base = latestBalance(this.portfolio, r.cardId).value.date;
      for (const date of recurrenceDates(r, base, through)) {
        if (this.portfolio.occurrences.some(o => o.value.recurrenceId === recurrence.id && o.value.date === date)) continue;
        const movementId = await stableId('recurring-movement:' + recurrence.id + ':' + date);
        if (this.portfolio.movements.some(m => m.id === movementId)) continue;
        if (live(this.portfolio.closures).some(c => c.value.cardId === r.cardId && c.value.from <= date && c.value.to >= date)) continue;
        changes.push({ entityType: 'movement', entityId: movementId, payload: { cardId: r.cardId, date, amountCents: r.amountCents, kind: r.kind, description: r.description,
          scheduled: true, reconciled: false, statementId: null, allocations: [], importReference: null, recordedAt: date + 'T00:00:00.000Z', legacyOrdinal: null }, voided: false });
        changes.push({ entityType: 'occurrence', entityId: await stableId('occurrence:' + recurrence.id + ':' + date), payload: { recurrenceId: recurrence.id, date, movementId }, voided: false });
        if (r.categoryId !== null) changes.push({ entityType: 'classification', entityId: await stableId('classification:' + movementId), payload: { movementId, categoryId: r.categoryId }, voided: false });
        if (changes.length > 3000) throw Error('Hay demasiadas propuestas. Acorta el horizonte o registra una fecha de inicio más reciente.');
      }
    }
    return this.checked(changes);
  }
  saveCashAccount(payload: CashAccount, id?: string) { return this.saveExtension('cashAccount', { ...payload, name: payload.name.trim() }, id); }
  saveCashEntry(payload: CashEntry, id?: string) {
    if (record(this.portfolio.cashAccounts, payload.accountId).value.archived || (payload.toAccountId && record(this.portfolio.cashAccounts, payload.toAccountId).value.archived)) throw Error('Selecciona cuentas activas.');
    return this.saveExtension('cashEntry', { ...payload, description: payload.description.trim() }, id);
  }
  payCardFromAccount(accountId: string, cardId: string, date: string, amountCents: number, description: string): Change[] {
    if (record(this.portfolio.cashAccounts, accountId).value.archived || date > this.context.today) throw Error('Selecciona una cuenta activa y una fecha de pago real.');
    const changes = this.recordMovement({ cardId, date, amountCents, description, kind: 'payment', statementId: null, allocations: [] });
    const movement = changes.find(c => c.entityType === 'movement')!;
    changes.push({ entityType: 'cashEntry', entityId: this.context.newId(), payload: { accountId, toAccountId: null, cardMovementId: movement.entityId, date, amountCents, description: description.trim(), kind: 'cardPayment', categoryId: null }, voided: false });
    return this.checked(changes);
  }
  saveSavingsGoal(payload: SavingsGoal, id?: string) {
    if (id && record(this.portfolio.savingsGoals, id).value.accountId !== payload.accountId && goalSaved(this.portfolio, id, this.context.today) !== 0) throw Error('Libera la reserva antes de cambiar la cuenta de la meta.');
    if (record(this.portfolio.cashAccounts, payload.accountId).value.archived) throw Error('Selecciona una cuenta activa.');
    return this.saveExtension('savingsGoal', { ...payload, name: payload.name.trim() }, id);
  }
  saveSavingsEntry(payload: SavingsEntry, id?: string) {
    if (record(this.portfolio.savingsGoals, payload.goalId).value.archived) throw Error('Reactiva la meta para modificar su reserva.');
    return this.saveExtension('savingsEntry', { ...payload, description: payload.description.trim() }, id);
  }
  voidExtension(entityType: FinancialEntityType, id: string): Change[] {
    const allowed = ['categoryRule', 'categoryBudget', 'cashEntry', 'savingsEntry'];
    if (!allowed.includes(entityType)) throw Error('Este registro se archiva para conservar sus relaciones.');
    const row = record(this.portfolio[extensionTable(entityType)] as readonly FinancialRecord<EntityPayloads[FinancialEntityType]>[], id);
    const changes: Change[] = [{ entityType, entityId: id, payload: row.value, voided: true } as Change];
    if (entityType === 'cashEntry' && 'cardMovementId' in row.value && row.value.cardMovementId !== null) {
      const m = record(this.portfolio.movements, row.value.cardMovementId as string); this.editableDate(m.value.cardId, m.value.date);
      if (m.value.reconciled || this.portfolio.balances.some(b => b.value.includedMovementIds.includes(m.id))) throw Error('El pago conciliado conserva su historial.');
      changes.push({ entityType: 'movement', entityId: m.id, payload: m.value, voided: true });
    }
    return this.checked(changes);
  }

  async closePeriod(cardId: string, from: string, to: string, bankDebtCents: number | null, bankAvailableCents: number | null): Promise<Change[]> {
    const { fingerprintInput, ...values } = periodReport(this.portfolio, cardId, from, to, this.context.today);
    return this.checked([{ entityType: 'closure', entityId: this.context.newId(), payload: { ...values, bankDebtCents, bankAvailableCents,
      historyHash: await sha256(fingerprintInput), recordedAt: this.context.now, legacyOrdinal: null }, voided: false }]);
  }
  reopenPeriod(id: string): Change[] { const c = record(this.portfolio.closures, id); return this.checked([{ entityType: 'closure', entityId: id, payload: c.value, voided: true }]); }
}
import { amortize } from '@paymentplan/domain';
const domainAmortization = { amortize };

import { entityTables as extensionTableMap } from '@paymentplan/domain';
function extensionTable(type: FinancialEntityType) { return extensionTableMap[type]; }
async function stableId(input: string): Promise<string> {
  const hash = await sha256(input); return hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-5' + hash.slice(13, 16) + '-8' + hash.slice(17, 20) + '-' + hash.slice(20, 32);
}
