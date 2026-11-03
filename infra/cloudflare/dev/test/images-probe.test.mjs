import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {commandMode,probeConfig,assertProbeConfig,prepareProbe,exerciseProbe} from '../scripts/images-probe.mjs';
test('isolated Images plan requires explicit authorization and confirmed account plan',()=>{
  for(const args of [[],['remote'],['remote','--authorize-images-usage'],['deploy'],['offline','--remote']])assert.throws(()=>commandMode(args));
  assert.equal(commandMode(['prepare']).mode,'prepare');assert.equal(commandMode(['offline']).mode,'offline');
  assert.equal(commandMode(['remote','--authorize-images-usage','--confirm-account-plan','--account-id='+'0'.repeat(32)]).mode,'remote');
});
test('isolated config permits only Images, loopback and no deployed ingress or account by default',()=>{
  const config=probeConfig();assertProbeConfig(config);assert.equal(config.images.remote,false);assert.equal(config.account_id,undefined);
  for(const patch of [{d1_databases:[{binding:'DB'}]},{r2_buckets:[{binding:'PRIVATE_MEDIA'}]},{services:[{service:'admin'}]},{dev:{ip:'0.0.0.0',port:8798}},{workers_dev:true}])assert.throws(()=>assertProbeConfig({...config,...patch}));
});
test('prepared probe bundles synthetic corpus without administrative dependencies',async()=>{
  const corpus=await prepareProbe();assert.equal(corpus.length,24);assert.ok(corpus.every(row=>row.base64&&row.id&&!row.url));
  const code=readFileSync(new URL('../.wrangler/images-probe/entry.js',import.meta.url),'utf8');
  for(const needle of ['PRIVATE_MEDIA','administrator_roles','Cf-Access-Jwt-Assertion','SELECT ','INSERT ','Hostinger'])assert.ok(!code.includes(needle),needle);
});
async function probe(mode='offline'){
  const mf=new Miniflare(convertV4MiniflareOptions({name:'images-probe-local-only-test',modules:true,script:readFileSync(new URL('../.wrangler/images-probe/entry.js',import.meta.url),'utf8'),compatibilityDate:'2026-07-30',host:'127.0.0.1',cf:false,telemetry:{enabled:false},images:{binding:'IMAGES'},bindings:{PROBE_MODE:mode},outboundService:async()=>{throw Error('external_network_forbidden');}}));
  return {mf,worker:await mf.getWorker()};
}
const req=(caseId,extra={})=>new Request('http://127.0.0.1:8798/case',{method:'POST',headers:{'Content-Type':'application/json','X-Kuwago-Probe':'synthetic-v1',...extra},body:JSON.stringify({caseId})});
test('probe rejects browser/unknown input and enforces a finite request budget',async()=>{
  await prepareProbe();const {mf,worker}=await probe();
  try{
    assert.equal((await worker.fetch(req('valid-png',{Origin:'https://evil.invalid'}))).status,403);
    assert.equal((await worker.fetch(req('unknown-private-upload'))).status,422);
    for(let i=0;i<32;i++)assert.equal((await worker.fetch(req('wrong-mime'))).status,422);
    assert.equal((await worker.fetch(req('valid-png'))).status,429);
    assert.equal((await (await worker.fetch('http://127.0.0.1:8798/health')).json()).used,32);
  }finally{await mf.dispose();}
});
test('remote-labelled probe without authorization denies before any transform',async()=>{
  await prepareProbe();const {mf,worker}=await probe('remote');try{assert.equal((await worker.fetch(req('valid-png'))).status,403);}finally{await mf.dispose();}
});
test('offline conformance fixes PNG while preserving the legacy JPEG metric and explicit codec profile',async()=>{
  const corpus=await prepareProbe(),{mf,worker}=await probe();
  try{
    const report=await exerciseProbe(request=>worker.fetch(request),corpus,'offline');assert.equal(report.remoteExecuted,false);assert.equal(report.requests,27);assert.equal(report.billing.observedAmount,null);
    assert.equal(report.failed,0);const bomb=report.results.find(row=>row.caseId==='inflation-bomb');assert.equal(bomb.status,422);assert.equal(bomb.pass,true);
    const jpeg=report.results.find(row=>row.caseId==='output-jpeg');assert.equal(jpeg.pixelCornerMaxDelta,25);assert.equal(jpeg.legacyRawPixelPass,false);assert.equal(jpeg.encodedReferenceMetrics.maxDelta,0);assert.equal(jpeg.pass,true);assert.equal(jpeg.scope,'exploratory_codec_only_not_production_approval');assert.equal(report.legacyRawProfileFailures,1);
  }finally{await mf.dispose();}
});
test('runner marks connection failures as failures without retries or fabricated costs',async()=>{
  let calls=0;const report=await exerciseProbe(async()=>{calls++;throw Error('private network diagnostics');},[{id:'synthetic',base64:'',expectedStatus:'ok'}],'offline');
  assert.equal(calls,1);assert.equal(report.failed,1);assert.equal(report.billing.observedAmount,null);assert.ok(!JSON.stringify(report).includes('private network diagnostics'));
});
