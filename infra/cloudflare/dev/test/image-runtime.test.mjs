import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {localDatabase,seedAdministrators,signingFixture,issuer,audience,origin,request,jwksFetcher} from './auth-fixtures.mjs';
import {createWorker} from '../.wrangler/build/security.js';
import {crc32} from '../.wrangler/build/image-processor.js';
const workerSource=`
import {cloudflareImagesProcessor,processImage,normalizationPolicy} from './processor.mjs';
export default {async fetch(request,env){
  try{
    const bytes=await request.arrayBuffer(),scenario=new URL(request.url).pathname.slice(1);
    if(scenario==='unverified'){await processImage({IMAGES:env.IMAGES,IMAGE_PROCESSOR:'cloudflare-images-v1'},bytes);throw Error('unexpected validation');}
    if(scenario==='missing'){await processImage({IMAGE_PROCESSOR:'cloudflare-images-v1',IMAGE_POLICY_VERIFIED:normalizationPolicy},bytes);throw Error('unexpected validation');}
    let binding=env.IMAGES;
    if(scenario==='failure')binding={info(){throw Error('private upstream diagnostics');}};
    if(scenario==='timeout')binding={info(){return new Promise(()=>{});}};
    if(scenario==='bad-output')binding={info:stream=>env.IMAGES.info(stream),input:()=>({output:async()=>({response:()=>new Response('<svg/>',{headers:{'Content-Type':'image/png'}})})})};
    const result=await cloudflareImagesProcessor(binding,scenario==='timeout'?10:30000).process(bytes,request.headers.get('Content-Type'));
    return new Response(result.output,{headers:{'Content-Type':'image/png','X-Width':String(result.width),'X-Height':String(result.height),'X-Hash':result.hash,'X-Policy':result.policy}});
  }catch(error){return Response.json({error:error.code??'unexpected_failure'},{status:error.status??503});}
}};`;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function chunk(name,body){const data=Buffer.from(body),type=Buffer.from(name),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);type.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc32(Buffer.concat([type,data])),result.length-4);return result;}
const png=await sharp({create:{width:24,height:16,channels:3,background:'#3B0C5B'}}).png().toBuffer();
test('Images adapter: actual workerd + offline Images binding, never remote',async t=>{
  let network=0;
  const {mf}=await localDatabase({script:undefined,images:{binding:'IMAGES'},modules:[{type:'ESModule',path:'entry.mjs',contents:workerSource},{type:'ESModule',path:'processor.mjs',contents:readFileSync(new URL('../.wrangler/build/image-processor.js',import.meta.url),'utf8')}],outboundService:async()=>{network++;throw Error('external_network_forbidden');}});
  try{
    const worker=await mf.getWorker();
    const call=(bytes,mime='image/png',path='')=>worker.fetch(new Request('https://processor.test.invalid/'+path,{method:'POST',headers:{'Content-Type':mime},body:bytes}));
    for(const format of ['png','jpeg','webp'])await t.test('full decode/re-encode '+format+' to bounded PNG in workerd',async()=>{
      const bytes=await sharp(png)[format]().toBuffer(),response=await call(bytes,'image/'+format);assert.equal(response.status,200,await response.clone().text());const result=Buffer.from(await response.arrayBuffer()),metadata=await sharp(result).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,24);assert.equal(metadata.height,16);assert.equal(metadata.exif,undefined);assert.equal(response.headers.get('X-Hash'),hash(result));assert.equal(response.headers.get('X-Policy'),'kuwago-png-v2');
    });
    await t.test('false MIME and disallowed SVG/GIF rejected before decode',async()=>{for(const [bytes,mime] of [[png,'image/jpeg'],[Buffer.from('<svg onload="alert(1)"/>'),'image/svg+xml'],[Buffer.from('GIF89a'),'image/gif']])assert.equal((await call(bytes,mime)).status,422);});
    await t.test('CRC corruption and truncations cannot become validated output',async()=>{
      const broken=Buffer.from(png);broken[40]^=255;assert.equal((await call(broken)).status,422);
      for(const format of ['png','jpeg','webp']){const bytes=await sharp(png)[format]().toBuffer();assert.equal((await call(bytes.subarray(0,bytes.length-8),'image/'+format)).status,422);}
      const jpeg=await sharp(png).jpeg().toBuffer();assert.equal((await call(Buffer.concat([jpeg,jpeg]),'image/jpeg')).status,422);
    });
    await t.test('structurally plausible but damaged compressed payload fails full decode',async()=>{
      const parts=[png.subarray(0,8)];let at=8;
      while(at<png.length){const size=png.readUInt32BE(at),name=png.toString('ascii',at+4,at+8);const body=Buffer.from(png.subarray(at+8,at+8+size));if(name==='IDAT')body[0]^=255;parts.push(chunk(name,body));at+=size+12;}
      const response=await call(Buffer.concat(parts));assert.equal(response.status,422);assert.equal((await response.json()).error,'png_invalid_zlib');
    });
    await t.test('dimension/decompression bombs and byte limits rejected before binding',async()=>{
      const ihdr=Buffer.from(png.subarray(16,29));ihdr.writeUInt32BE(65535,0);ihdr.writeUInt32BE(65535,4);const bomb=Buffer.concat([png.subarray(0,8),chunk('IHDR',ihdr),png.subarray(33)]);assert.equal((await call(bomb)).status,422);assert.equal((await call(Buffer.alloc(2097153))).status,413);
    });
    await t.test('PNG animation and WebP animation containers cannot silently flatten into approval',async()=>{
      const apng=Buffer.concat([png.subarray(0,33),chunk('acTL',Buffer.alloc(8)),png.subarray(33)]);assert.equal((await call(apng)).status,422);
      const webp=await sharp(png).webp().toBuffer();const extended=Buffer.alloc(10);extended[0]=2;extended.writeUIntLE(23,4,3);extended.writeUIntLE(15,7,3);const vp8x=Buffer.alloc(18);vp8x.write('VP8X');vp8x.writeUInt32LE(10,4);extended.copy(vp8x,8);const animated=Buffer.concat([webp.subarray(0,12),vp8x,webp.subarray(12)]);animated.writeUInt32LE(animated.length-8,4);assert.equal((await call(animated,'image/webp')).status,422);
    });
    await t.test('all non-rendering PNG chunks stripped from the normalized result',async()=>{
      const withText=Buffer.concat([png.subarray(0,33),chunk('tEXt',Buffer.from('private\0synthetic GPS-like metadata')),png.subarray(33)]),response=await call(withText);assert.equal(response.status,200,await response.clone().text());const result=Buffer.from(await response.arrayBuffer());assert.ok(!result.includes(Buffer.from('synthetic GPS')));assert.equal((await sharp(result).metadata()).exif,undefined);
    });
    await t.test('EXIF orientation and metadata behavior exercised in local simulator',async()=>{
      const jpeg=await sharp(png).jpeg().withMetadata({orientation:6}).toBuffer(),response=await call(jpeg,'image/jpeg');
      // A simulator may not implement this capability. A mismatch MUST fail closed,
      // and must never be mistaken for successful production acceptance.
      console.info(JSON.stringify({event:'offline_images_orientation_6',status:response.status}));
      if(response.status===200){const m=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(m.width,16);assert.equal(m.height,24);assert.equal(m.exif,undefined);}
      else{assert.equal(response.status,503);assert.equal((await response.json()).error,'decoder_orientation_mismatch');}
    });
    await t.test('eight EXIF rotations/reflections compared by asymmetric raster, not just dimensions',async()=>{
      const raw=Buffer.alloc(12*8*3);for(let y=0;y<8;y++)for(let x=0;x<12;x++){const color=y<4?(x<6?[220,20,20]:[20,220,20]):(x<6?[20,20,220]:[220,220,20]);for(let c=0;c<3;c++)raw[(y*12+x)*3+c]=color[c];}
      const observed=[];
      for(let orientation=1;orientation<=8;orientation++){
        const jpeg=await sharp(raw,{raw:{width:12,height:8,channels:3}}).jpeg().withMetadata({orientation}).toBuffer();const response=await call(jpeg,'image/jpeg');
        observed.push({orientation,status:response.status});
        if(response.status!==200){assert.equal(response.status,503);continue;}
        const actual=await sharp(Buffer.from(await response.arrayBuffer())).removeAlpha().raw().toBuffer({resolveWithObject:true});const expected=await sharp(jpeg).rotate().removeAlpha().raw().toBuffer({resolveWithObject:true});
        assert.equal(actual.info.width,expected.info.width);assert.equal(actual.info.height,expected.info.height);assert.equal(actual.data.length,expected.data.length);
        assert.ok(actual.data.every((value,i)=>Math.abs(value-expected.data[i])<=3),'rotation/reflection raster mismatch');
      }
      console.info(JSON.stringify({event:'offline_images_exif_matrix',observed}));
    });
    await t.test('transformation/connection errors, invalid output and deadline fail closed',async()=>{for(const scenario of ['failure','timeout','bad-output']){const response=await call(png,'image/png',scenario);assert.ok(response.status>=400);assert.ok(!(await response.text()).includes('private upstream'));}});
    await t.test('production policy gate and absent binding deny processing without Node fallback',async()=>{assert.equal((await call(png,'image/png','unverified')).status,503);assert.equal((await call(png,'image/png','missing')).status,503);});
    assert.equal(network,0);
  }finally{await mf.dispose();}
});
test('administrative integration: uncertain processor remains quarantined; existing approvals unchanged',async()=>{
  const {mf,db}=await localDatabase({r2Buckets:{PRIVATE_MEDIA:'policy-gate-private-only'}});
  try{
    await seedAdministrators(db);const key=await signingFixture(),worker=createWorker(jwksFetcher(()=>[key.publicJwk]).fetch,()=>{});
    const env={APP_ENV:'development',DB:db,PRIVATE_MEDIA:await mf.getR2Bucket('PRIVATE_MEDIA'),IMAGE_PROCESSOR:'cloudflare-images-v1',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true'};
    const token=await key.token();const response=await worker.fetch(request(token,'/api/v1/media','POST',{Origin:origin,'Content-Type':'image/png','X-Kuwago-Request':'1'},png),env);assert.equal(response.status,503);
    const asset=await db.prepare('SELECT * FROM media_assets').first();assert.equal(asset.state,'quarantine');assert.equal(asset.usage_approval,'pending');assert.equal(asset.derivative_object_key,null);
    const admin=await key.token('subject-admin');assert.equal((await worker.fetch(request(admin,'/api/v1/media/'+asset.id+'/approve','POST',{Origin:origin,'Content-Type':'application/json','X-Kuwago-Request':'1','If-Match':'"1"'},JSON.stringify({confirmUsageRights:true})),env)).status,409);
    const failed=await worker.fetch(request(token,'/api/v1/media','POST',{Origin:origin,'Content-Type':'image/png','X-Kuwago-Request':'1'},png),{...env,IMAGE_POLICY_VERIFIED:'kuwago-png-v2',IMAGES:{info(){throw Error('connection lost');}}});assert.equal(failed.status,503);
    const records=(await db.prepare('SELECT a.state,a.usage_approval,p.validation_code FROM media_assets a JOIN media_processing p ON p.media_id=a.id').all()).results;
    assert.ok(records.every(row=>row.state==='quarantine'&&row.usage_approval==='pending'));assert.ok(records.some(row=>row.validation_code==='image_processor_unavailable'));
    let localCalls=0;
    const forbiddenLocal=await worker.fetch(request(token,'/api/v1/media','POST',{Origin:origin,'Content-Type':'image/png','X-Kuwago-Request':'1'},png),{...env,IMAGE_PROCESSOR:'local-sharp-v1',IMAGE_NORMALIZER:{fetch(){localCalls++;throw Error('must not run outside local mode');}}});
    assert.equal(forbiddenLocal.status,503);assert.equal(localCalls,0);
  }finally{await mf.dispose();}
});
test('real administrative Worker in workerd: Images result stays private and requires independent usage approval',async()=>{
  const localOrigin='https://localhost';
  const localRequest=(...args)=>{const value=request(...args);return new Request(localOrigin+new URL(value.url).pathname,value);};
  const key=await signingFixture('images-runtime-only-test-key');
  const {mf,db}=await localDatabase({script:undefined,
    modules:[{type:'ESModule',path:'admin.mjs',contents:readFileSync(new URL('../.wrangler/build/worker.js',import.meta.url),'utf8')}],
    images:{binding:'IMAGES'},r2Buckets:{PRIVATE_MEDIA:'images-runtime-integration-private-only'},
    // This test-fixture gate exercises the enabled branch; it does NOT certify the remote engine.
    bindings:{APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:localOrigin,MUTATIONS_ENABLED:'true',IMAGE_PROCESSOR:'cloudflare-images-v1',IMAGE_POLICY_VERIFIED:'kuwago-png-v2'},
    outboundService:async req=>{assert.equal(req.url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[key.publicJwk]});},
  });
  try{
    await seedAdministrators(db);const worker=await mf.getWorker(),token=await key.token();
    const response=await worker.fetch(localRequest(token,'/api/v1/media','POST',{Origin:localOrigin,'Content-Type':'image/png','X-Kuwago-Request':'1'},png));assert.equal(response.status,201,await response.clone().text());
    const {media}=await response.json();assert.equal(media.state,'validated');assert.equal(media.usageApproval,'pending');assert.equal(media.validationCode,'kuwago-png-v2/cloudflare-images-v1');
    const row=await db.prepare('SELECT * FROM media_processing WHERE media_id=?').bind(media.id).first();assert.equal(row.normalized_sha256.length,64);
    const preview=await worker.fetch(localRequest(token,'/api/v1/media/'+media.id+'/preview'));assert.equal(preview.status,200);assert.equal(hash(Buffer.from(await preview.arrayBuffer())),row.normalized_sha256);
    const approve=async identity=>worker.fetch(localRequest(await key.token(identity),'/api/v1/media/'+media.id+'/approve','POST',{Origin:localOrigin,'Content-Type':'application/json','X-Kuwago-Request':'1','If-Match':`"${media.version}"`},JSON.stringify({confirmUsageRights:true})));
    assert.equal((await approve('subject-editor')).status,403);const approved=await approve('subject-admin');assert.equal(approved.status,200);assert.equal((await approved.json()).media.state,'approved');
  }finally{await mf.dispose();}
});
