import type { Batch, EncryptedBlock, EntityPayloads, EntityType, Operation } from './generated.ts';
import { schemas } from './schemas.ts';
export interface Schema {
  readonly $ref?: string; readonly $id?: string; readonly $defs?: Record<string, Schema>;
  readonly type?: string | readonly string[]; readonly const?: unknown; readonly enum?: readonly unknown[];
  readonly allOf?: readonly Schema[]; readonly anyOf?: readonly Schema[]; readonly oneOf?: readonly Schema[];
  readonly not?: Schema; readonly if?: Schema; readonly then?: Schema; readonly else?: Schema;
  readonly properties?: Record<string, Schema>; readonly required?: readonly string[]; readonly additionalProperties?: boolean;
  readonly items?: Schema; readonly minimum?: number; readonly maximum?: number;
  readonly minItems?: number; readonly maxItems?: number; readonly uniqueItems?: boolean;
  readonly minLength?: number; readonly maxLength?: number; readonly pattern?: string; readonly format?: string;
  readonly [key: string]: unknown;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
function validFormat(value: string, format: string): boolean {
  if (format === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(value + 'T00:00:00Z');
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
  }
  if (format === 'date-time') return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/.test(value)
    && validFormat(value.slice(0, 10), 'date') && Number.isFinite(Date.parse(value));
  throw Error(`Unsupported schema format ${format}`);
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function matches(value: unknown, schema: Schema, root: Schema): boolean {
  if (schema.$ref) {
    if (schema.$ref.startsWith('#/$defs/')) {
      const referred = root.$defs?.[schema.$ref.slice(8)];
      if (!referred) throw Error('Unknown schema reference'); return matches(value, referred, root);
    }
    const referred = Object.values(schemas).find(s => s.$id === schema.$ref);
    if (!referred) throw Error('Unknown schema reference'); return matches(value, referred, referred);
  }
  if ('const' in schema && canonical(value) !== canonical(schema.const)) return false;
  if (schema.enum && !schema.enum.some(item => canonical(item) === canonical(value))) return false;
  if (schema.allOf && !schema.allOf.every(s => matches(value, s, root))) return false;
  if (schema.anyOf && !schema.anyOf.some(s => matches(value, s, root))) return false;
  if (schema.oneOf && schema.oneOf.filter(s => matches(value, s, root)).length !== 1) return false;
  if (schema.not && matches(value, schema.not, root)) return false;
  if (schema.if) {
    const branch = matches(value, schema.if, root) ? schema.then : schema.else;
    if (branch && !matches(value, branch, root)) return false;
  }
  if (schema.type) {
    const types = typeof schema.type === 'string' ? [schema.type] : schema.type;
    if (!types.some(type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? object(value)
      : type === 'integer' ? Number.isSafeInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type)) return false;
  }
  if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) return false;
  if (typeof value === 'string') {
    const length = [...value].length;
    if ((schema.minLength !== undefined && length < schema.minLength) || (schema.maxLength !== undefined && length > schema.maxLength)
      || (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) || (schema.format && !validFormat(value, schema.format))) return false;
  }
  if (Array.isArray(value)) {
    if ((schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)
      || (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) || (schema.items && !value.every(item => matches(item, schema.items!, root)))) return false;
  }
  if (object(value)) {
    if (schema.required?.some(key => !Object.hasOwn(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !schema.properties || !Object.hasOwn(schema.properties, key))) return false;
    if (schema.properties) for (const [key, sub] of Object.entries(schema.properties)) if (Object.hasOwn(value, key) && !matches(value[key], sub, root)) return false;
  }
  return true;
}
export function assertOperation(value: unknown): asserts value is Operation {
  const root = object(value) && value.schemaVersion === 2 ? schemas.operationV2! : schemas.operation!;
  if (!matches(value, root, root)) throw Error('Operación inválida o versión de datos no compatible.');
  const op = value as Operation;
  if (op.groupId === null && (op.groupIndex !== 0 || op.groupSize !== 1)) throw Error('Grupo atómico inválido.');
  if (op.groupIndex >= op.groupSize) throw Error('Posición de grupo inválida.');
}
export function assertBatch(value: unknown): asserts value is Batch {
  const root = object(value) && value.schemaVersion === 2 ? schemas.batchV2! : schemas.batch!;
  if (!matches(value, root, root)) throw Error('Lote inválido o versión de datos no compatible.');
  const batch = value as Batch;
  for (const operation of batch.operations) {
    assertOperation(operation);
    if (operation.vaultId !== batch.vaultId || operation.deviceId !== batch.deviceId) throw Error('Identidad de lote inválida.');
  }
}
export function assertBlock(value: unknown): asserts value is EncryptedBlock {
  if (!matches(value, schemas['encrypted-block']!, schemas['encrypted-block']!)) throw Error('Bloque cifrado inválido o versión no compatible.');
}
export function assertPayload<K extends EntityType>(type: K, value: unknown): asserts value is EntityPayloads[K] {
  const root = schemas.operation!.$defs?.[type] ? schemas.operation! : schemas.operationV2!;
  const schema = root.$defs?.[type];
  if (!schema || !matches(value, schema, root)) throw Error(`Datos inválidos: ${type}.`);
}
