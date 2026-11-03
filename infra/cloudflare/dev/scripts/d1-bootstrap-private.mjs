// Future private stdin entry point. Current release exits BLOCKED before reading
// credentials, requesting JWKS, consulting D1 or writing an attempt marker.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {bootstrapExecutionApproved,issueBootstrapPreflightPermit,issueBootstrapPermit,scopeForBootstrap} from './safe-d1/bootstrap-permit.mjs';
import {root,assertEnvironment,assertRuntime,approvedSources,requireSafe} from './safe-d1/policy.mjs';
import {verifyBootstrapRecipient,prepareSingleOperatorBootstrap} from './single-operator-bootstrap.mjs';
import {loadBootstrapRecovery,bootstrapRecoveryState} from './safe-d1/bootstrap-recovery.mjs';
import {createReader} from './safe-d1/read.mjs';
import {createTransport} from './safe-d1/transport.mjs';
import {createBootstrapJournal} from './safe-d1/bootstrap-journal.mjs';
import {runBootstrap} from './safe-d1/bootstrap-runner.mjs';
const chunks=[];let bytes,input,token,request,readTransport,transport;
try{
 requireSafe(bootstrapExecutionApproved,'bootstrap_not_authorized');
 requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');assertEnvironment(process.env);assertRuntime();approvedSources();
 let size=0;for await(const p of process.stdin){size+=p.length;requireSafe(size<=24000,'private_input_limit');chunks.push(p);}
 bytes=Buffer.concat(chunks);input=JSON.parse(bytes.toString('utf8'));requireSafe(Object.keys(input).sort().join(',')==='jwt,token','private_input_invalid');
 token=input.token;request=new Request('https://kuwago-admin-api-development.ch-jesus-99.workers.dev/',{headers:{'Cf-Access-Jwt-Assertion':input.jwt}});input.jwt=undefined;input.token=undefined;input=undefined;
 const identity=await verifyBootstrapRecipient(request);request=undefined;
 const recovery=await loadBootstrapRecovery(),r=bootstrapRecoveryState(recovery,'development');
 const a=JSON.parse(readFileSync(resolve(root,'next-stage/bootstrap-authorization.json')));
 readTransport=createTransport(token,{bootstrapPreflightPermit:issueBootstrapPreflightPermit(identity,r.evidenceSha256)});
 const preflight=await createReader(readTransport).inspect(6);readTransport.dispose();readTransport=undefined;
 const plan=prepareSingleOperatorBootstrap({preflight,snapshot:r.snapshot,expectedFingerprint:r.fingerprint,identity,executionId:a.executionId,authorizationReference:a.authorizationReference});
 const permit=issueBootstrapPermit(plan,r.evidenceSha256),scope=scopeForBootstrap(plan,r.evidenceSha256),journal=createBootstrapJournal({environment:'development',executionId:plan.executionId});
 transport=createTransport(token,{bootstrapPermit:permit,bootstrapJournal:journal});token=undefined;
 const result=await runBootstrap({transport,plan,recovery,journal,scope});
 console.log(JSON.stringify({status:result.status,executionId:plan.executionId,durablyClosed:result.durablyClosed}));process.exitCode=result.status==='PASS'&&result.durablyClosed?0:2;
}catch{console.log(JSON.stringify({status:bootstrapExecutionApproved?'STOPPED':'BLOCKED'}));process.exitCode=2;}
finally{
 transport?.dispose();readTransport?.dispose();
 // eslint-disable-next-line no-useless-assignment
 token=undefined;
 // eslint-disable-next-line no-useless-assignment
 input=undefined;
 // eslint-disable-next-line no-useless-assignment
 request=undefined;
 bytes?.fill(0);for(const p of chunks)p.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;
}
