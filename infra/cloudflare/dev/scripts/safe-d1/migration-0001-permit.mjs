import {existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody} from './windows-custody.mjs';
import {requireSafe,target} from './policy.mjs';
export const firstMigrationAuthorizationId='3e3bc6b0-b6dd-41be-98be-7e5910494a92';
export const firstMigrationApproved=false;
// Authorized 0001 completed. Keep its marker; any later operation needs approval.
export const firstMigrationVerifiedBaselineEnabled=false;
export const firstMigrationAttemptFile=resolve(custodyRoot,'migration-0001-'+firstMigrationAuthorizationId+'.attempt.json');
export const firstMigrationResultFile=resolve(custodyRoot,'migration-0001-'+firstMigrationAuthorizationId+'.result.json');
const permits=new WeakSet();
export function issueFirstMigrationPermit(){
 requireSafe(firstMigrationApproved,'migration_0001_not_authorized');verifyWindowsCustody();requireSafe(!existsSync(firstMigrationResultFile),'migration_0001_already_attempted');
 const fd=openSync(firstMigrationAttemptFile,'wx',0o600);try{writeFileSync(fd,JSON.stringify({authorizationId:firstMigrationAuthorizationId,target,allowedMigration:'0001_admin_catalog.sql',maximumWriteBatches:1,startedAt:new Date().toISOString()}));fsyncSync(fd);}finally{closeSync(fd);}
 const permit=Object.freeze({});permits.add(permit);return permit;
}
export const takeFirstMigrationPermit=permit=>permits.delete(permit);
