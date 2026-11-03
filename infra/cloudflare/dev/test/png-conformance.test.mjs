import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {crc32,processImage} from '../.wrangler/build/image-processor.js';
import {syntheticCorpus} from '../scripts/images-probe-corpus.mjs';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(name,body){const bytes=Buffer.from(body),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);out.write(name,4);bytes.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
function fixture({width=2,height=2,color=2,depth=8,interlace=0,filter=0,rawDelta=0,compression,extraBefore=[],extraAfter=[],palette=true,split=false}={}){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=depth;ihdr[9]=color;ihdr[12]=interlace;
  const channels={0:1,2:3,3:1,4:2,6:4}[color],pieces=[];
  const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  for(const [x,y,dx,dy]of passes){const w=Math.max(0,Math.ceil((width-x)/dx)),h=Math.max(0,Math.ceil((height-y)/dy));if(!w||!h)continue;for(let row=0;row<h;row++){const bytes=Buffer.alloc(1+Math.ceil(w*channels*depth/8));bytes[0]=filter;pieces.push(bytes);}}
  let raw=Buffer.concat(pieces);if(rawDelta<0)raw=raw.subarray(0,raw.length+rawDelta);if(rawDelta>0)raw=Buffer.concat([raw,Buffer.alloc(rawDelta)]);
  const compressed=compression?compression(raw):deflateSync(raw),idat=split?[chunk('IDAT',compressed.subarray(0,1)),chunk('IDAT',Buffer.alloc(0)),chunk('IDAT',compressed.subarray(1))]:[chunk('IDAT',compressed)];
  return Buffer.concat([signature,chunk('IHDR',ihdr),...(color===3&&palette?[chunk('PLTE',Buffer.alloc(3*2**depth))]:[]),...extraBefore,...idat,...extraAfter,chunk('IEND',Buffer.alloc(0))]);
}
test('PNG strict conformance in workerd: complete zlib, raster, filters and critical ordering',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({name:'png-strict-local-only',modules:[{type:'ESModule',path:'entry.mjs',contents:`import {inspectImage,validatePngData} from './processor.mjs';export default {async fetch(request){try{const bytes=await request.arrayBuffer();inspectImage(bytes,'image/png');await validatePngData(bytes);return new Response(null,{status:204});}catch(error){return Response.json({error:error.code??'unexpected'},{status:error.status??500});}}};`},{type:'ESModule',path:'processor.mjs',contents:readFileSync(new URL('../.wrangler/build/image-processor.js',import.meta.url),'utf8')}],compatibilityDate:'2026-07-30',host:'127.0.0.1',cf:false,telemetry:{enabled:false},outboundService:async()=>{throw Error('external_network_forbidden');}}));
  try{
    const worker=await mf.getWorker(),call=bytes=>worker.fetch(new Request('https://png.test.invalid/',{method:'POST',body:bytes}));
    await t.test('known CRC vector and independently encoded PNG agree',async()=>{assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);const bytes=await sharp({create:{width:8,height:8,channels:4,background:'#3B0C5B'}}).png().toBuffer();assert.equal((await call(bytes)).status,204);});
    await t.test('legal color/depth combinations and split/empty IDAT remain accepted',async()=>{
      for(const [color,depths]of [[0,[1,2,4,8,16]],[2,[8,16]],[3,[1,2,4,8]],[4,[8,16]],[6,[8,16]]])for(const depth of depths){const bytes=fixture({color,depth,split:true});await sharp(bytes).raw().toBuffer();const response=await call(bytes);assert.equal(response.status,204,`${color}/${depth}: ${await response.text()}`);}
    });
    await t.test('Adam7 exact row sizes include empty passes and packed pixels',async()=>{for(const [width,height]of [[1,1],[1,8],[8,1],[7,9],[16,8]])for(const [color,depth]of [[2,8],[3,1],[6,16]]){const bytes=fixture({width,height,color,depth,interlace:1});await sharp(bytes).raw().toBuffer();assert.equal((await call(bytes)).status,204,`${width}x${height}/${color}/${depth}`);}});
    await t.test('original decompression-excess fixture is rejected before any decoder',async()=>{const item=(await syntheticCorpus()).find(c=>c.id==='inflation-bomb');const response=await call(Buffer.from(item.base64,'base64'));assert.equal(response.status,422);assert.equal((await response.json()).error,'png_raster_length_mismatch');});
    await t.test('short/long raster and invalid row filters reject even with valid CRC/zlib',async()=>{for(const options of [{rawDelta:-1},{rawDelta:1},{interlace:1,rawDelta:1},{filter:5},{filter:255}])assert.equal((await call(fixture(options))).status,422);for(const filter of [0,1,2,3,4])assert.equal((await call(fixture({filter}))).status,204);});
    await t.test('corrupt Adler checksum, truncated zlib, concatenation and trailing compressed data reject',async()=>{
      for(const compression of [raw=>{const v=deflateSync(raw);v[v.length-1]^=255;return v;},raw=>deflateSync(raw).subarray(0,-2),raw=>Buffer.concat([deflateSync(raw),Buffer.from([1,2,3])]),raw=>Buffer.concat([deflateSync(raw),deflateSync(Buffer.alloc(0))])])assert.equal((await call(fixture({compression}))).status,422);
    });
    await t.test('invalid critical order, palette/transparency, reserved bits and duplicate chunks reject',async()=>{
      const valid=fixture(),ihdr=valid.subarray(8,33);
      const cases=[fixture({extraBefore:[ihdr]}),fixture({extraBefore:[chunk('ABCD',Buffer.alloc(0))]}),fixture({extraBefore:[chunk('abca',Buffer.alloc(0))]}),fixture({color:3,palette:false}),fixture({color:0,extraBefore:[chunk('PLTE',Buffer.alloc(3))]}),fixture({color:6,extraBefore:[chunk('tRNS',Buffer.alloc(2))]}),fixture({color:3,depth:1,extraBefore:[chunk('PLTE',Buffer.alloc(9))]}),fixture({extraAfter:[chunk('PLTE',Buffer.alloc(3))]}),fixture({extraAfter:[chunk('IDAT',Buffer.alloc(0))],extraBefore:[]})];
      // A second consecutive IDAT is legal; break its sequence with ancillary data.
      cases.pop();cases.push(fixture({extraAfter:[chunk('tEXt',Buffer.from('test\0synthetic')),chunk('IDAT',Buffer.alloc(0))]}));
      for(const bytes of cases)assert.equal((await call(bytes)).status,422);
      const crc=Buffer.from(valid);crc[40]^=255;assert.equal((await call(crc)).status,422);assert.equal((await call(valid.subarray(0,-1))).status,422);assert.equal((await call(Buffer.concat([valid,Buffer.from([0])]))).status,422);
    });
    await t.test('palette indices are checked after undoing PNG row filters',async()=>{
      for(const raw of [Buffer.from([0,255,0,0,0,0]),Buffer.from([1,1,1,0,0,0])]){
        const bytes=fixture({color:3,depth:8,palette:false,extraBefore:[chunk('PLTE',Buffer.alloc(6))],compression:()=>deflateSync(raw)});
        const response=await call(bytes);assert.equal(response.status,422);assert.equal((await response.json()).error,'png_invalid_palette_index');
      }
    });
  }finally{await mf.dispose();}
});
test('PNG invalid data never invokes the local decoder, and policy v1 cannot enable v2',async()=>{
  const item=(await syntheticCorpus()).find(c=>c.id==='inflation-bomb');let calls=0;
  // Use an exact ArrayBuffer rather than a pooled Node Buffer backing store.
  const bytes=Uint8Array.from(Buffer.from(item.base64,'base64')).buffer;
  await assert.rejects(processImage({EXECUTION_MODE:'local-only',IMAGE_NORMALIZER:{fetch(){calls++;throw Error('must not call');}}},bytes),error=>error.code==='png_raster_length_mismatch');assert.equal(calls,0);
  await assert.rejects(processImage({IMAGE_PROCESSOR:'cloudflare-images-v1',IMAGE_POLICY_VERIFIED:'kuwago-png-v1'},bytes),error=>error.code==='image_policy_not_verified');
});
