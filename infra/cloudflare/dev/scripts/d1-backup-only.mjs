import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {assertEnvironment,requireSafe,target} from './safe-d1/policy.mjs';
import {backupRemoteEnabled,createBackupTransport} from './safe-d1/backup-transport.mjs';
import {runBackupOnly} from './safe-d1/backup-only.mjs';
import {createEncryptedStore} from './safe-d1/encrypted-store.mjs';
import {custodyRoot,verifyWindowsCustody,dpapi} from './safe-d1/windows-custody.mjs';
export function syntheticFetch(url,options){
 const base=`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}`,bookmark='00000001-00000002-00000003-00000000000000000000000000000000';
 if(url===base)return Promise.resolve(Response.json({success:true,result:{uuid:target.id,name:target.name,version:'production'}}));
 if(url===base+'/time_travel/bookmark')return Promise.resolve(Response.json({success:true,result:{bookmark}}));
 if(url===base+'/export')return Promise.resolve(Response.json({success:true,result:{success:true,type:'export',status:'complete',at_bookmark:bookmark,result:{signed_url:'https://synthetic-local.r2.cloudflarestorage.com/proof.sql?X-Amz-Signature=synthetic'}}}));
 if(url.startsWith('https://synthetic-local.r2.cloudflarestorage.com/'))return Promise.resolve(new Response('PRAGMA defer_foreign_keys=TRUE;'));
 if(url===base+'/query'){const {sql}=JSON.parse(options.body);return Promise.resolve(Response.json({success:true,result:[{success:true,results:sql==='PRAGMA quick_check'?[{quick_check:'ok'}]:[]}]}));}
 return Promise.reject(Error('unexpected_simulated_request'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let token,secret,transport;
 try{
  const proof=process.argv.length===3&&process.argv[2]==='--local-proof';requireSafe(proof||process.argv.length===2,'arguments_forbidden');assertEnvironment(process.env);
  if(proof){token='synthetic_test_credential_not_real_12345';secret=randomBytes(32);transport=createBackupTransport(token,{simulationFetch:syntheticFetch});}
  else{
   requireSafe(backupRemoteEnabled,'remote_backup_not_authorized');
   requireSafe(!process.stdin.isTTY,'private_pipe_required');
   const chunks=[];let size=0;for await(const part of process.stdin){size+=part.length;requireSafe(size<=8192,'private_input_limit');chunks.push(part);}
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));token=input.token;secret=Buffer.from(input.recoverySecretBase64,'base64');input.token=undefined;input.recoverySecretBase64=undefined;for(const part of chunks)part.fill(0);
   transport=createBackupTransport(token);
  }
  token=undefined;delete process.env.CLOUDFLARE_API_TOKEN;
  const result=await runBackupOnly({transport,store:createEncryptedStore(custodyRoot,verifyWindowsCustody),protector:dpapi,recoverySecret:secret,mode:proof?'local-synthetic-proof':'remote-authorized'});
  console.log(JSON.stringify(result));process.exitCode=result.verified&&result.cleanupComplete?0:2;
 }catch{console.log(JSON.stringify({status:'blocked',remoteBackupEnabled:false}));process.exitCode=2;}
 finally{transport?.dispose();secret?.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;token=undefined;requireSafe(token===undefined,'credential_cleanup_failed');}
}
