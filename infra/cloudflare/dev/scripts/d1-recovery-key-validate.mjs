import {decodeRecoverySecret} from './safe-d1/recovery-format.mjs';
// Format-only child. No key generation, storage, network or secret output.
const chunks=[];let joined,key;
try{
 if(process.argv.length!==2||process.stdin.isTTY)throw Error('private_pipe_required');
 let length=0;for await(const part of process.stdin){chunks.push(part);length+=part.length;if(length>4096)throw Error('input_limit');}
 joined=Buffer.concat(chunks);const input=JSON.parse(joined.toString('utf8'));
 if(Object.keys(input).length!==1)throw Error('input_invalid');
 key=decodeRecoverySecret(input.recoverySecretBase64);input.recoverySecretBase64=undefined;
 console.log(JSON.stringify({accepted:true,bytes:key.length,format:'base64-standard-canonical'}));
}catch{console.log(JSON.stringify({accepted:false}));process.exitCode=2;}
finally{key?.fill(0);joined?.fill(0);for(const part of chunks)part.fill(0);delete process.env.CLOUDFLARE_API_TOKEN;}
