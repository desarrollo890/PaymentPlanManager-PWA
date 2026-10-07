import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(`contracts/v1/${name}.schema.json`, root), 'utf8'));
const operation = read('operation');
const extension = JSON.parse(readFileSync(new URL('contracts/v2/operation.schema.json', root), 'utf8'));
const batch = read('batch'); batch.properties.schemaVersion = { enum: [1, 2] };
const alias = name => name[0].toUpperCase() + name.slice(1);
function emit(schema) {
  if (schema.$ref) {
    if (schema.$ref === operation.$id) return 'Operation';
    if (schema.$ref.startsWith('#/$defs/')) return alias(schema.$ref.slice(8));
    throw new Error(`Unknown schema reference: ${schema.$ref}`);
  }
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map(x => JSON.stringify(x)).join(' | ');
  if (schema.anyOf || schema.oneOf) return (schema.anyOf ?? schema.oneOf).map(x => `(${emit(x)})`).join(' | ');
  if (Array.isArray(schema.type)) return schema.type.map(type => emit({ ...schema, type })).join(' | ');
  switch (schema.type) {
    case 'null': return 'null';
    case 'string': return 'string';
    case 'integer': case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return `ReadonlyArray<${emit(schema.items)}>`;
    case 'object':
      if (!schema.properties) return 'Readonly<Record<string, unknown>>';
      return '{\n' + Object.entries(schema.properties).map(([name, value]) =>
        `  readonly ${JSON.stringify(name)}${schema.required?.includes(name) ? '' : '?'}: ${emit(value)};`).join('\n') + '\n}';
    default: throw new Error('Unsupported schema shape');
  }
}
const types = [...operation.properties.entityType.enum, ...extension.properties.entityType.enum];
operation.properties.schemaVersion = { enum: [1, 2] };
Object.assign(operation.$defs, extension.$defs);
const metadata = { ...operation, properties: Object.fromEntries(Object.entries(operation.properties).filter(([key]) => !['entityType', 'payload', 'action'].includes(key))) };
let result = '// Generated from contracts/v1 and contracts/v2 schemas. Do not edit.\n';
result += '// Runtime validation still enforces ranges, formats, conditional constraints and domain rules.\n\n';
for (const [name, value] of Object.entries(operation.$defs)) result += `export type ${alias(name)} = ${emit(value)};\n\n`;
result += `export type OperationMetadata = ${emit(metadata)};\n\n`;
result += 'export interface EntityPayloads {\n' + types.map(name => `  readonly ${name}: ${alias(name)};`).join('\n') + '\n}\n\n';
result += 'export type EntityType = keyof EntityPayloads;\n';
result += 'export type Operation = { [K in EntityType]: OperationMetadata & { readonly entityType: K } & (\n';
result += '  { readonly action: "create" | "replace" | "restore" | "resolve"; readonly payload: EntityPayloads[K] }\n';
result += '  | { readonly action: "void"; readonly payload: null }\n';
result += ') }[EntityType];\n\n';
result += `export type Batch = ${emit(batch)};\n\n`;
result += `export type EncryptedBlock = ${emit(read('encrypted-block'))};\n`;
const target = new URL('packages/contracts/src/generated.ts', root);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== result) throw new Error('Contract types are stale. Run npm run contracts:generate.');
  console.log('PASS: TypeScript contracts match v1 schemas.');
} else {
  writeFileSync(target, result);
  console.log(`PASS: generated ${types.length} entity types in ${fileURLToPath(target)}.`);
}
