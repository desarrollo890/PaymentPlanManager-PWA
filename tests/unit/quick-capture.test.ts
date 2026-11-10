import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretQuickCapture } from '../../apps/pwa/src/quick-capture.ts';
import type { QuickTarget } from '../../apps/pwa/src/quick-capture.ts';

const targets: QuickTarget[] = [
  { id: 'card', name: 'Santander', kind: 'card' },
  { id: 'cash', name: 'Nómina', kind: 'account' },
  { id: 'loan', name: 'Juan', kind: 'loan' },
];
const parse = (text: string) => interpretQuickCapture(text, '2026-11-10', targets);

test('proposes card, account and personal loan transactions from explicit phrases', () => {
  assert.deepEqual(parse('Gasté 250 en supermercado con Santander'), { kind: 'cardExpense', targetId: 'card', amount: '250', date: '2026-11-10' });
  assert.deepEqual(parse('Pagué 10.50 a Santander ayer'), { kind: 'cardPayment', targetId: 'card', amount: '10.50', date: '2026-11-09' });
  assert.equal(parse('Recibí 500 en Nómina').kind, 'accountIncome');
  assert.equal(parse('Gasté 200 de Nómina').kind, 'accountExpense');
  assert.equal(parse('Aboné 100 a Juan').kind, 'loanPayment');
  assert.equal(parse('Juan me prestó 300').kind, 'loanAdvance');
});

test('does not guess between duplicate or missing names and leaves unclear dates for review', () => {
  const duplicate = [...targets, { id: 'other', name: 'Santander', kind: 'account' as const }];
  assert.equal(interpretQuickCapture('Gasté 250 con Santander', '2026-11-10', duplicate).targetId, '');
  assert.equal(parse('Gasté 250 con otra tarjeta').kind, '');
  assert.equal(parse('Gasté 250 con Santander el 5 de noviembre').date, '');
  assert.equal(parse('Gasté 250 con Santander el 05/11').date, '');
  assert.equal(parse('Gasté 250 con Santander ayer o hoy').date, '');
  assert.equal(parse('Gasté 250 con Santander el 2026-11-05').date, '2026-11-05');
  assert.equal(parse('Gasté 12.345 con Santander').amount, '');
  assert.equal(parse('Gasté doscientos con Santander').amount, '');
});
