import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot,dpapi} from './safe-d1/windows-custody.mjs';
import {digest,requireSafe} from './safe-d1/policy.mjs';
// Local evidence only. No transport, fetch, credentials or raw bookmark output.
const prefix=resolve(custodyRoot,'migration-0002-0006-96a25c8d-186f-4b67-9653-1b399294903f');
function load(suffix,hash){const bytes=readFileSync(prefix+suffix);requireSafe(digest(bytes)===hash,'diagnostic_evidence_hash_mismatch');return JSON.parse(bytes);}
async function decode(value){let plain;try{plain=await dpapi.unprotect(Buffer.from(value,'base64'));requireSafe(plain.length===32&&plain.subarray(28).toString('ascii')==='BKM1','diagnostic_private_record_invalid');return plain.subarray(0,28).toString('hex');}finally{plain?.fill(0);}}
try{
 const r=load('.result.json','8d4410b2dae23af05ce063814152c5f2562d8d2213ab21757323a136a509d5f2'),a=load('.stage-1.baseline.private.json','255e3c43471c8c24815627545ba36914c533c9c6d0b14de58d148a3f5a413b8d'),b=load('.stage-2.baseline.private.json','84e097f587fad00c220f6c60ef829db0f85ff2d652a1da2b203697c86e18497a');
 const av=await decode(a.liveBookmark),ao=await decode(a.originalBookmark),bo=await decode(b.originalBookmark),bv=await decode(b.liveBookmark);
 console.log(JSON.stringify({status:'verified_local_evidence',backupEqualsPre0002:ao===av,pre0002EqualsPost0002:av===bo,pre0002EarlierThanPost0002:av<bo,post0002EqualsPre0003:bo===bv,timeline:r.requests.map((q,i)=>({request:i+1,operation:q.operation,httpStatus:q.httpStatus})).filter(q=>['bookmark','migration_batch'].includes(q.operation)),times:{pre0002Started:a.startedAt,pre0002Verified:a.verifiedAt,pre0003Started:b.startedAt,pre0003Verified:b.verifiedAt,stopped:r.finishedAt},failedPairIdentifiable:false,post0003FullFingerprintPersisted:false}));
}catch{console.log(JSON.stringify({status:'diagnosis_failed_details_omitted'}));process.exitCode=2;}
