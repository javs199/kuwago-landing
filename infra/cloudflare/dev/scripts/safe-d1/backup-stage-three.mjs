import {readFileSync,lstatSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,migrations,schemaHashes,schemaDigest,approvedSources,digest,requireSafe} from './policy.mjs';
import {custodyRoot} from './windows-custody.mjs';
import {backupExpectedApplicationTables as stageOneTables,verifyStageOnePreparation} from './backup-stage-one.mjs';
import {batchBackupPins} from './batch-backup-receipt.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
export const backupExpectedStage=3;
export const backupExpectedApplicationTables=Object.freeze([...stageOneTables,'admin_role_definitions','admin_role_permissions','administrator_roles'].sort());
export const backupExpectedHistory=Object.freeze(migrations.slice(0,3).map(m=>m.name));
const priorId='96a25c8d-186f-4b67-9653-1b399294903f',prefix=resolve(custodyRoot,'migration-0002-0006-'+priorId);
export const stageThreeEvidencePins=Object.freeze({reportSha256:'bfdd47e6941216c101cfb829587454d4faf658783b1b3162a164f3b24d9674d2',resultSha256:'8d4410b2dae23af05ce063814152c5f2562d8d2213ab21757323a136a509d5f2'});
function checked(file,hash,max){const stat=lstatSync(file);requireSafe(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'stage_three_evidence_invalid');const bytes=readFileSync(file);requireSafe(digest(bytes)===hash,'stage_three_evidence_hash_mismatch');return bytes;}
export function verifyStageThreePreparation(){
 approvedSources();verifyStageOnePreparation();
 checked(resolve(root,'../../../docs/D1-MIGRATIONS-0002-0006-REMOTE-RESULT.md'),stageThreeEvidencePins.reportSha256,100000);
 const r=JSON.parse(checked(prefix+'.result.json',stageThreeEvidencePins.resultSha256,200000));
 requireSafe(r.authorizationId===priorId&&r.status==='stopped_review_required'&&r.errorCode==='live_baseline_concurrent_bookmark_change'&&r.writeAttempts===2&&r.stages?.length===2&&r.stages.every((s,i)=>s.migration===migrations[i+1].name&&s.migrationSha256===migrations[i+1].sha256&&s.schemaHash===schemaHashes[i+2]&&s.postflightVerified===true)&&JSON.stringify(r.stages[1].history)===JSON.stringify(migrations.slice(0,3).map((m,i)=>({id:i+1,name:m.name}))),'stage_three_approval_invalid');
 for(const stage of [3,4,5])requireSafe(!existsSync(prefix+`.stage-${stage}.started.json`)&&!existsSync(prefix+`.stage-${stage}.verified.json`),'unexpected_later_stage_evidence');
 checked(resolve(custodyRoot,batchBackupPins.operationId,'backup.kwgbak'),batchBackupPins.ciphertextSha256,34000000);
 checked(resolve(custodyRoot,batchBackupPins.operationId,'evidence.json'),batchBackupPins.evidenceSha256,16000);
 return Object.freeze({stage:3,target,schemaHash:schemaHashes[3],applicationTables:24,history:[...backupExpectedHistory],previousBackupsUnchanged:true,priorPostflightVerified:true,fingerprintPolicy:'capture-stable-full-snapshot-and-verify-exact-restore',historicalFullFingerprintAvailable:false});
}
export function validateStageThreeSnapshot(capture){
 requireSafe(capture.stage===3,'baseline_stage_mismatch');
 const {schema,tables}=capture.snapshot;
 requireSafe(schemaDigest(schema.filter(r=>r.name!=='d1_migrations'))===schemaHashes[3],'stage_three_schema_mismatch');
 const app=tables.filter(t=>!['d1_migrations','sqlite_sequence'].includes(t.name));
 requireSafe(JSON.stringify(app.map(t=>t.name).sort())===JSON.stringify(backupExpectedApplicationTables),'stage_three_tables_mismatch');
 const ledger=tables.find(t=>t.name==='d1_migrations');requireSafe(ledger&&JSON.stringify(ledger.columns)===JSON.stringify(['id','name','applied_at'])&&ledger.rows.length===3,'stage_three_history_mismatch');
 for(let i=0;i<3;i++){
  const row=ledger.rows[i],stamp=typeof row[2]==='string'&&/^text:(?:[A-F0-9]{2})+$/.test(row[2])?Buffer.from(row[2].slice(5),'hex').toString('utf8'):'';
  requireSafe(row[0]==='integer:'+Buffer.from(String(i+1)).toString('hex').toUpperCase()&&row[1]==='text:'+Buffer.from(migrations[i].name).toString('hex').toUpperCase()&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp)&&Number.isFinite(Date.parse(stamp+'Z')),'stage_three_history_mismatch');
 }
 const seeded=new Set(['roles','permissions','role_permissions','admin_role_definitions','admin_role_permissions']);
 for(const t of app)if(!seeded.has(t.name))requireSafe(t.rows.length===0,'stage_three_unexpected_content');
 return Object.freeze({stage:3,applicationTables:24,historyEntries:3,sourceFingerprint:snapshotFingerprint(capture.snapshot)});
}
