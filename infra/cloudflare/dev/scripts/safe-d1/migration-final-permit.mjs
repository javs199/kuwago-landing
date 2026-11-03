import {existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
import {requireSafe,target,migrations} from './policy.mjs';
export const finalAuthorizationId='3771d065-f5e5-4bb0-b0fc-0091834f92c8';
// Attempt consumed: one 0004 batch accepted; postflight bookmark guard stopped the run.
export const finalApproved=false;
export const finalPrefix=resolve(custodyRoot,'migration-0004-0006-'+finalAuthorizationId);
const permits=new WeakSet();
export function issueFinalPermit(){
 requireSafe(finalApproved,'final_batch_not_authorized');verifyWindowsCustody();requireSafe(!existsSync(finalPrefix+'.result.json'),'final_batch_already_attempted');
 const fd=openSync(finalPrefix+'.attempt.json','wx',0o600);try{writeFileSync(fd,JSON.stringify({authorizationId:finalAuthorizationId,target,migrations:migrations.slice(3),maximumWriteBatches:3,startedAt:new Date().toISOString()}));fsyncSync(fd);}finally{closeSync(fd);}
 const permit=Object.freeze({});permits.add(permit);return permit;
}
export const takeFinalPermit=p=>permits.delete(p);
