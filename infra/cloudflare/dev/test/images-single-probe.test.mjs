import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareSingle} from '../scripts/images-single-probe.mjs';

test('single PNG fixture and bundle exclude other codecs, resources and administrative code',async()=>{
  const fixture=await prepareSingle();assert.equal(fixture.synthetic,true);assert.equal(fixture.width,24);assert.equal(fixture.height,16);assert.ok(fixture.bytes<1024);
  const code=readFileSync(new URL('../.wrangler/images-single-probe/entry.js',import.meta.url),'utf8');
  for(const text of ['PRIVATE_MEDIA','SELECT ','INSERT ','administrator_roles','syntheticCorpus','valid-jpeg'])assert.ok(!code.includes(text));
});

async function localProbe(failure=false){
  const fixture=readFileSync(new URL('../.wrangler/images-single-probe/input.png',import.meta.url)).toString('base64');
  const result=await build({stdin:{contents:`import probe from './probe/single-entry.ts';
    const mock={
      async info(stream){const bytes=new Uint8Array(await new Response(stream).arrayBuffer());return {format:'image/png',width:24,height:16,fileSize:bytes.length};},
      input(stream){return {async output(){
        ${failure?"throw Error('synthetic failure');":"return {response:()=>new Response(stream,{headers:{'Content-Type':'image/png'}})};"}
      }};}
    };
    export default {fetch(request){return probe.fetch(request,{IMAGES:mock,PROBE_MODE:'remote',PROBE_APPROVED:'explicit-images-test'});}};`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',define:{__SINGLE_PNG__:JSON.stringify(fixture)},logLevel:'silent'});
  const mf=new Miniflare(convertV4MiniflareOptions({name:'single-png-no-network-test',modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-07-30',cf:false,telemetry:{enabled:false},outboundService:async()=>{throw Error('network_forbidden');}}));
  return {mf,worker:await mf.getWorker()};
}
const request=()=>new Request('http://127.0.0.1/case',{method:'POST',headers:{'X-Kuwago-Probe':'single-png-v1'}});
for(const failure of [false,true])test(`single runtime budget is never reset after ${failure?'failure':'success'}`,async()=>{
  await prepareSingle();const {mf,worker}=await localProbe(failure);
  try{
    assert.equal((await worker.fetch('http://127.0.0.1/health')).status,200);
    assert.equal((await worker.fetch(request())).status,failure?503:200);
    assert.equal((await worker.fetch(request())).status,409);
    const state=await (await worker.fetch('http://127.0.0.1/health')).json();
    assert.equal(state.transformAttempts,1);assert.equal(state.transformCompleted,failure?0:1);assert.equal(state.infoCalls,failure?1:2);assert.equal(state.validated,!failure);
  }finally{await mf.dispose();}
});
