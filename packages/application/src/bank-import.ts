import { FinancialCommands } from './commands.ts';
import { activePlans, installmentQuotas, applyChanges, civilDate } from '@paymentplan/domain';
import type { Change, Portfolio } from '@paymentplan/domain';
import { canonical } from '@paymentplan/contracts';
import type { Movement } from '@paymentplan/contracts';
import { sha256 } from '@paymentplan/crypto';
export function readCsv(text: string, delimiter?: string): string[][] {
  if (text.length > 20_000_000) throw Error('El CSV excede 20 MB.');
  text = text.replace(/^\ufeff/, '');
  const first = text.split(/\r?\n/)[0] ?? ''; const separator = delimiter ?? ([',', ';', '\t'].toSorted((a, b) => first.split(b).length - first.split(a).length)[0]!);
  const rows: string[][] = [], row: string[] = []; let value = '', quoted = false;
  const endCell = () => { if (value.length > 10000 || row.length >= 100) throw Error('El archivo contiene una celda o fila demasiado grande.'); row.push(value); value = ''; };
  const endRow = () => { endCell(); if (row.some(c => c.trim())) rows.push([...row]); row.length = 0; if (rows.length > 10001) throw Error('Importa hasta 10 000 movimientos por archivo.'); };
  for (let i = 0; i < text.length; i++) { const c = text[i]!;
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else if (quoted || value.length === 0) quoted = !quoted; else throw Error('Comillas inesperadas en el CSV.'); }
    else if (!quoted && c === separator) endCell();
    else if (!quoted && (c === '\n' || c === '\r')) { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else value += c;
  }
  if (quoted) throw Error('El CSV contiene comillas sin cerrar.'); if (value.length || row.length) endRow(); return rows;
}
export interface BankMapping { readonly date: number; readonly description: number; readonly amount: number; readonly kind: number; readonly reference: number; readonly dateFormat: 'iso' | 'dmy' | 'excel' | 'excel1904'; readonly decimalComma: boolean; readonly defaultKind: Movement['kind'] }
export interface BankRow { readonly row: number; readonly date: string; readonly description: string; readonly amountCents: number; readonly kind: Movement['kind']; readonly duplicate: boolean; readonly change: Change | null; readonly warning: string | null; readonly error: string | null }
export async function prepareBankImport(p: Portfolio, cardId: string, rows: readonly string[][], mapping: BankMapping, today: string): Promise<BankRow[]> {
  if (!p.cards.some(c => c.id === cardId && !c.voided && !c.value.archived)) throw Error('Selecciona una tarjeta activa.');
  if (rows.length < 2 || rows.length > 10001) throw Error('El archivo necesita encabezados y hasta 10 000 filas.');
  const result: BankRow[] = [], occurrences = new Map<string, number>(); let candidate = p;
  for (let i = 1; i < rows.length; i++) {
    try {
    const cells = rows[i]!, get = (index: number) => cells[index]?.trim() ?? ''; let date = get(mapping.date);
    if (mapping.dateFormat === 'dmy') { const parts = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (!parts) throw Error(`Fila ${i + 1}: usa fechas día/mes/año.`); date = `${parts[3]}-${parts[2]!.padStart(2, '0')}-${parts[1]!.padStart(2, '0')}`; }
    if (mapping.dateFormat === 'excel' || mapping.dateFormat === 'excel1904') { const serial = Number(date), offset = mapping.dateFormat === 'excel1904' ? 1462 : 0;
      if (!/^\d+(?:\.\d+)?$/.test(date) || !Number.isFinite(serial) || serial + offset < 61 || serial + offset > 2958465) throw Error(`Fila ${i + 1}: fecha numérica de Excel inválida.`);
      date = new Date(Date.UTC(1899, 11, 30) + (Math.floor(serial) + offset) * 86_400_000).toISOString().slice(0, 10); }
    civilDate(date); const description = get(mapping.description); let raw = get(mapping.amount).replace(/[$\s]/g, '');
    if (mapping.decimalComma) raw = raw.replaceAll('.', '').replace(',', '.'); else raw = raw.replaceAll(',', '');
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw Error(`Fila ${i + 1}: revisa el formato del importe.`);
    const [whole, fractional = ''] = raw.replace('-', '').split('.'), amountCents = Number(BigInt(whole!) * 100n + BigInt(fractional.padEnd(2, '0')));
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw Error(`Fila ${i + 1}: el importe debe ser positivo y válido.`);
    const kindName = get(mapping.kind).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''), kindMap: Record<string, Movement['kind']> = { pago: 'payment', abono: 'payment', payment: 'payment', gasto: 'expense', compra: 'expense', cargo: 'expense', expense: 'expense', comision: 'fee', fee: 'fee', interes: 'interest', interest: 'interest' };
    const kind = mapping.kind < 0 ? mapping.defaultKind : kindMap[kindName]; if (!kind) throw Error(`Fila ${i + 1}: tipo de movimiento desconocido.`);
    const externalId = get(mapping.reference), identity = await sha256(canonical({ cardId, date, amountCents, kind, description, externalId }));
    const count = occurrences.get(identity) ?? 0; occurrences.set(identity, count + 1); const importReference = `bank:${identity}:${externalId ? 0 : count}`;
    const duplicate = candidate.movements.some(m => m.value.cardId === cardId && m.value.importReference === importReference);
    const normalize = (text: string) => text.trim().toLocaleLowerCase('es-MX').replace(/\s+/g, ' ');
    const manualMatch = p.movements.some(m => !m.voided && !m.value.importReference?.startsWith('bank:') && m.value.cardId === cardId && m.value.date === date &&
      m.value.kind === kind && m.value.amountCents === amountCents && normalize(m.value.description) === normalize(description));
    const planInterest = kind === 'interest' && activePlans(p, cardId).some(plan => !plan.value.interestIncludedInDebt && installmentQuotas(plan.value).some(q => q.cutDate === date && q.interestCents === amountCents));
    const warning = manualMatch ? 'Coincide con un movimiento manual o de la app anterior. Revísalo antes de importar otra vez.' : planInterest ? 'Este interés coincide con una cuota y ya se calcula en el plan. Importarlo podría duplicarlo.' : null;
    const rowId = identity.slice(0, 8) + '-' + identity.slice(8, 12) + '-5' + identity.slice(13, 16) + '-a' + identity.slice(17, 20) + '-' + (await sha256(importReference)).slice(20, 32);
    const command = new FinancialCommands(candidate, { today, now: new Date().toISOString(), newId: () => crypto.randomUUID() });
    const prepared = duplicate ? [] : command.recordMovement({ cardId, date, amountCents, kind, description, statementId: null, allocations: [] });
    // Imported payments remain unassigned to a statement: confirming a bank target
    // may require a separate review of its already-included payments.
    const movementChange = prepared.find(c => c.entityType === 'movement');
    const change = movementChange?.entityType === 'movement' ? { ...movementChange, entityId: rowId, payload: { ...movementChange.payload, statementId: null, importReference } } as Change : null;
    if (change && !warning) candidate = applyChanges(candidate, [change]); result.push({ row: i + 1, date, description, amountCents, kind, duplicate, change, warning, error: null });
    } catch (e) {
      result.push({ row: i + 1, date: rows[i]![mapping.date] ?? '', description: rows[i]![mapping.description] ?? '', amountCents: 0,
        kind: mapping.defaultKind, duplicate: false, change: null, warning: null, error: e instanceof Error ? e.message : 'Fila inválida.' });
    }
  }
  return result;
}
