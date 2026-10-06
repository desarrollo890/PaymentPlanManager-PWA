// Generated from contracts/v1/*.schema.json. Do not edit.
// Runtime validation still enforces ranges, formats, conditional constraints and domain rules.

export type Uuid = string;

export type Date = string;

export type Instant = string;

export type Money = number;

export type SignedMoney = number;

export type Allocation = {
  readonly "planId": string;
  readonly "quotaNumber": number;
  readonly "principalCents": number;
  readonly "interestCents": number;
};

export type Card = {
  readonly "name": string;
  readonly "bank": string;
  readonly "limitCents": number;
  readonly "cutDay": number;
  readonly "dueDay": number;
  readonly "dueMonthOffset": (number) | (null);
  readonly "color": string;
  readonly "initialDebtOrigin": "unknown" | "currentPeriod" | "previousStatement";
  readonly "archived": boolean;
};

export type Balance = {
  readonly "cardId": string;
  readonly "date": string;
  readonly "availableCents": number;
  readonly "debtCents": number;
  readonly "includedMovementIds": ReadonlyArray<string>;
  readonly "interestIncluded": boolean;
  readonly "recordedAt": (string) | (null);
  readonly "legacyOrdinal": (number) | (null);
};

export type Movement = {
  readonly "cardId": string;
  readonly "date": string;
  readonly "amountCents": number;
  readonly "kind": "expense" | "payment" | "interest" | "fee";
  readonly "description": string;
  readonly "scheduled": boolean;
  readonly "reconciled": boolean;
  readonly "statementId": (string) | (null);
  readonly "allocations": ReadonlyArray<Allocation>;
  readonly "importReference": (string) | (null);
  readonly "recordedAt": (string) | (null);
  readonly "legacyOrdinal": (number) | (null);
};

export type Installment = {
  readonly "cardId": string;
  readonly "description": string;
  readonly "principalCents": number;
  readonly "months": number;
  readonly "interestCents": number;
  readonly "startDate": string;
  readonly "firstCutDate": string;
  readonly "cutDay": number;
  readonly "purchaseId": (string) | (null);
  readonly "interestIncludedInDebt": boolean;
  readonly "interestIncorporatedThrough": (string) | (null);
  readonly "amortization": ({
  readonly "method": "fixedPayment" | "fixedPrincipal" | "bankTable";
  readonly "monthlyRate": string;
  readonly "interestTaxRate": string;
  readonly "table": (ReadonlyArray<{
  readonly "principalCents": number;
  readonly "interestCents": number;
}>) | (null);
}) | (null);
  readonly "recordedAt": (string) | (null);
  readonly "legacyOrdinal": (number) | (null);
};

export type Statement = {
  readonly "cardId": string;
  readonly "cutDate": string;
  readonly "dueDate": string;
  readonly "targetCents": number;
  readonly "minimumCents": number;
  readonly "initialPaidCents": number;
  readonly "reservedCents": number;
  readonly "estimated": boolean;
  readonly "balanceReferenceDate": (string) | (null);
  readonly "includedPaymentIds": ReadonlyArray<string>;
};

export type Loan = {
  readonly "person": string;
  readonly "description": string;
  readonly "principalCents": number;
  readonly "balanceDate": string;
  readonly "dueDate": (string) | (null);
  readonly "includeReceivedMoney": boolean;
  readonly "archived": boolean;
  readonly "recordedAt": (string) | (null);
  readonly "legacyOrdinal": (number) | (null);
};

export type LoanPayment = {
  readonly "loanId": string;
  readonly "date": string;
  readonly "amountCents": number;
  readonly "description": string;
  readonly "scheduled": boolean;
  readonly "recordedAt": (string) | (null);
  readonly "legacyOrdinal": (number) | (null);
};

export type Income = {
  readonly "income15Cents": number;
  readonly "incomeEndCents": number;
  readonly "expensesCents": number;
  readonly "reserveCents": number;
};

export type Budget = {
  readonly "payday": string;
  readonly "expectedIncomeCents": number;
  readonly "receivedIncomeCents": (number) | (null);
  readonly "expensesCents": number;
  readonly "reserveCents": number;
  readonly "note": string;
};

export type ReminderPreferences = {
  readonly "enabled": boolean;
  readonly "daysBefore": number;
  readonly "cuts": boolean;
  readonly "payments": boolean;
};

export type ReminderState = {
  readonly "reminderKey": string;
  readonly "postponedUntil": (string) | (null);
};

export type Closure = {
  readonly "cardId": string;
  readonly "from": string;
  readonly "to": string;
  readonly "openingDebtCents": number;
  readonly "openingAvailableCents": number;
  readonly "paymentsCents": number;
  readonly "expensesCents": number;
  readonly "feesCents": number;
  readonly "interestCents": number;
  readonly "closingDebtCents": number;
  readonly "closingAvailableCents": number;
  readonly "bankDebtCents": (number) | (null);
  readonly "bankAvailableCents": (number) | (null);
  readonly "historyHash": string;
  readonly "recordedAt": (string) | (null);
  readonly "legacyOrdinal": (number) | (null);
};

export type Device = {
  readonly "label": string;
  readonly "retired": boolean;
};

export type OperationMetadata = {
  readonly "schemaVersion": 1;
  readonly "vaultId": string;
  readonly "operationId": string;
  readonly "entityId": string;
  readonly "deviceId": string;
  readonly "deviceSequence": number;
  readonly "parentRevisionIds": ReadonlyArray<string>;
  readonly "dependencyOperationIds": ReadonlyArray<string>;
  readonly "groupId": (string) | (null);
  readonly "groupIndex": number;
  readonly "groupSize": number;
  readonly "updatedAt": string;
};

export interface EntityPayloads {
  readonly card: Card;
  readonly balance: Balance;
  readonly movement: Movement;
  readonly installment: Installment;
  readonly statement: Statement;
  readonly loan: Loan;
  readonly loanPayment: LoanPayment;
  readonly income: Income;
  readonly budget: Budget;
  readonly reminderPreferences: ReminderPreferences;
  readonly reminderState: ReminderState;
  readonly closure: Closure;
  readonly device: Device;
}

export type EntityType = keyof EntityPayloads;
export type Operation = { [K in EntityType]: OperationMetadata & { readonly entityType: K } & (
  { readonly action: "create" | "replace" | "restore" | "resolve"; readonly payload: EntityPayloads[K] }
  | { readonly action: "void"; readonly payload: null }
) }[EntityType];

export type Batch = {
  readonly "schemaVersion": 1;
  readonly "vaultId": string;
  readonly "batchId": string;
  readonly "deviceId": string;
  readonly "operations": ReadonlyArray<Operation>;
};

export type EncryptedBlock = {
  readonly "schemaVersion": 1;
  readonly "vaultId": string;
  readonly "keyId": string;
  readonly "blockId": string;
  readonly "purpose": "batch" | "snapshot" | "dataKeyWrap" | "recoveryKeyWrap";
  readonly "algorithm": "AES-256-GCM";
  readonly "ivBase64": string;
  readonly "ciphertextBase64": string;
  readonly "kdf": (({
  readonly "algorithm": "PBKDF2-SHA256";
  readonly "iterations": number;
  readonly "saltBase64": string;
}) | ({
  readonly "algorithm": "Argon2id";
  readonly "version": 19;
  readonly "memoryKiB": number;
  readonly "passes": number;
  readonly "parallelism": 1;
  readonly "saltBase64": string;
})) | (null);
};
