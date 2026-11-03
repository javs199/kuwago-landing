import {existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
import {requireSafe,target,migrations} from './policy.mjs';
export const batchAuthorizationId='96a25c8d-186f-4b67-9653-1b399294903f';
// Attempt consumed: 0002 and 0003 verified; stopped before writing 0004.
export const batchApproved=false;
export const batchPrefix=resolve(custodyRoot,'migration-0002-0006-'+batchAuthorizationId);
const permits=new WeakSet();
export function issueBatchPermit(){
 requireSafe(batchApproved,'batch_not_authorized');verifyWindowsCustody();requireSafe(!existsSync(batchPrefix+'.result.json'),'batch_already_attempted');
 const fd=openSync(batchPrefix+'.attempt.json','wx',0o600);
 try{writeFileSync(fd,JSON.stringify({authorizationId:batchAuthorizationId,target,migrations:migrations.slice(1),maximumWriteBatches:5,startedAt:new Date().toISOString()}));fsyncSync(fd);}finally{closeSync(fd);}
 const p=Object.freeze({});permits.add(p);return p;
}
export const takeBatchPermit=p=>permits.delete(p);
