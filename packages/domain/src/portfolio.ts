import type { Category, Classification, CategoryRule, CategoryBudget, Recurrence, Occurrence, CashAccount, CashEntry, SavingsGoal, SavingsEntry, Balance, Budget, Card, Closure, Income, Installment, Loan, LoanPayment, Movement, ReminderPreferences, ReminderState, Statement } from '@paymentplan/contracts';

// Resolved records, including tombstones needed to protect history and restoration.
export interface FinancialRecord<T> { readonly id: string; readonly value: T; readonly voided: boolean }
export interface Portfolio {
  readonly categories: readonly FinancialRecord<Category>[];
  readonly classifications: readonly FinancialRecord<Classification>[];
  readonly categoryRules: readonly FinancialRecord<CategoryRule>[];
  readonly categoryBudgets: readonly FinancialRecord<CategoryBudget>[];
  readonly recurrences: readonly FinancialRecord<Recurrence>[];
  readonly occurrences: readonly FinancialRecord<Occurrence>[];
  readonly cashAccounts: readonly FinancialRecord<CashAccount>[];
  readonly cashEntries: readonly FinancialRecord<CashEntry>[];
  readonly savingsGoals: readonly FinancialRecord<SavingsGoal>[];
  readonly savingsEntries: readonly FinancialRecord<SavingsEntry>[];
  readonly cards: readonly FinancialRecord<Card>[];
  readonly balances: readonly FinancialRecord<Balance>[];
  readonly movements: readonly FinancialRecord<Movement>[];
  readonly installments: readonly FinancialRecord<Installment>[];
  readonly statements: readonly FinancialRecord<Statement>[];
  readonly loans: readonly FinancialRecord<Loan>[];
  readonly loanPayments: readonly FinancialRecord<LoanPayment>[];
  readonly incomes: readonly FinancialRecord<Income>[];
  readonly budgets: readonly FinancialRecord<Budget>[];
  readonly closures: readonly FinancialRecord<Closure>[];
  readonly reminderPreferences: readonly FinancialRecord<ReminderPreferences>[];
  readonly reminderStates: readonly FinancialRecord<ReminderState>[];
}
export function emptyPortfolio(): Portfolio {
  return { categories: [], classifications: [], categoryRules: [], categoryBudgets: [], recurrences: [], occurrences: [], cashAccounts: [], cashEntries: [], savingsGoals: [], savingsEntries: [], cards: [], balances: [], movements: [], installments: [], statements: [], loans: [], loanPayments: [], incomes: [], budgets: [], closures: [], reminderPreferences: [], reminderStates: [] };
}
export function live<T>(records: readonly FinancialRecord<T>[]): FinancialRecord<T>[] { return records.filter(r => !r.voided); }
export function orderOf(value: { readonly recordedAt: string | null; readonly legacyOrdinal: number | null }): string {
  return value.recordedAt?.replace(/(?:\.(\d+))?Z$/, (_, fraction: string | undefined) => '.' + (fraction ?? '').replace(/0+$/, '').padEnd(7, '0') + 'Z')
    ?? `legacy:${(value.legacyOrdinal ?? Number.MAX_SAFE_INTEGER).toString().padStart(16, '0')}`;
}
