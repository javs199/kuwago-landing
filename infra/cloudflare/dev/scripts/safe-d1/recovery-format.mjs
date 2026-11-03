import {requireSafe} from './policy.mjs';

// Shared by the portable verifier and the private generator's validation child.
export function decodeRecoverySecret(value){
 requireSafe(typeof value==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(value),'recovery_input_invalid');
 const bytes=Buffer.from(value,'base64');
 if(bytes.length!==32||bytes.toString('base64')!==value){bytes.fill(0);throw Error('recovery_input_invalid');}
 return bytes;
}
