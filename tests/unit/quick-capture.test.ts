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
  assert.deepEqual(parse('Gasté 250 en supermercado con Santander'), { kind: 'cardExpense', targetId: 'card', amount: '250', date: '2026-11-10', description: 'supermercado' });
  assert.deepEqual(parse('Pagué 10.50 a Santander ayer'), { kind: 'cardPayment', targetId: 'card', amount: '10.50', date: '2026-11-09', description: '' });
  assert.equal(parse('Recibí 500 en Nómina').kind, 'accountIncome');
  assert.equal(parse('Gasté 200 de Nómina').kind, 'accountExpense');
  assert.equal(parse('Aboné 100 a Juan').kind, 'loanPayment');
  assert.equal(parse('Juan me prestó 300').kind, 'loanAdvance');
});

test('prefers the full name over contained names but does not guess among distinct or duplicate matches', () => {
  const cards: QuickTarget[] = [
    { id: 'one', name: 'Selección Nacional', kind: 'card' },
    { id: 'two', name: 'Selección Nacional 2', kind: 'card' },
  ];
  assert.deepEqual(interpretQuickCapture('Gasté 229.9 en gasolina con selección nacional 2', '2026-11-10', cards),
    { kind: 'cardExpense', targetId: 'two', amount: '229.9', date: '2026-11-10', description: 'gasolina' });
  assert.equal(interpretQuickCapture('Gasté 1 con Selección Nacional', '2026-11-10', cards).targetId, 'one');
  assert.equal(interpretQuickCapture('Gasté 1 con Selección Nacional y Santander', '2026-11-10', [...cards, targets[0]!]).targetId, '');
  assert.equal(interpretQuickCapture('Gasté 1 con Selección Nacional 2', '2026-11-10', [...cards, { id: 'duplicate', name: 'seleccion nacional 2', kind: 'card' }]).targetId, '');
});

test('extracts editable descriptions for each operation and preserves accents', () => {
  assert.equal(parse('Pagué 100 a Santander por bonificación').description, 'bonificación');
  assert.equal(parse('Gasté 200 de Nómina en comida').description, 'comida');
  assert.equal(parse('Recibí 500 en Nómina por nómina quincenal').description, 'quincenal');
  assert.equal(parse('Aboné 100 a Juan por libros').description, 'libros');
  assert.equal(parse('Juan me prestó 300 para materiales').description, 'materiales');
  assert.equal(parse('María me prestó 300 para materiales').description, 'materiales');
  assert.equal(parse('Juan me prestó 300').description, '');
  assert.equal(parse('Gasté 10 en café de la estación con Santander').description, 'café de la estación');
  assert.equal(parse('Gasté 10 en café con Santander ayer').description, 'café');
  assert.equal(parse('Gaste\u0301 10 en café con Santander').description, 'café');
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
