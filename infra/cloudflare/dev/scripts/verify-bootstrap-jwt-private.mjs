// Invoked only by the private Windows form. No D1, cookies, browser scraping or writer.
import {openSync,writeFileSync,readFileSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {verifyBootstrapRecipient,devAccess,expectedSubject} from './single-operator-bootstrap.mjs';
import {custodyRoot,verifyWindowsCustody} from './safe-d1/windows-custody.mjs';
import {assertEnvironment,assertRuntime,requireSafe,digest} from './safe-d1/policy.mjs';
const chunks=[];let bytes,input,request;
try{
 requireSafe(process.argv.length===2&&!process.stdin.isTTY,'private_pipe_required');
 assertEnvironment(process.env);assertRuntime();verifyWindowsCustody();
 let size=0;for await(const part of process.stdin){size+=part.length;requireSafe(size<=20000,'private_input_limit');chunks.push(part);}
 bytes=Buffer.concat(chunks);input=JSON.parse(bytes.toString('utf8'));
 requireSafe(Object.keys(input).join(',')==='jwt'&&typeof input.jwt==='string','private_input_invalid');
 request=new Request('https://kuwago-admin-api-development.ch-jesus-99.workers.dev/',{headers:{'Cf-Access-Jwt-Assertion':input.jwt}});
 input.jwt=undefined;input=undefined;
 const identity=await verifyBootstrapRecipient(request);request=undefined;
 const receipt={kind:'bootstrap-identity-verification',verificationId:randomUUID(),status:'PASS',
  verifiedAt:new Date(identity.verifiedAt).toISOString(),expiresAt:new Date(identity.expiresAt).toISOString(),
  issuer:devAccess.issuer,audience:devAccess.audience,subject:expectedSubject,emailMatchesDesignatedRecipient:true,
  signature:'RS256/JWKS',signatureVerified:true,issuerVerified:true,audienceVerified:true,timeVerified:true,
  identityVerified:true,rawTokenPersisted:false,remoteD1Requests:0,bootstrapAuthorized:false};
 const file=resolve(custodyRoot,'bootstrap-identity-'+receipt.verificationId+'.json');
 const encoded=Buffer.from(JSON.stringify(receipt,null,2)),fd=openSync(file,'wx',0o600);
 try{writeFileSync(fd,encoded);fsyncSync(fd);}finally{closeSync(fd);}
 requireSafe(digest(readFileSync(file))===digest(encoded),'receipt_persistence_failed');
 console.log(JSON.stringify({status:'PASS',verificationId:receipt.verificationId,receiptSha256:digest(encoded)}));
}catch{console.log(JSON.stringify({status:'FAIL',reason:'private_identity_verification_not_confirmed'}));process.exitCode=2;}
finally{
 // Release the credential-bearing objects; JS does not guarantee physical erasure.
 // eslint-disable-next-line no-useless-assignment
 input=undefined;
 // eslint-disable-next-line no-useless-assignment
 request=undefined;
 bytes?.fill(0);for(const part of chunks)part.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;
}
