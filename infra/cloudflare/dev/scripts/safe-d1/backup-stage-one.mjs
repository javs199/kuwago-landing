import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,migrations,schemaHashes,approvedSources,digest,requireSafe} from './policy.mjs';
import {custodyRoot} from './windows-custody.mjs';
import {encryptedBackupPins} from './encrypted-backup-receipt.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
export const backupExpectedStage=1;
export const backupExpectedApplicationTables=Object.freeze([
 'principals','roles','permissions','role_permissions','principal_roles','categories','category_translations',
 'services','service_revisions','service_translations','option_identities','service_options','option_translations',
 'option_prices','media_assets','revision_media','revision_media_translations','commercial_approvals',
 'audit_events','publication_commands','publication_outbox',
].sort());
const approvalId='3e3bc6b0-b6dd-41be-98be-7e5910494a92';
export const stageOneEvidencePins=Object.freeze({
 report:resolve(root,'../../../docs/D1-MIGRATION-0001-FRESH-BASELINE-RESULT.md'),
 reportSha256:'00d846c7b9bcee5254ca5abc8cd6d5f12d79f4ce8b6c7f805d169ca0b08dc5b4',
 result:resolve(custodyRoot,`migration-0001-${approvalId}.result.json`),
 resultSha256:'7f87b9d972c28f17f6fe3f147c4201ac7e01830f16abce515c53cfda0e231474',
});
function checkedHash(file,hash,max){
 const stat=lstatSync(file);requireSafe(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'stage_one_evidence_invalid');
 const bytes=readFileSync(file);requireSafe(digest(bytes)===hash,'stage_one_evidence_hash_mismatch');return bytes;
}
// Read-only checks: never rewrite the approved report, result or original encrypted backup.
export function verifyStageOnePreparation(){
 approvedSources();
 checkedHash(stageOneEvidencePins.report,stageOneEvidencePins.reportSha256,100000);
 const result=JSON.parse(checkedHash(stageOneEvidencePins.result,stageOneEvidencePins.resultSha256,100000));
 requireSafe(result.authorizationId===approvalId&&result.status==='completed_0001_only'&&result.postflightVerified===true&&result.historyVerified===true&&result.schemaHash===schemaHashes[1]&&result.migrationSha256===migrations[0].sha256&&JSON.stringify(result.history)===JSON.stringify([{id:1,name:migrations[0].name}]),'stage_one_approval_invalid');
 checkedHash(encryptedBackupPins.file,encryptedBackupPins.ciphertextSha256,34000000);
 checkedHash(encryptedBackupPins.evidenceFile,encryptedBackupPins.evidenceSha256,16000);
 return Object.freeze({stage:1,target,schemaHash:schemaHashes[1],originalBackupUnchanged:true,priorPostflightVerified:true});
}
// The current fingerprint includes ledger timestamps and sequence. Capture it in a future
// authorized live preflight; never invent it from the schema hash or an offline fixture.
export function validateStageOneSnapshot(capture){
 requireSafe(capture.stage===1,'baseline_stage_mismatch');
 const tables=capture.snapshot.tables,application=tables.filter(t=>!['d1_migrations','sqlite_sequence'].includes(t.name));
 requireSafe(JSON.stringify(application.map(t=>t.name).sort())===JSON.stringify(backupExpectedApplicationTables),'stage_one_tables_mismatch');
 const ledger=tables.find(t=>t.name==='d1_migrations');
 requireSafe(ledger&&JSON.stringify(ledger.columns)===JSON.stringify(['id','name','applied_at'])&&ledger.rows.length===1,'stage_one_history_mismatch');
 const row=ledger.rows[0];
 requireSafe(row[0]==='integer:31'&&row[1]==='text:'+Buffer.from(migrations[0].name).toString('hex').toUpperCase()&&/^text:(?:[A-F0-9]{2})+$/.test(row[2])&&Number.isFinite(Date.parse(Buffer.from(row[2].slice(5),'hex').toString('utf8')+'Z')),'stage_one_history_mismatch');
 for(const table of application)if(!['roles','permissions','role_permissions'].includes(table.name))requireSafe(table.rows.length===0,'stage_one_unexpected_content');
 return Object.freeze({stage:1,applicationTables:application.length,historyEntries:1,sourceFingerprint:snapshotFingerprint(capture.snapshot)});
}
