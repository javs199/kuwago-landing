import {existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
import {target,migrations,requireSafe} from './policy.mjs';
export const completionId='3b4f39d1-2271-45e8-92fe-27ae04e7f14e';
// Authorized attempt completed with durable stage-6 closure. Preserve its markers.
export const completionApproved=false;
export const completionPrefix=resolve(custodyRoot,'migration-0005-0006-'+completionId);
const permits=new WeakMap();
export function issueCompletionPermit(){
 requireSafe(completionApproved,'completion_not_authorized');verifyWindowsCustody();requireSafe(!existsSync(completionPrefix+'.result.json'),'completion_already_attempted');
 const scope=Object.freeze({environment:'development',executionId:completionId,firstStage:4,lastStage:5});
 const fd=openSync(completionPrefix+'.attempt.json','wx',0o600);try{writeFileSync(fd,JSON.stringify({target,...scope,migrations:migrations.slice(4),maximumWriteBatches:2,startedAt:new Date().toISOString()}));fsyncSync(fd);}finally{closeSync(fd);}
 const p=Object.freeze({});permits.set(p,scope);return p;
}
export function takeCompletionPermit(p){const scope=permits.get(p);permits.delete(p);return scope;}
