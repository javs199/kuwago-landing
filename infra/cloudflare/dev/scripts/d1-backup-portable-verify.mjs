import {readFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {verifyPortableRecovery} from './safe-d1/portable-recovery.mjs';
import {requireSafe} from './safe-d1/policy.mjs';
import {decodeRecoverySecret} from './safe-d1/recovery-format.mjs';

// Path is non-secret. Recovery material is accepted only through a private pipe.
// This command never generates a real key or certifies its external custody.
let recoverySecret,inputBytes;
const chunks=[];
try{
 requireSafe(process.argv.length===3&&!process.stdin.isTTY,'private_pipe_and_file_required');
 const file=resolve(process.argv[2]);let ancestor=file;
 for(;;){const stat=lstatSync(ancestor);requireSafe(!stat.isSymbolicLink(),'reparse_forbidden');if(dirname(ancestor)===ancestor)break;ancestor=dirname(ancestor);}
 const stat=lstatSync(file);requireSafe(stat.isFile()&&stat.size>0&&stat.size<=34000000,'encrypted_file_invalid');
 let count=0;for await(const part of process.stdin){chunks.push(part);count+=part.length;requireSafe(count<=4096,'recovery_input_limit');}
 inputBytes=Buffer.concat(chunks);const input=JSON.parse(inputBytes.toString('utf8'));
 requireSafe(Object.keys(input).length===1,'recovery_input_invalid');
 recoverySecret=decodeRecoverySecret(input.recoverySecretBase64);input.recoverySecretBase64=undefined;
 const encrypted=readFileSync(file);requireSafe(encrypted.length===stat.size,'encrypted_file_changed');
 console.log(JSON.stringify(await verifyPortableRecovery(encrypted,recoverySecret)));
}catch{console.log(JSON.stringify({status:'portable_recovery_failed',externalCustodyVerified:false}));process.exitCode=2;}
finally{recoverySecret?.fill(0);inputBytes?.fill(0);for(const part of chunks)part.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}
