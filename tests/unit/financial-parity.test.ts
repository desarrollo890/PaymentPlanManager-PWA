import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { emptyPortfolio, financeView } from '@paymentplan/domain';
import type { FinancialRecord, Portfolio } from '@paymentplan/domain';
import type { Balance, Card, Income, Installment, Loan, LoanPayment, Movement, Statement } from '@paymentplan/contracts';

type MutablePortfolio = { -readonly [K in keyof Portfolio]: Array<Portfolio[K][number]> };
interface Step { action: string; input: Record<string, string | number | boolean>; expected: unknown }
const fixture: { cases: { id: string; steps: Step[] }[] } = JSON.parse(readFileSync(new URL('../fixtures/financial-reference.v1.json', import.meta.url), 'utf8'));
const row = <T>(value: T): FinancialRecord<T> => ({ id: randomUUID(), value, voided: false });

for (const scenario of fixture.cases) test(`financial parity: every snapshot of .NET scenario ${scenario.id}`, () => {
  const p = emptyPortfolio() as MutablePortfolio;
  let today = '2026-10-03', sequence = 0;
  function stamp() { return { recordedAt: `2026-10-03T18:00:${(sequence++).toString().padStart(2, '0')}Z`, legacyOrdinal: null }; }
  for (const step of scenario.steps) {
    const i = step.input;
    const string = (key: string, fallback = '') => typeof i[key] === 'string' ? i[key] as string : fallback;
    const number = (key: string, fallback = 0) => typeof i[key] === 'number' ? i[key] as number : fallback;
    const card = p.cards.find(c => c.value.name === string('card'));
    const plan = p.installments.find(r => r.value.description === string('plan'));
    const loan = p.loans.find(r => r.value.person === string('person'));
    switch (step.action) {
      case 'createCard': {
        const card = row<Card>({ name: string('name'), bank: 'Banco', limitCents: number('limitCents'), cutDay: number('cutDay'), dueDay: number('dueDay'),
          dueMonthOffset: typeof i.dueMonthOffset === 'number' ? i.dueMonthOffset : null, color: '#234E70', initialDebtOrigin: 'currentPeriod', archived: false });
        p.cards.push(card); p.balances.push(row<Balance>({ cardId: card.id, date: string('date', today), availableCents: number('availableCents'),
          debtCents: number('debtCents'), includedMovementIds: [], interestIncluded: false, ...stamp() })); break;
      }
      case 'divideDebt': case 'purchaseInstallments': {
        assert(card); let purchaseId: string | null = null;
        if (step.action === 'purchaseInstallments') {
          const movement = row<Movement>({ cardId: card.id, date: string('date', today), amountCents: number('principalCents'), kind: 'expense',
            description: string('plan'), scheduled: false, reconciled: false, statementId: null, allocations: [], importReference: null, ...stamp() });
          p.movements.push(movement); purchaseId = movement.id;
        }
        p.installments.push(row<Installment>({ cardId: card.id, description: string('plan'), principalCents: number('principalCents'), months: number('months'),
          interestCents: number('interestCents'), startDate: today, firstCutDate: string('firstCut'), cutDay: card.value.cutDay, purchaseId,
          interestIncludedInDebt: false, interestIncorporatedThrough: null, amortization: null, ...stamp() })); break;
      }
      case 'editPlan': {
        assert(plan); const index = p.installments.findIndex(r => r.id === plan.id);
        p.installments[index] = { ...plan, value: { ...plan.value, principalCents: number('principalCents'), months: number('months'), interestCents: number('interestCents'), firstCutDate: string('firstCut') } }; break;
      }
      case 'recordExpense': case 'recordPayment': case 'schedulePayment': case 'payQuotaPrincipal': {
        assert(card); const amount = step.action === 'payQuotaPrincipal' ? number('principalCents') : number('amountCents');
        p.movements.push(row<Movement>({ cardId: card.id, date: string('date', today), amountCents: amount, kind: step.action === 'recordExpense' ? 'expense' : 'payment',
          description: 'Referencia', scheduled: step.action === 'schedulePayment', reconciled: false, statementId: null,
          allocations: step.action === 'payQuotaPrincipal' ? [{ planId: plan!.id, quotaNumber: number('quota'), principalCents: amount, interestCents: 0 }] : [],
          importReference: null, ...stamp() })); break;
      }
      case 'recordBankTarget': assert(card); p.statements.push(row<Statement>({ cardId: card.id, cutDate: string('cutDate'), dueDate: string('dueDate'), targetCents: number('targetCents'),
        minimumCents: 0, initialPaidCents: 0, reservedCents: 0, estimated: false, balanceReferenceDate: null, includedPaymentIds: [] })); break;
      case 'createLoan': p.loans.push(row<Loan>({ person: string('person'), description: 'Referencia', principalCents: number('principalCents'), balanceDate: string('date'), dueDate: string('dueDate'),
        includeReceivedMoney: Boolean(i.includeReceivedMoney), archived: false, ...stamp() })); break;
      case 'configureIncome': p.incomes.push(row<Income>({ income15Cents: number('income15Cents'), incomeEndCents: number('incomeEndCents'), expensesCents: number('expensesCents'), reserveCents: number('reserveCents') })); break;
      case 'payLoan': case 'scheduleLoanPayment': assert(loan); p.loanPayments.push(row<LoanPayment>({ loanId: loan.id, date: string('date'), amountCents: number('amountCents'),
        description: 'Referencia', scheduled: step.action === 'scheduleLoanPayment', ...stamp() })); break;
      case 'advanceClock': today = string('instant').slice(0, 10); break;
      case 'confirmLoanPayment': {
        assert(loan); const index = p.loanPayments.findIndex(a => a.value.loanId === loan.id && a.value.scheduled);
        const payment = p.loanPayments[index]!; p.loanPayments[index] = { ...payment, value: { ...payment.value, date: string('date'), scheduled: false } }; break;
      }
      default: throw Error(`Unsupported reference action ${step.action}`);
    }
    const view = financeView(p, today);
    const snapshot = { today: view.today, debtCents: view.debtCents, creditCents: view.creditCents, pendingCents: view.pendingCents, horizon: view.horizon,
      cards: view.cards.map(c => ({ name: c.name, debtCents: c.debtCents, availableCents: c.availableCents, installmentDebtCents: c.installmentDebtCents,
        freeDebtCents: c.freeDebtCents, movements: c.movements, cuts: c.cuts.map(s => ({ cutDate: s.cutDate, dueDate: s.dueDate, payday: s.payday,
          targetCents: s.targetCents, pendingCents: s.pendingCents, estimated: s.estimated, current: s.current })),
        plans: c.plans.map(r => ({ description: r.description, months: r.months, cancelled: r.cancelled, canEditAmounts: r.canEditAmounts,
          remainingCents: r.remainingCents, futureInterestCents: r.futureInterestCents, quotas: r.quotas.map(q => ({ number: q.number, cutDate: q.cutDate, dueDate: q.dueDate,
            principalCents: q.principalCents, interestCents: q.interestCents, principalPaidCents: q.principalPaidCents })) })),
        projections: c.projections.map(s => ({ cutDate: s.cutDate, dueDate: s.dueDate, payday: s.payday, pendingCents: s.pendingCents })) })),
      loans: view.loans.map(l => ({ person: l.person, balanceCents: l.balanceCents, paidCents: l.paidCents, scheduledCents: l.scheduledCents })),
      budgets: view.budgets.map(b => ({ payday: b.payday, pendingCents: b.pendingCents, loanPendingCents: b.loanPendingCents,
        receivedLoanCents: b.receivedLoanCents, loanPaidCents: b.loanPaidCents, balanceCents: b.balanceCents })) };
    assert.deepEqual(snapshot, step.expected, `${scenario.id} / ${step.action}`);
  }
});
