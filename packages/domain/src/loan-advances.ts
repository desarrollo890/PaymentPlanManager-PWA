import type { Loan } from '@paymentplan/contracts';
import { live } from './portfolio.ts';
import type { Portfolio } from './portfolio.ts';
import { sumCents } from './money.ts';

// Un préstamo personal es una cuenta corriente con la persona: capital inicial más cada vez que te prestó de nuevo.
export function loanAdvancesTotal(p: Portfolio, loanId: string, today = '9999-12-31'): number {
  return sumCents(live(p.loanAdvances).filter(a => a.value.loanId === loanId && a.value.date <= today).map(a => a.value.amountCents));
}
export function personalCapital(p: Portfolio, loan: Loan, loanId: string, today = '9999-12-31'): number {
  return loan.principalCents + loanAdvancesTotal(p, loanId, today);
}
