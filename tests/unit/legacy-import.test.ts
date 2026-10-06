import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { importLegacy } from '@paymentplan/application';
import { applyChanges, emptyPortfolio } from '@paymentplan/domain';
function fixture() {
  const Id = randomUUID(), purchase = randomUUID(); return { VersionSchema: 1, Tarjetas: [{ Id, Nombre: 'Synthetic', Banco: 'Bank', LineaTotal: 20000, DiaCorte: 11, DiaLimitePago: 25, OrigenDeudaInicial: 1,
    EstadoActual: { DisponibleInicial: 10000, DeudaInicial: 10000, FechaEstado: '2026-10-03T00:00:00' },
    Transacciones: [{ Id: purchase, TarjetaCreditoId: Id, Fecha: '2026-10-03T00:00:00', Monto: 1000, Tipo: 'Gasto', Descripcion: 'Purchase', IncluirEnCalculo: true, Confirmado: false, CreatedAt: '2026-10-03T12:00:00Z' }],
    PlanesMeses: [{ Id: randomUUID(), Descripcion: 'MSI', Capital: 6000, Meses: 14, InteresTotal: 0, FechaInicio: '2026-10-03', PrimerCorte: '2026-10-11', DiaCorte: 11 }],
  }], Configuracion: { IngresoDia15: 8000, IngresoFinMes: 8000, Prestamos: [{ Id: randomUUID(), Persona: 'Synthetic person', Concepto: 'Loan', CapitalInicial: 500, FechaSaldo: '2026-10-03', FechaLimite: '2026-10-31', RegistradoEnUtc: '2026-10-03T14:00:00Z', Abonos: [{Id:randomUUID(),Fecha:'2026-10-03',Monto:100,Descripcion:'Payment',RegistradoEnUtc:'2026-10-03T15:00:00Z'}] }] } };
}
test('legacy transfer preserves identities, complete horizon and exact balances; repeating is idempotent', async () => {
  const original = fixture(), preview = await importLegacy(original, emptyPortfolio(), '2026-10-03');
  assert.equal(preview.view.cards[0]!.id, original.Tarjetas[0]!.Id); assert.equal(preview.view.debtCents, 1100000); assert.equal(preview.view.cards[0]!.installmentDebtCents, 600000); assert.equal(preview.view.loanDebtCents, 40000);
  assert(preview.view.horizon >= '2027-11-25'); const state = applyChanges(emptyPortfolio(), preview.changes), repeated = await importLegacy(original, state, '2026-10-03');
  assert.equal(repeated.changes.length, 0); assert.equal(repeated.skipped, preview.changes.length);
});
test('legacy import rejects different existing revisions, wrong ownership and incompatible schema without modifying data', async () => {
  const original=fixture(), preview=await importLegacy(original,emptyPortfolio(),'2026-10-03'),state=applyChanges(emptyPortfolio(),preview.changes),before=structuredClone(state);
  original.Tarjetas[0]!.Transacciones[0]!.Monto=1100; await assert.rejects(importLegacy(original,state,'2026-10-03'),/versión diferente/); assert.deepEqual(state,before);
  original.Tarjetas[0]!.Transacciones[0]!.TarjetaCreditoId=randomUUID();await assert.rejects(importLegacy(original,emptyPortfolio(),'2026-10-03'),/otra tarjeta/);
  await assert.rejects(importLegacy({...fixture(),VersionSchema:2},emptyPortfolio(),'2026-10-03'),/versión 1/);
});
test('legacy reconciliation and cancelled plans retain the original financial meaning', async () => {
  const source=fixture();source.Tarjetas[0]!.Transacciones[0]!.Confirmado=true;
  const preview=await importLegacy(source,emptyPortfolio(),'2026-10-03');assert.equal(preview.view.debtCents,1000000);assert.equal(preview.changes.find(c=>c.entityType==='movement')!.payload.reconciled,true);
  const cancelled=structuredClone(source) as unknown as {Tarjetas:{PlanesMeses:{Cancelado?:boolean}[]}[]};cancelled.Tarjetas[0]!.PlanesMeses[0]!.Cancelado=true;
  const result=await importLegacy(cancelled,emptyPortfolio(),'2026-10-03');assert.equal(result.view.cards[0]!.installmentDebtCents,0);assert(result.changes.find(c=>c.entityType==='installment')!.voided);
});
