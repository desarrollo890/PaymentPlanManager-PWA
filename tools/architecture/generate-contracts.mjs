import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../../contracts/v1/', import.meta.url));
const dialect = 'https://json-schema.org/draft/2020-12/schema';
const ref = name => ({ $ref: `#/$defs/${name}` });
const nullable = value => ({ anyOf: [value, { type: 'null' }] });
const array = (items, maxItems = 10000) => ({ type: 'array', items, maxItems });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const money = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const signedMoney = { type: 'integer', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', not: { const: '00000000-0000-0000-0000-000000000000' } };
const day = { type: 'integer', minimum: 1, maximum: 31 };
const date = { type: 'string', format: 'date', pattern: '^(19[0-9]{2}|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$' };
const instant = { type: 'string', format: 'date-time', pattern: 'Z$' };
const ids = { ...array(uuid), uniqueItems: true };
const legacyOrdinal = nullable({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const rate = { type: 'string', pattern: '^(?:(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,8})?|100(?:\.0{1,8})?)$' };
const defs = {
  uuid, date, instant, money, signedMoney,
  allocation: object({ planId: uuid, quotaNumber: { type: 'integer', minimum: 1, maximum: 120 }, principalCents: money, interestCents: money }),
  card: object({ name: text(100), bank: text(100), limitCents: money, cutDay: day, dueDay: day,
    dueMonthOffset: nullable({ type: 'integer', minimum: 0, maximum: 2 }),
    color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }, initialDebtOrigin: { enum: ['unknown', 'currentPeriod', 'previousStatement'] }, archived: { type: 'boolean' } }),
  balance: object({ cardId: uuid, date, availableCents: signedMoney, debtCents: signedMoney,
    includedMovementIds: ids, interestIncluded: { type: 'boolean' }, recordedAt: nullable(instant), legacyOrdinal }),
  movement: object({ cardId: uuid, date, amountCents: { ...money, minimum: 1 },
    kind: { enum: ['expense', 'payment', 'interest', 'fee'] }, description: text(300),
    scheduled: { type: 'boolean' }, reconciled: { type: 'boolean' }, statementId: nullable(uuid),
    allocations: array(ref('allocation'), 10000), importReference: nullable(text(200)), recordedAt: nullable(instant), legacyOrdinal }),
  installment: object({ cardId: uuid, description: text(300), principalCents: { ...money, minimum: 1 },
    months: { type: 'integer', minimum: 2, maximum: 120 }, interestCents: money,
    startDate: date, firstCutDate: date, cutDay: day, purchaseId: nullable(uuid),
    interestIncludedInDebt: { type: 'boolean' }, interestIncorporatedThrough: nullable(date),
    amortization: nullable(object({ method: { enum: ['fixedPayment', 'fixedPrincipal', 'bankTable'] },
      monthlyRate: rate, interestTaxRate: rate, table: nullable(array(object({ principalCents: money, interestCents: money }), 120)) })), recordedAt: nullable(instant), legacyOrdinal }),
  statement: object({ cardId: uuid, cutDate: date, dueDate: date, targetCents: money,
    minimumCents: money, initialPaidCents: money, reservedCents: money, estimated: { type: 'boolean' },
    balanceReferenceDate: nullable(date), includedPaymentIds: ids }),
  loan: object({ person: text(100), description: text(300), principalCents: { ...money, minimum: 1 },
    balanceDate: date, dueDate: nullable(date), includeReceivedMoney: { type: 'boolean' }, archived: { type: 'boolean' }, recordedAt: nullable(instant), legacyOrdinal }),
  loanPayment: object({ loanId: uuid, date, amountCents: { ...money, minimum: 1 }, description: text(300), scheduled: { type: 'boolean' }, recordedAt: nullable(instant), legacyOrdinal }),
  income: object({ income15Cents: money, incomeEndCents: money, expensesCents: money, reserveCents: money }),
  budget: object({ payday: date, expectedIncomeCents: money, receivedIncomeCents: nullable(money), expensesCents: money, reserveCents: money, note: { type: 'string', maxLength: 300 } }),
  reminderPreferences: object({ enabled: { type: 'boolean' }, daysBefore: { type: 'integer', minimum: 0, maximum: 30 }, cuts: { type: 'boolean' }, payments: { type: 'boolean' } }),
  reminderState: object({ reminderKey: text(200), postponedUntil: nullable(date) }),
  closure: object({ cardId: uuid, from: date, to: date, openingDebtCents: signedMoney, openingAvailableCents: signedMoney,
    paymentsCents: money, expensesCents: money, feesCents: money, interestCents: money,
    closingDebtCents: signedMoney, closingAvailableCents: signedMoney, bankDebtCents: nullable(signedMoney), bankAvailableCents: nullable(signedMoney),
    historyHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, recordedAt: nullable(instant), legacyOrdinal }),
  device: object({ label: text(100), retired: { type: 'boolean' } })
};
const entityTypes = Object.keys(defs).filter(name => !['uuid', 'date', 'instant', 'money', 'signedMoney', 'allocation'].includes(name));
for (const value of Object.values(defs)) if (value.properties?.recordedAt)
  value.allOf = [{ if: { properties: { recordedAt: { type: 'null' } } }, then: { properties: { legacyOrdinal: { type: 'integer' } } } }];
const operation = {
  $schema: dialect, $id: 'urn:paymentplan:operation:v1', title: 'PaymentPlan operation v1',
  ...object({ schemaVersion: { const: 1 }, vaultId: uuid, operationId: uuid, entityId: uuid,
    entityType: { enum: entityTypes }, deviceId: uuid, deviceSequence: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    parentRevisionIds: ids, dependencyOperationIds: ids, groupId: nullable(uuid),
    groupIndex: { type: 'integer', minimum: 0, maximum: 9999 }, groupSize: { type: 'integer', minimum: 1, maximum: 10000 },
    action: { enum: ['create', 'replace', 'void', 'restore', 'resolve'] }, updatedAt: instant,
    payload: { type: ['object', 'null'] } }),
  allOf: [
    { if: { properties: { action: { const: 'create' } } }, then: { properties: { parentRevisionIds: { type: 'array', maxItems: 0 } } }, else: { properties: { parentRevisionIds: { type: 'array', minItems: 1 } } } },
    { if: { properties: { action: { const: 'resolve' } } }, then: { properties: { parentRevisionIds: { type: 'array', minItems: 2 } } } },
    { if: { properties: { action: { const: 'void' } } }, then: { properties: { payload: { type: 'null' } } }, else: {
      oneOf: entityTypes.map(name => ({ properties: { entityType: { const: name }, payload: ref(name) } })) } },
    { if: { properties: { groupId: { type: 'null' } } }, then: { properties: { groupIndex: { const: 0 }, groupSize: { const: 1 } } } }
  ], $defs: defs
};
const batch = { $schema: dialect, $id: 'urn:paymentplan:batch:v1', title: 'PaymentPlan decrypted batch v1',
  ...object({ schemaVersion: { const: 1 }, vaultId: uuid, batchId: uuid, deviceId: uuid,
    operations: { ...array({ $ref: operation.$id }, 1000), minItems: 1 } }) };
const envelope = { $schema: dialect, $id: 'urn:paymentplan:encrypted-block:v1', title: 'PaymentPlan encrypted block v1',
  ...object({ schemaVersion: { const: 1 }, vaultId: uuid, keyId: uuid, blockId: uuid,
    purpose: { enum: ['batch', 'snapshot', 'dataKeyWrap', 'recoveryKeyWrap'] },
    algorithm: { const: 'AES-256-GCM' }, ivBase64: { type: 'string', pattern: '^[A-Za-z0-9+/]{16}$' },
    ciphertextBase64: { type: 'string', minLength: 24, maxLength: 1400000, pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' },
    kdf: nullable({ oneOf: [
      object({ algorithm: { const: 'PBKDF2-SHA256' }, iterations: { type: 'integer', minimum: 600000, maximum: 2000000 }, saltBase64: { type: 'string', pattern: '^[A-Za-z0-9+/]{22}==$' } }),
      object({ algorithm: { const: 'Argon2id' }, version: { const: 19 }, memoryKiB: { type: 'integer', minimum: 19456, maximum: 65536 }, passes: { type: 'integer', minimum: 2, maximum: 6 }, parallelism: { const: 1 }, saltBase64: { type: 'string', pattern: '^[A-Za-z0-9+/]{22}==$' } })
    ] }) }),
  allOf: [{ if: { properties: { purpose: { const: 'dataKeyWrap' } } }, then: { properties: { kdf: { type: 'object' } } }, else: { properties: { kdf: { type: 'null' } } } }]
};
mkdirSync(output, { recursive: true });
for (const [name, value] of Object.entries({ operation, batch, 'encrypted-block': envelope }))
  writeFileSync(`${output}/${name}.schema.json`, JSON.stringify(value, null, 2) + '\n');
console.log(`PASS: generated three v1 schemas and ${entityTypes.length} entity payloads.`);
