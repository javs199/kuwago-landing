import {existsSync} from 'node:fs';
import {completionApproved,completionId,completionPrefix,issueCompletionPermit} from './safe-d1/completion-permit.mjs';
import {loadCompletionBackup} from './safe-d1/completion-backup.mjs';
import {createCompletionJournal} from './safe-d1/completion-journal.mjs';
import {runCompletion} from './safe-d1/completion-runner.mjs';
import {createTransport} from './safe-d1/transport.mjs';
import {assertEnvironment,assertRuntime,approvedSources,requireSafe} from './safe-d1/policy.mjs';
const chunks=[];let bytes,token,transport;
try{
 requireSafe(completionApproved,'completion_not_authorized');requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');assertEnvironment(process.env);assertRuntime();approvedSources();
 requireSafe(!existsSync(completionPrefix+'.attempt.json')&&!existsSync(completionPrefix+'.result.json'),'completion_already_attempted');
 let size=0;for await(const p of process.stdin){chunks.push(p);size+=p.length;requireSafe(size<=4096,'private_input_limit');}bytes=Buffer.concat(chunks);const input=JSON.parse(bytes.toString('utf8'));requireSafe(Object.keys(input).join(',')==='token','private_input_invalid');token=input.token;input.token=undefined;
 const backup=await loadCompletionBackup(),permit=issueCompletionPermit();transport=createTransport(token,{migrationCompletionPermit:permit});token=undefined;
 const journal=createCompletionJournal({environment:'development',executionId:completionId}),result=await runCompletion({transport,backup,journal,executionId:completionId});
 const ok=result.status==='completed_0005_0006_only'&&result.closure?.stage6DurablyClosed===true;console.log(JSON.stringify({status:ok?'PASS':'FAIL',executionId:completionId}));process.exitCode=ok?0:2;
}catch{console.log(JSON.stringify({status:completionApproved?'FAIL':'BLOCKED',executionId:completionId}));process.exitCode=2;}
finally{transport?.dispose();token=undefined;requireSafe(token===undefined,'credential_cleanup_failed');bytes?.fill(0);for(const p of chunks)p.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}
