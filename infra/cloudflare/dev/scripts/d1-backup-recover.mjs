import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,verifyWindowsCustody,dpapi} from './safe-d1/windows-custody.mjs';
import {decryptEnvelope} from './safe-d1/encryption.mjs';
import {verifyRestorable} from './safe-d1/restore.mjs';
import {digest,requireSafe,target} from './safe-d1/policy.mjs';
// Recovery verification only. No SQL output, database connection or remote transport.
let bytes,sql,recoverySecret;
try{
 const id=process.argv[2],portable=process.argv.length===4&&process.argv[3]==='--recovery';
 requireSafe((process.argv.length===3||portable)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id),'operation_invalid');
 verifyWindowsCustody();const folder=resolve(custodyRoot,id),file=resolve(folder,'backup.kwgbak');requireSafe(!lstatSync(folder).isSymbolicLink(),'reparse_forbidden');const stat=lstatSync(file);requireSafe(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=34000000,'encrypted_file_invalid');
 if(portable){requireSafe(!process.stdin.isTTY,'private_pipe_required');let count=0;const chunks=[];for await(const part of process.stdin){count+=part.length;requireSafe(count<=4096,'recovery_input_limit');chunks.push(part);}const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));recoverySecret=Buffer.from(input.recoverySecretBase64,'base64');input.recoverySecretBase64=undefined;for(const part of chunks)part.fill(0);}
 const encrypted=readFileSync(file);bytes=await decryptEnvelope(encrypted,portable?{recoverySecret}:{protector:dpapi});const payload=JSON.parse(bytes.toString('utf8'));sql=Buffer.from(payload.sqlBase64,'base64');payload.sqlBase64=undefined;
 requireSafe(payload.operationId===id&&JSON.stringify(payload.target)===JSON.stringify(target)&&digest(sql)===payload.sqlSha256,'recovered_backup_invalid');const result=await verifyRestorable(sql,payload.sourceFingerprint);
 console.log(JSON.stringify({operationId:id,status:'verified_local_recovery',mode:JSON.parse(encrypted).header.mode??'legacy-local-proof',restoreVerified:result.ok,tables:result.tables,rows:result.rows}));
}catch{console.log(JSON.stringify({status:'recovery_failed'}));process.exitCode=2;}
finally{bytes?.fill(0);sql?.fill(0);recoverySecret?.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}
