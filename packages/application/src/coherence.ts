import { canonical } from '@paymentplan/contracts';
import type { Operation, Installment, Loan } from '@paymentplan/contracts';
import { live, periodReport, planEditReason } from '@paymentplan/domain';
import type { FinancialIssue, Portfolio } from '@paymentplan/domain';
import { sha256 } from '@paymentplan/crypto';
import type { RevisionState } from '@paymentplan/sync';
export async function historyIssues(state: RevisionState, portfolio: Portfolio, today: string): Promise<FinancialIssue[]> {
  const issues: FinancialIssue[] = [], operations = new Map(state.operations.map(op => [op.operationId, op]));
  function observes(descendant: Operation, ancestor: Operation): boolean {
    const queue = [descendant.operationId], seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) { const id = queue[i]!; if (id === ancestor.operationId) return true; if (seen.has(id)) continue; seen.add(id);
      const op = operations.get(id); if (op) queue.push(...op.parentRevisionIds, ...op.dependencyOperationIds); }
    return false;
  }
  for (const entity of state.entities.filter(e => e.status !== 'void' && e.status !== 'conflict' && ['installment', 'loan'].includes(e.entityType))) {
    for (const head of entity.heads) {
      if (head.action !== 'replace' || head.parentRevisionIds.length !== 1 || !head.payload) continue;
      const parent = operations.get(head.parentRevisionIds[0]!); if (!parent?.payload) continue;
      const fields = entity.entityType === 'installment' ? ['principalCents', 'months', 'interestCents', 'firstCutDate', 'cutDay', 'interestIncludedInDebt', 'amortization'] : ['principalCents', 'balanceDate', 'includeReceivedMoney'];
      if (!fields.some(f => canonical((head.payload as unknown as Record<string, unknown>)[f]) !== canonical((parent.payload as unknown as Record<string, unknown>)[f]))) continue;
      if (entity.entityType === 'installment') {
        const plan = parent.payload as Installment, reason = planEditReason(portfolio, { id: entity.entityId, value: plan, voided: false }, today);
        if (!reason) continue;
        const concurrent = state.entities.filter(e => e.entityType === 'movement' && e.status !== 'void').flatMap(e => e.heads).filter(op => {
          if (op.entityType !== 'movement' || !op.payload || op.payload.kind !== 'payment' || op.payload.cardId !== plan.cardId || op.payload.date < plan.startDate) return false;
          return !observes(op, head) && !observes(head, op);
        });
        if (concurrent.length) issues.push({ message: 'Un plan fue editado mientras otro dispositivo registraba pagos de su periodo. Revisa la edición y las atribuciones antes de continuar.', entityIds: [entity.entityId, ...concurrent.map(op => op.entityId)] });
      } else {
        const loan = parent.payload as Loan;
        const concurrent = state.entities.filter(e => e.entityType === 'loanPayment' && e.status !== 'void').flatMap(e => e.heads).filter(op => op.entityType === 'loanPayment' && op.payload?.loanId === entity.entityId && !observes(op, head) && !observes(head, op));
        if (loan && concurrent.length) issues.push({ message: 'Se corrigió el capital u origen de un préstamo mientras otro dispositivo registraba abonos. Revisa ambos registros.', entityIds: [entity.entityId, ...concurrent.map(op => op.entityId)] });
      }
    }
  }
  for (const closure of live(portfolio.closures)) {
    try { const report = periodReport(portfolio, closure.value.cardId, closure.value.from, closure.value.to, today);
      if (await sha256(report.fingerprintInput) !== closure.value.historyHash) issues.push({ message: 'El historial de un periodo cerrado cambió en otro dispositivo. Revisa los movimientos; reabre el cierre antes de volver a cerrarlo.', entityIds: [closure.id] });
    } catch { issues.push({ message: 'No se puede reconstruir un periodo cerrado con el historial recibido.', entityIds: [closure.id] }); }
  }
  return issues;
}
