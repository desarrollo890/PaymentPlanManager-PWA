import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertOperation } from '@paymentplan/contracts';
const require = createRequire(import.meta.url), Ajv = require('../../tools/architecture/node_modules/ajv/dist/2020.js'), addFormats = require('../../tools/architecture/node_modules/ajv-formats');
const ajv = new Ajv({strict:false,allErrors:true});addFormats(ajv);const validate=ajv.compile(JSON.parse(readFileSync(new URL('../../contracts/v1/operation.schema.json',import.meta.url),'utf8')));
test('bounded browser schema interpreter agrees with Ajv on operation actions, financial payloads and invalid mutations',()=>{
  const op = {schemaVersion:1,vaultId:randomUUID(),operationId:randomUUID(),entityId:randomUUID(),entityType:'movement',deviceId:randomUUID(),deviceSequence:1,parentRevisionIds:[],dependencyOperationIds:[],groupId:null,groupIndex:0,groupSize:1,updatedAt:'2026-10-03T12:00:00.1234567Z',action:'create',payload:{cardId:randomUUID(),date:'2026-10-03',amountCents:10000,kind:'payment',description:'Synthetic',scheduled:false,reconciled:false,statementId:null,allocations:[],importReference:null,recordedAt:null,legacyOrdinal:0}};
  const cases: unknown[]=[op,{...op,action:'void',parentRevisionIds:[randomUUID()],payload:null},{...op,action:'resolve',parentRevisionIds:[randomUUID(),randomUUID()]},{...op,action:'restore',parentRevisionIds:[randomUUID()]},
    {...op,schemaVersion:2},{...op,extra:true},{...op,payload:{...op.payload,amountCents:.1}},{...op,payload:{...op.payload,date:'2026-02-30'}},{...op,payload:{...op.payload,legacyOrdinal:null}},{...op,action:'void'},
    {...op,action:'resolve',parentRevisionIds:[randomUUID()]},{...op,entityType:'card',payload:{name:'Synthetic',bank:'Bank',limitCents:10000,cutDay:31,dueDay:10,dueMonthOffset:1,color:'#234E70',initialDebtOrigin:'currentPeriod',archived:false}},
    {...op,entityType:'income',payload:{income15Cents:10000,incomeEndCents:10000,expensesCents:0,reserveCents:0}}];
  for(const value of cases){const expected=Boolean(validate(value));let actual=true;try{assertOperation(value)}catch{actual=false}assert.equal(actual,expected,JSON.stringify(value));}
});
