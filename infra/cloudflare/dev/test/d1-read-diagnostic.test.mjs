import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseReadOnly,expectedAccount,expectedDatabase,schemaSql} from '../scripts/d1-read-diagnostic.mjs';
const marker='synthetic_test_credential_not_real_12345';
const env=()=>({CLOUDFLARE_API_TOKEN:marker,CLOUDFLARE_ACCOUNT_ID:expectedAccount,KUWAGO_D1_DATABASE_ID:expectedDatabase});
test('D1 read diagnostic performs exactly metadata GET then a fixed schema SELECT on one DB',async()=>{
  const environment=env(),requests=[];
  const report=await diagnoseReadOnly(environment,async(url,options)=>{
    requests.push({url,options});assert.equal(options.redirect,'manual');assert.equal(options.headers.get('Authorization'),'Bearer '+marker);
    return requests.length===1?Response.json({success:true,result:{name:'kuwago-admin-db-development',uuid:expectedDatabase,file_size:12288}}):Response.json({success:true,result:[{success:true,results:[{name:'_cf_KV',type:'table',sql:'private schema definition not retained'}]}]});
  });
  assert.equal(report.status,'passed');assert.equal(requests.length,2);assert.equal(requests[0].options.method,'GET');assert.equal(requests[1].options.method,'POST');
  assert.ok(requests.every(r=>r.url.includes(`/accounts/${expectedAccount}/d1/database/${expectedDatabase}`)));
  assert.equal(JSON.parse(requests[1].options.body).sql,schemaSql);assert.match(schemaSql,/^SELECT /);assert.ok(!/\b(CREATE|INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(schemaSql));
  assert.equal(environment.CLOUDFLARE_API_TOKEN,undefined);assert.equal(report.credentialCleared,true);assert.equal(report.schema.applicationTableCount,0);
  assert.ok(!JSON.stringify(report).includes(marker));assert.ok(!JSON.stringify(report).includes('private schema definition'));
});
test('10000 stops after metadata and redacts any echoed credential/error message',async()=>{
  let calls=0;const report=await diagnoseReadOnly(env(),async()=>{calls++;return Response.json({success:false,errors:[{code:10000,message:'secret echoed '+marker}]},{status:403});});
  assert.equal(calls,1);assert.equal(report.status,'metadata_failed');assert.deepEqual(report.requests[0].codes,[10000]);assert.equal(report.credentialCleared,true);assert.ok(!JSON.stringify(report).includes(marker));
});
test('wrong account/DB, missing credential and metadata target mismatch fail closed',async()=>{
  for(const patch of [{CLOUDFLARE_ACCOUNT_ID:'other'},{KUWAGO_D1_DATABASE_ID:'other'},{CLOUDFLARE_API_TOKEN:''}]){
    let calls=0;const environment={...env(),...patch};const report=await diagnoseReadOnly(environment,async()=>{calls++;});assert.equal(calls,0);assert.equal(report.status,'preflight_failed');assert.equal(report.credentialCleared,true);
  }
  let calls=0;const report=await diagnoseReadOnly(env(),async()=>{calls++;return Response.json({success:true,result:{uuid:'other',name:'other'}});});assert.equal(calls,1);assert.equal(report.status,'target_mismatch');
});
test('network errors and redirects never retry, follow or expose diagnostics',async()=>{
  for(const mode of ['network','redirect']){let calls=0;const report=await diagnoseReadOnly(env(),async()=>{calls++;if(mode==='network')throw Error(marker);return Response.redirect('https://untrusted.invalid',302);});assert.equal(calls,1);assert.notEqual(report.status,'passed');assert.ok(!JSON.stringify(report).includes(marker));assert.equal(report.credentialCleared,true);}
});

test('empty DEV preflight rejects administrative tables, migration history and unknown or filtered names',async()=>{
  for(const name of ['principals','services','d1_migrations','_unrecognized_table','unexpected-name']){
    let calls=0;const report=await diagnoseReadOnly(env(),async()=>{calls++;return calls===1?Response.json({success:true,result:{name:'kuwago-admin-db-development',uuid:expectedDatabase}}):Response.json({success:true,result:[{success:true,results:[{type:'table',name,sql:'not retained'}]}]});});
    assert.equal(calls,2);assert.equal(report.status,'unexpected_schema');assert.equal(report.schema.unexpectedDefinitionCount,1);assert.equal(report.credentialCleared,true);assert.ok(!JSON.stringify(report).includes(marker));
  }
});
