import { canonical } from '@paymentplan/contracts';
import type { EntityPayloads, Installment } from '@paymentplan/contracts';
import { applyChanges, assertPortfolio, civilDate, emptyPortfolio, entityTables, financeView, periodReport } from '@paymentplan/domain';
import type { Change, FinancialEntityType, FinanceView, Portfolio } from '@paymentplan/domain';
import { sha256 } from '@paymentplan/crypto';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('El archivo contiene un registro incompleto.'); return value as ObjectValue; };
const array = (value: unknown): ObjectValue[] => { if (value === undefined || value === null) return []; if (!Array.isArray(value) || value.length > 100_000) throw Error('Lista de importación inválida o demasiado grande.'); return value.map(object); };
const text = (value: unknown, fallback = ''): string => value == null ? fallback : String(value);
const date = (value: unknown): string => { const result = text(value).slice(0, 10); civilDate(result); return result; };
const nullableDate = (value: unknown): string | null => value == null || text(value).startsWith('0001-') ? null : date(value);
const instant = (value: unknown): string | null => { if (value == null || text(value).startsWith('0001-')) return null; const raw = text(value); if (!/(Z|\+00:00)$/.test(raw)) throw Error('La fecha de registro debe indicar UTC. Exporta un respaldo actualizado desde la aplicación anterior.'); return raw.replace(/\+00:00$/, 'Z'); };
const decimal = (value: unknown): number => {
  const raw = text(value, '0'); if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw Error('Un importe del archivo tiene más de dos decimales o es inválido.');
  const [whole, fraction = ''] = raw.replace('-', '').split('.'); const result = Number((BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))) * (raw.startsWith('-') ? -1n : 1n));
  if (!Number.isSafeInteger(result)) throw Error('Un importe excede el rango admitido.'); return result;
};
const uuid = (value: unknown): string => { const id = text(value).toLowerCase(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw Error('Un identificador del respaldo es inválido.'); return id; };
const ids = (value: unknown): string[] => { if (value == null) return []; if (!Array.isArray(value)) throw Error('Lista de identificadores inválida.'); return value.map(uuid); };
async function stableId(key: string): Promise<string> { const digest = await sha256(key); return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`; }
export interface ImportPreview { readonly changes: Change[]; readonly skipped: number; readonly view: FinanceView; readonly warnings: readonly string[] }
export async function importLegacy(value: unknown, current: Portfolio, today: string): Promise<ImportPreview> {
  const root = object(value);
  if ((root.VersionSchema ?? root.Version ?? 1) !== 1 || !Array.isArray(root.Tarjetas)) throw Error('Selecciona un respaldo JSON versión 1 de PaymentPlanManager.');
  const rows: Change[] = [], warnings: string[] = []; let ordinal = 0;
  function add<K extends FinancialEntityType>(entityType: K, entityId: string, payload: EntityPayloads[K], voided = false) { rows.push({ entityType, entityId, payload, voided } as Change); }
  for (const c of array(root.Tarjetas)) {
    const cardId = uuid(c.Id), state = object(c.EstadoActual), movements = array(c.Transacciones);
    add('card', cardId, { name: text(c.Nombre), bank: text(c.Banco), limitCents: decimal(c.LineaTotal), cutDay: Number(c.DiaCorte), dueDay: Number(c.DiaLimitePago),
      color: text(c.Color, '#234E70'), dueMonthOffset: c.MesesDespuesDelCorte == null ? null : Number(c.MesesDespuesDelCorte),
      initialDebtOrigin: c.OrigenDeudaInicial === 1 || c.OrigenDeudaInicial === 'PeriodoActual' ? 'currentPeriod' : c.OrigenDeudaInicial === 2 || c.OrigenDeudaInicial === 'CorteAnterior' ? 'previousStatement' : 'unknown', archived: false });
    const history = array(c.HistorialSaldos);
    for (let i = 0; i < history.length; i++) { const b = history[i]!;
      add('balance', await stableId(`legacy:balance:${cardId}:${i}`), { cardId, date: date(b.Fecha), availableCents: decimal(b.Disponible), debtCents: decimal(b.Deuda),
        includedMovementIds: ids(b.MovimientosIncorporados), interestIncluded: b.InteresesIncorporados !== false, recordedAt: instant(b.RegistradoEnUtc), legacyOrdinal: ordinal++ }); }
    const confirmed = movements.filter(m => m.Confirmado === true).map(m => uuid(m.Id));
    const last = history.at(-1), debt = decimal(state.DeudaInicial) - decimal(state.SaldoAFavorInicial), balanceDate = date(state.FechaEstado);
    if (!last || date(last.Fecha) !== balanceDate || decimal(last.Deuda) !== debt || decimal(last.Disponible) !== decimal(state.DisponibleInicial) || canonical(ids(last.MovimientosIncorporados).sort()) !== canonical([...confirmed].sort()))
      add('balance', await stableId(`legacy:balance-current:${cardId}`), { cardId, date: balanceDate, availableCents: decimal(state.DisponibleInicial), debtCents: debt, includedMovementIds: confirmed,
        interestIncluded: array(c.PlanesMeses).some(p => nullableDate(p.InteresesIncorporadosHasta) !== null && date(p.InteresesIncorporadosHasta) >= balanceDate), recordedAt: null, legacyOrdinal: ordinal++ });
    for (const m of movements) {
      const kind = ({ Pago: 'payment', Gasto: 'expense', Comision: 'fee', Interes: 'interest', '1': 'payment', '2': 'expense', '3': 'fee', '4': 'interest' } as const)[text(m.Tipo) as 'Pago'];
      if (!kind || (m.TarjetaCreditoId && uuid(m.TarjetaCreditoId) !== cardId)) throw Error('Movimiento de otra tarjeta o tipo desconocido.');
      add('movement', uuid(m.Id), { cardId, date: date(m.Fecha), amountCents: decimal(m.Monto), kind, description: text(m.Descripcion),
        scheduled: typeof m.Programado === 'boolean' ? m.Programado : m.Confirmado !== true && date(m.Fecha) > today, reconciled: m.Confirmado === true,
        statementId: m.CorteId == null ? null : uuid(m.CorteId), importReference: m.ReferenciaImportacion == null ? null : text(m.ReferenciaImportacion),
        allocations: array(m.AplicacionesCuotas).map(a => ({ planId: uuid(a.PlanId), quotaNumber: Number(a.NumeroCuota), principalCents: decimal(a.Capital), interestCents: decimal(a.Interes) })),
        recordedAt: instant(m.CreatedAt), legacyOrdinal: ordinal++ }, m.IncluirEnCalculo === false);
    }
    for (const p of array(c.PlanesMeses)) {
      let amortization: Installment['amortization'] = null;
      if (p.Amortizacion) { const a = object(p.Amortizacion), method = ({ CuotaFija: 'fixedPayment', CapitalFijo: 'fixedPrincipal', TablaBanco: 'bankTable' } as const)[text(a.Metodo) as 'CuotaFija'];
        if (!method) throw Error('Método de amortización desconocido.'); amortization = { method, monthlyRate: text(a.TasaMensual, '0'), interestTaxRate: text(a.IvaInteres, '0'), table: a.Tabla == null ? null : array(a.Tabla).map(q => ({ principalCents: decimal(q.Capital), interestCents: decimal(q.Interes) })) }; }
      add('installment', uuid(p.Id), { cardId, description: text(p.Descripcion), principalCents: decimal(p.Capital), months: Number(p.Meses), interestCents: decimal(p.InteresTotal),
        startDate: date(p.FechaInicio), firstCutDate: date(p.PrimerCorte), cutDay: Number(p.DiaCorte), purchaseId: p.CompraId == null ? null : uuid(p.CompraId),
        interestIncludedInDebt: p.InteresIncluidoEnDeuda === true, interestIncorporatedThrough: nullableDate(p.InteresesIncorporadosHasta), amortization, recordedAt: instant(p.RegistradoEnUtc), legacyOrdinal: ordinal++ }, p.Cancelado === true);
    }
    for (const s of array(c.Cortes)) add('statement', uuid(s.Id), { cardId, cutDate: date(s.FechaCorte), dueDate: date(s.FechaLimitePago), targetCents: decimal(s.PagoParaNoGenerarIntereses), minimumCents: decimal(s.PagoMinimo),
      initialPaidCents: decimal(s.PagadoInicial), reservedCents: decimal(s.Apartado), estimated: s.EsEstimado === true, balanceReferenceDate: nullableDate(s.FechaSaldoReferencia), includedPaymentIds: ids(s.PagosIncorporadosEnImporte) });
  }
  const config = root.Configuracion == null ? null : object(root.Configuracion);
  if (config) {
    add('income', '11111111-1111-4111-8111-111111111111', { income15Cents: decimal(config.IngresoDia15), incomeEndCents: decimal(config.IngresoFinMes), expensesCents: decimal(config.GastosPorQuincena), reserveCents: decimal(config.ReservaPorQuincena) });
    for (const b of array(config.Presupuestos)) add('budget', await stableId(`legacy:budget:${date(b.FechaIngreso)}`), { payday: date(b.FechaIngreso), expectedIncomeCents: decimal(b.IngresoEsperado), receivedIncomeCents: b.IngresoRecibido == null ? null : decimal(b.IngresoRecibido), expensesCents: decimal(b.GastosEsenciales), reserveCents: decimal(b.Reserva), note: text(b.Nota) });
    if (config.Recordatorios) { const r = object(config.Recordatorios); add('reminderPreferences', '22222222-2222-4222-8222-222222222222', { enabled: r.Activos !== false, cuts: r.Cortes !== false, payments: r.Pagos !== false, daysBefore: Number(r.DiasAntes ?? 3) }); }
    for (const r of array(config.AvisosAtendidos)) add('reminderState', await stableId(`legacy:reminder:${text(r.Id)}`), { reminderKey: text(r.Id), postponedUntil: nullableDate(r.PospuestoHasta) });
    for (const l of array(config.Prestamos)) {
      const loanId = uuid(l.Id); add('loan', loanId, { person: text(l.Persona), description: text(l.Concepto), principalCents: decimal(l.CapitalInicial), balanceDate: date(l.FechaSaldo), dueDate: nullableDate(l.FechaLimite), includeReceivedMoney: l.IncluirDineroRecibido === true, archived: l.Archivado === true, recordedAt: instant(l.RegistradoEnUtc), legacyOrdinal: ordinal++ });
      for (const a of array(l.Abonos)) add('loanPayment', uuid(a.Id), { loanId, date: date(a.Fecha), amountCents: decimal(a.Monto), description: text(a.Descripcion), scheduled: a.Programado === true, recordedAt: instant(a.RegistradoEnUtc), legacyOrdinal: ordinal++ }, a.Anulado === true);
    }
  }
  let imported = applyChanges(emptyPortfolio(), rows); assertPortfolio(imported, today);
  for (const c of array(root.Tarjetas)) for (const h of array(c.Cierres)) {
    const cardId = uuid(c.Id), report = periodReport(imported, cardId, date(h.Desde), date(h.Hasta), today);
    const fields = ['openingDebtCents', 'openingAvailableCents', 'paymentsCents', 'expensesCents', 'feesCents', 'interestCents', 'closingDebtCents', 'closingAvailableCents'] as const;
    const originals = ['DeudaApertura', 'DisponibleApertura', 'Pagos', 'Gastos', 'Comisiones', 'Intereses', 'DeudaCierre', 'DisponibleCierre'] as const;
    if (fields.some((key, i) => report[key] !== decimal(h[originals[i]!]))) throw Error('Un cierre no cuadra con el historial importado. Revisa el respaldo original antes de migrarlo.');
    add('closure', uuid(h.Id), { cardId, from: report.from, to: report.to, openingDebtCents: report.openingDebtCents, openingAvailableCents: report.openingAvailableCents, paymentsCents: report.paymentsCents,
      expensesCents: report.expensesCents, feesCents: report.feesCents, interestCents: report.interestCents, closingDebtCents: report.closingDebtCents, closingAvailableCents: report.closingAvailableCents,
      bankDebtCents: h.DeudaBanco == null ? null : decimal(h.DeudaBanco), bankAvailableCents: h.DisponibleBanco == null ? null : decimal(h.DisponibleBanco), historyHash: await sha256(report.fingerprintInput), recordedAt: instant(h.RegistradoEnUtc), legacyOrdinal: ordinal++ });
  }
  const changes: Change[] = []; let skipped = 0;
  for (const row of rows) { const existing = current[entityTables[row.entityType]].find(r => r.id === row.entityId);
    if (existing) { if (canonical(existing.value) !== canonical(row.payload) || existing.voided !== row.voided) throw Error('Este respaldo contiene una versión diferente de un registro existente. Impórtalo en una cartera nueva para revisar las diferencias.'); skipped++; }
    else changes.push(row); }
  imported = applyChanges(current, changes); assertPortfolio(imported, today);
  const view = financeView(imported, today); for (const c of view.cards) if (c.alerts.some(a => a.code !== 'creditBalance')) warnings.push(`${c.name}: revisa disponible, deuda y límite con el banco.`);
  return { changes, skipped, view, warnings };
}
