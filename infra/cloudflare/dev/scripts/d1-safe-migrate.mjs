import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {assertEnvironment,remoteExecutionEnabled,root,requireSafe} from './safe-d1/policy.mjs';
import {createTransport} from './safe-d1/transport.mjs';
import {runMigration} from './safe-d1/runner.mjs';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let token=process.env.CLOUDFLARE_API_TOKEN,transport;
 try{
  requireSafe(process.argv.length===2,'arguments_forbidden');assertEnvironment(process.env);
  requireSafe(remoteExecutionEnabled,'remote_execution_not_authorized');
  delete process.env.CLOUDFLARE_API_TOKEN;transport=createTransport(token);token=undefined;
  const result=await runMigration({transport,evidenceDirectory:resolve(root,'.wrangler/safe-d1-development'),backupDirectory:resolve(homedir(),'AppData/Local/Kuwago/D1Backups/development')});
  console.log(JSON.stringify(result));process.exitCode=result.status==='completed'?0:2;
 }catch{console.log(JSON.stringify({status:'blocked',remoteExecutionEnabled:false}));process.exitCode=2;}
 finally{delete process.env.CLOUDFLARE_API_TOKEN;transport?.dispose();token=undefined;requireSafe(token===undefined,'credential_cleanup_failed');}
}
