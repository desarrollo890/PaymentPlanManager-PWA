import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const schemas = Object.fromEntries(['operation', 'batch', 'encrypted-block'].map(name => [name,
  JSON.parse(readFileSync(new URL(`contracts/v1/${name}.schema.json`, root), 'utf8'))]));
for (const name of ['operation', 'batch']) schemas[name + 'V2'] = JSON.parse(readFileSync(new URL(`contracts/v2/${name}.schema.json`, root), 'utf8'));
const generated = '// Generated from contracts/v1. Do not edit.\nimport type { Schema } from \'./validation.ts\';\nexport const schemas: Readonly<Record<string, Schema>> = ' + JSON.stringify(schemas, null, 2) + ';\n';
const output = new URL('packages/contracts/src/schemas.ts', root);
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== generated) throw Error('Runtime schemas are stale');
} else writeFileSync(output, generated);
console.log('PASS: runtime schemas match contracts.');
