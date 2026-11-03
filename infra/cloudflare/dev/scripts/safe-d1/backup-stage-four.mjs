import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {target,migrations,schemaHashes,schemaDigest,approvedSources,digest,requireSafe} from './policy.mjs';
import {custodyRoot} from './windows-custody.mjs';
import {backupExpectedApplicationTables as stageThreeTables,verifyStageThreePreparation} from './backup-stage-three.mjs';
import {finalBackupPins} from './final-backup-receipt.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
export const backupExpectedStage=4;
export const backupExpectedApplicationTables=Object.freeze([...stageThreeTables,'catalog_state','mutation_guards'].sort());
export const backupExpectedHistory=Object.freeze(migrations.slice(0,4).map(m=>m.name));
export const expectedStageFourFingerprint='df24b03cf675ef1cebb593888fbcc5f4e5765aed84f061fe358e6b344de1c010';
const auditId='597b711f-55c9-432d-945d-12eaa3ac5cae',prefix=resolve(custodyRoot,'stage4-audit-'+auditId);
export const stageFourReconciliationPins=Object.freeze({resultSha256:'e333b4aa7087f27d39431973085e7f0b552336c31225e3a472f399244c61d522',privateSha256:'355b38a94898037f47f2aa6de388f5df3bf502fad65b6ec5eab5aad3185cbb02'});
function checked(file,hash,max){const s=lstatSync(file);requireSafe(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max,'stage_four_preparation_invalid');const bytes=readFileSync(file);requireSafe(digest(bytes)===hash,'stage_four_preparation_hash_mismatch');return bytes;}
export function verifyStageFourPreparation(){
 approvedSources();verifyStageThreePreparation();const r=JSON.parse(checked(prefix+'.result.json',stageFourReconciliationPins.resultSha256,150000));checked(prefix+'.private.json',stageFourReconciliationPins.privateSha256,30000);
 requireSafe(r.auditId===auditId&&r.confirmed===true&&r.status==='confirmed_stage4'&&r.bookmarkStable===true&&r.logicalMatch===true&&r.currentFingerprint===expectedStageFourFingerprint&&r.expectedFingerprint===expectedStageFourFingerprint&&r.schemaHash===schemaHashes[4]&&r.registeredSqlHash===migrations[3].sha256&&JSON.stringify(r.target)===JSON.stringify(target)&&JSON.stringify(r.history)===JSON.stringify(migrations.slice(0,4).map((m,i)=>({id:i+1,name:m.name}))),'stage_four_reconciliation_invalid');
 checked(resolve(custodyRoot,finalBackupPins.operationId,'backup.kwgbak'),finalBackupPins.ciphertextSha256,34000000);checked(resolve(custodyRoot,finalBackupPins.operationId,'evidence.json'),finalBackupPins.evidenceSha256,16000);
 return Object.freeze({stage:4,target,schemaHash:schemaHashes[4],expectedFingerprint:expectedStageFourFingerprint,applicationTables:26,history:[...backupExpectedHistory],priorBackupsUnchanged:true,reconciliationVerified:true});
}
export function validateStageFourSnapshot(capture){
 requireSafe(capture.stage===4,'baseline_stage_mismatch');const {schema,tables}=capture.snapshot;
 requireSafe(schemaDigest(schema.filter(r=>r.name!=='d1_migrations'))===schemaHashes[4],'stage_four_schema_mismatch');const app=tables.filter(t=>!['d1_migrations','sqlite_sequence'].includes(t.name));
 requireSafe(JSON.stringify(app.map(t=>t.name).sort())===JSON.stringify(backupExpectedApplicationTables),'stage_four_tables_mismatch');
 requireSafe(snapshotFingerprint(capture.snapshot)===expectedStageFourFingerprint,'stage_four_fingerprint_mismatch');
 return Object.freeze({stage:4,applicationTables:26,historyEntries:4,sourceFingerprint:expectedStageFourFingerprint});
}
