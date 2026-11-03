import {readFileSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {target,digest,requireSafe,assertEnvironment,assertRuntime,root,schemaQuery} from './safe-d1/policy.mjs';
import {captureDatabase,isBackupRead} from './safe-d1/snapshot.mjs';
import {allowedReadSql} from './safe-d1/read.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './safe-d1/windows-custody.mjs';
import {decryptEnvelope} from './safe-d1/encryption.mjs';
import {verifyRestorable} from './safe-d1/restore.mjs';
import {migrationPlan,runPolicyMigration,localSnapshot} from './single-operator-migration.mjs';
import {DatabaseSync} from 'node:sqlite';
import {validateCurrentAdminSnapshot} from './safe-d1/backup-current-admin.mjs';
import {protectBookmark} from './safe-d1/bookmark-protection.mjs';
export const policyMigrationApproved=false;
export const executionId='a87aff45-588a-489a-9888-f15051a00ccc';
const prefix=resolve(custodyRoot,'policy7-'+executionId),sqlPath=resolve(root,'../../../packages/database/migrations/0007_single_operator_approval.sql');
const migrationSha='9faa376529152202d4df5f2c052c0fcaf2f8849cb6513c1e0b904188731074d9';
const backupOperation='c1763339-d083-45d7-9e81-934ee8da840a',cipherSha='cbaddebd53928bb23e4cc214c1ab5a687de396ef1b2b5dfdf738d76c637bb363';
const chunks=[];let token,input,bytes,payload,restoredSql,transport;let attempt=false,sendCount=0;
const journal=(name,value)=>{const file=prefix+'.'+name+'.json',body=JSON.stringify(value,null,2),fd=openSync(file,'wx',0o600);try{writeFileSync(fd,body);fsyncSync(fd);}finally{closeSync(fd);}requireSafe(digest(readFileSync(file))===digest(body),'journal_persistence_failed');};
try{
 requireSafe(policyMigrationApproved&&process.argv.length===2&&!process.stdin.isTTY,'private_authorized_pipe_required');assertEnvironment(process.env);assertRuntime();verifyWindowsCustody();
 requireSafe(!existsSync(prefix+'.attempt.json')&&!existsSync(prefix+'.result.json'),'attempt_consumed');
 const sql=readFileSync(sqlPath,'utf8');requireSafe(digest(sql)===migrationSha,'migration_changed');
 const sources=['scripts/d1-policy-migration-private.mjs','scripts/single-operator-migration.mjs','scripts/safe-d1/snapshot.mjs'].map(p=>resolve(root,p));
 const sourceHash=()=>digest(JSON.stringify(sources.map(p=>digest(readFileSync(p))))),pinnedSourceHash=sourceHash();
 const artifact=readFileSync(resolve(custodyRoot,backupOperation,'backup.kwgbak'));requireSafe(digest(artifact)===cipherSha,'backup_cipher_changed');
 const evidence=JSON.parse(readFileSync(resolve(custodyRoot,backupOperation,'evidence.json'),'utf8'));requireSafe(evidence.restoreVerified===true&&evidence.operationId===backupOperation&&evidence.encryptedSha256===cipherSha,'backup_evidence_invalid');
 payload=await decryptEnvelope(artifact,{protector:dpapi});const backup=JSON.parse(payload.toString('utf8'));restoredSql=Buffer.from(backup.sqlBase64,'base64');backup.sqlBase64=undefined;
 requireSafe(backup.operationId===backupOperation&&JSON.stringify(backup.target)===JSON.stringify(target)&&digest(restoredSql)===backup.sqlSha256,'backup_payload_invalid');await verifyRestorable(restoredSql,backup.sourceFingerprint);
 const db=new DatabaseSync(':memory:');let baseline;try{db.exec('BEGIN;PRAGMA defer_foreign_keys=ON;');db.exec(restoredSql.toString('utf8'));db.exec('COMMIT');baseline=localSnapshot(db);}finally{db.close();}
 validateCurrentAdminSnapshot({stage:6,snapshot:baseline});
 const plan=migrationPlan({backupSql:restoredSql.toString('utf8'),baseline,sql,executionId});
 let count=0;for await(const part of process.stdin){count+=part.length;requireSafe(count<=4096,'input_limit');chunks.push(part);}bytes=Buffer.concat(chunks);input=JSON.parse(bytes.toString('utf8'));requireSafe(Object.keys(input).join(',')==='token'&&/^[-_A-Za-z0-9]{20,256}$/.test(input.token),'credential_invalid');token=input.token;input.token=undefined;input=undefined;
 journal('attempt',{executionId,target,backupOperation,cipherSha,migrationSha,pinnedSourceHash,startedAt:new Date().toISOString(),maximumWrites:1});attempt=true;
 const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`;
 async function api(path,body){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(30000),...(body?{body:JSON.stringify(body)}:{})});
  const json=await response.json();requireSafe(response.ok&&json.success===true,'request_rejected');return json.result;
 }
 transport={
  metadata:()=>api(''),
  select:async sql=>{requireSafe(allowedReadSql.includes(sql)||isBackupRead(sql),'read_forbidden');const rows=await api('/query',{sql,params:[]});requireSafe(rows.length===1&&rows[0].success===true,'read_invalid');return rows[0].results;},
  bookmark:async()=>{const value=(await api('/time_travel/bookmark')).bookmark;requireSafe(typeof value==='string'&&value.length<256,'bookmark_invalid');return value;},
  snapshot:()=>captureDatabase(transport,{requireApproved:false}),
  schemaRows:()=>transport.select(schemaQuery),
  apply:async batch=>{requireSafe(sendCount===0&&batch===plan.batch&&sourceHash()===pinnedSourceHash&&digest(readFileSync(sqlPath))===migrationSha,'write_scope_invalid');sendCount++;const rows=await api('/query',{batch});requireSafe(rows.length===batch.length&&rows.every(r=>r.success===true),'ambiguous_batch_response');},
 };
 const bookmark=await transport.bookmark();journal('recovery',{backupOperation,bookmarkSha256:digest(bookmark),bookmarkDpapi:await protectBookmark(bookmark,dpapi),protection:'DPAPI CurrentUser, BKM1 32-byte encoding',observedAt:new Date().toISOString()});
 const result=await runPolicyMigration({plan,transport,journal});result.sendCount=sendCount;result.authorizationId=executionId;
 journal('result',result);console.log(JSON.stringify({status:result.status,authorizationId:executionId,sendCount}));process.exitCode=result.status==='PASS'?0:2;
}catch{
 if(attempt&&!existsSync(prefix+'.result.json'))try{journal('result',{status:'STOPPED',authorizationId:executionId,sendCount,meaning:sendCount?'Outcome requires read-only reconciliation; never replay':'No mutating fetch invoked'});}catch{/* preserve prior evidence */}
 console.log(JSON.stringify({status:'FAIL',authorizationId:executionId,sendCount}));process.exitCode=2;
}finally{token=undefined;input=undefined;requireSafe(token===undefined&&input===undefined,'reference_cleanup_failed');bytes?.fill(0);payload?.fill(0);restoredSql?.fill(0);for(const p of chunks)p.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}

