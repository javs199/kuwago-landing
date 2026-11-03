import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createWorker} from '../.wrangler/build/worker.js';
import publicWorker from '../.wrangler/build/public.js';
import {normalizeImage} from '../scripts/image-normalizer.mjs';
import {issuer,audience,origin,signingFixture,jwksFetcher,request,localDatabase,seedAdministrators,localBarrier} from './auth-fixtures.mjs';
test('super_admin explicit audited self-approval; complete publish/withdraw; other roles retain separation',async()=>{
 const {mf,db}=await localDatabase({r2Buckets:{PUBLICATION:'policy-public-test',PRIVATE_MEDIA:'policy-private-test'}});
 try{
  await seedAdministrators(db);const key=await signingFixture(),worker=createWorker(jwksFetcher(()=>[key.publicJwk]).fetch,()=>{});
  const env={APP_ENV:'development',EXECUTION_MODE:'local-only',DB:db,PRIVATE_MEDIA:await mf.getR2Bucket('PRIVATE_MEDIA'),PUBLICATION:await mf.getR2Bucket('PUBLICATION'),IMAGE_NORMALIZER:{fetch:normalizeImage},ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true'};
  const call=async(path,method='GET',body,version,subject='subject-super')=>{
   const response=await worker.fetch(request(await key.token(subject),'/api/v1'+path,method,{Origin:origin,'X-Kuwago-Request':'1','Content-Type':body instanceof Uint8Array?'image/png':'application/json',...(version?{'If-Match':`"${version}"`}:{})},body instanceof Uint8Array?body:body===undefined?undefined:JSON.stringify(body)),env);
   return {status:response.status,body:await response.json()};
  };
  const png=await sharp({create:{width:8,height:8,channels:3,background:'#3B0C5B'}}).png().toBuffer();
  const upload=await call('/media','POST',png);assert.equal(upload.status,201);let image=upload.body.media;
  assert.equal((await call('/media/'+image.id+'/approve','POST',{confirmUsageRights:true},image.version)).status,403);
  const approvedImage=await call('/media/'+image.id+'/approve','POST',{confirmUsageRights:true,confirmSelfApproval:true},image.version);assert.equal(approvedImage.status,200);image=approvedImage.body.media;
  const adminUpload=await call('/media','POST',png,undefined,'subject-admin');const adminImage=adminUpload.body.media;
  assert.equal((await call('/media/'+adminImage.id+'/approve','POST',{confirmUsageRights:true,confirmSelfApproval:true},adminImage.version,'subject-admin')).status,403);
  const category=await call('/categories','POST',{slug:'policy-test',active:true,translations:{es:{name:'SOLO PRUEBA'},en:{name:'TEST ONLY'}}});assert.equal(category.status,201);
  const input={slug:'policy-test',categoryId:category.body.category.id,internalNotes:'PRIVATE TEST ONLY',translations:{es:{title:'SOLO PRUEBA',description:'No comercial'},en:{title:'TEST ONLY',description:'Non commercial'}},options:[{id:crypto.randomUUID(),translations:{es:{name:'Prueba'},en:{name:'Test'}},durationMinutes:30,experienceType:'private',venue:'in_property',price:{kind:'fixed',currency:'USD',amountMinor:100,unit:'service'}}],media:[{id:image.id,sortOrder:0,alt:{es:'PNG sintética',en:'Synthetic PNG'}}]};
  const created=await call('/services','POST',input);assert.equal(created.status,201);let doc=created.body;const id=doc.data.service.id;
  await call('/catalog/sync','POST',{});
  const pub=async()=>{const response=await publicWorker.fetch(new Request('https://public.invalid/v1/catalog'),{APP_ENV:'development',PUBLICATION:env.PUBLICATION,CATALOG_BARRIER:localBarrier(db)});assert.equal(response.status,200);return response.json();};
  assert.equal((await pub()).services.length,0);
  const saved=await call('/services/'+id,'PATCH',{...input,translations:{...input.translations,en:{title:'TEST ONLY EDITED',description:'Non commercial edited'}}},doc.version);assert.equal(saved.status,200);
  assert.equal((await call('/services/'+id,'PATCH',input,doc.version)).status,409);doc=saved.body;
  const approval={revisionId:doc.data.service.workingRevisionId,confirmCommercialApproval:true};
  assert.equal((await call('/services/'+id+'/approve','POST',approval,doc.version)).status,403);
  assert.equal((await call('/services/'+id+'/approve','POST',{...approval,confirmSelfApproval:true},doc.version,'subject-editor')).status,403);
  const approved=await call('/services/'+id+'/approve','POST',{...approval,confirmSelfApproval:true},doc.version);assert.equal(approved.status,200);doc=approved.body;
  const published=await call('/services/'+id+'/publish','POST',{revisionId:doc.data.service.workingRevisionId},doc.version);assert.equal(published.status,200);doc=published.body;assert.equal((await pub()).services.length,1);
  const withdrawn=await call('/services/'+id+'/unpublish','POST',{},doc.version);assert.equal(withdrawn.status,200);doc=withdrawn.body;assert.equal((await pub()).services.length,0);
  assert.equal((await call('/services/'+id+'/archive','POST',{},doc.version)).status,200);
  const events=await db.prepare("SELECT action FROM audit_events WHERE action IN ('media.super_admin_self_approved','service.super_admin_self_approved')").all();assert.equal(events.results.length,2);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await mf.dispose();}
});

test('DEV Images authorization is durable, exact-input and single-use, including transform failures',async()=>{
 const {mf,db}=await localDatabase({r2Buckets:{PRIVATE_MEDIA:'single-image-test'}});
 try{
  await seedAdministrators(db);const key=await signingFixture(),worker=createWorker(jwksFetcher(()=>[key.publicJwk]).fetch,()=>{});
  const png=await sharp({create:{width:8,height:8,channels:3,background:'#3B0C5B'}}).png().toBuffer();let transformations=0;
  const env={APP_ENV:'development',DB:db,PRIVATE_MEDIA:await mf.getR2Bucket('PRIVATE_MEDIA'),ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true',IMAGE_PROCESSOR:'cloudflare-images-v1',IMAGE_POLICY_VERIFIED:'kuwago-png-v2',DEV_IMAGE_INPUT_SHA256:createHash('sha256').update(png).digest('hex'),
   IMAGES:{async info(stream){return {format:'image/png',width:8,height:8,fileSize:(await new Response(stream).arrayBuffer()).byteLength};},input(){return {async output(){transformations++;throw Error('synthetic unavailable');}};}}};
  const call=async()=>worker.fetch(request(await key.token('subject-super'),'/api/v1/media','POST',{Origin:origin,'Content-Type':'image/png','X-Kuwago-Request':'1'},png),env);
  assert.equal((await call()).status,503);assert.equal(transformations,1);
  assert.equal((await call()).status,409);assert.equal(transformations,1);
  const claims=await db.prepare('SELECT COUNT(*) AS n FROM dev_image_transform_claim').all();assert.equal(claims.results[0].n,1);
  const assets=await db.prepare('SELECT state FROM media_assets').all();assert.ok(assets.results.every(row=>row.state==='quarantine'));
 }finally{await mf.dispose();}
});
