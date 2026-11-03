import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGateway} from '../.wrangler/build/gateway.js';
import {createWorker} from '../.wrangler/build/worker.js';
import publicWorker from '../.wrangler/build/public.js';
import {assertGatewayConfig} from '../scripts/local.mjs';
import {issuer,audience,origin,signingFixture,jwksFetcher,localDatabase,seedAdministrators} from './auth-fixtures.mjs';

test('gateway authenticates assets, delegates RBAC and denies alternative routes',async t=>{
  const {mf,db}=await localDatabase();await seedAdministrators(db);
  const key=await signingFixture(),keys=jwksFetcher(()=>[key.publicJwk]);
  const gateway=createGateway(keys.fetch),api=createWorker(keys.fetch,()=>{});
  let assets=0,privateMedia;const forwarded=[];
  const env={APP_ENV:'development',ADMIN_ORIGIN:origin,ACCESS_ISSUER:issuer,ACCESS_AUD:audience,
    ADMIN_API:{async fetch(request){forwarded.push(request);return api.fetch(request,{APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,DB:db,MUTATIONS_ENABLED:'true',...(privateMedia?{PRIVATE_MEDIA:privateMedia}:{})});}},
    ASSETS:{async fetch(request){assets++;const path=new URL(request.url).pathname;return new Response(path==='/index.html'?'<html>protected</html>':'export {};',{headers:{'Content-Type':path==='/index.html'?'text/html':'text/javascript','Set-Cookie':'unsafe=1','Access-Control-Allow-Origin':'*','ETag':'unsafe'}});}}};
  const token=await key.token();
  const req=(path='/',jwt=token,method='GET',headers={},body)=>new Request(origin+path,{method,headers:{...(jwt?{'Cf-Access-Jwt-Assertion':jwt}:{}),...headers},...(body!==undefined?{body}:{})});
  const call=(...args)=>gateway.fetch(req(...args),env);
  try{
    await t.test('missing, invalid, expired, incorrect signature/issuer/audience tokens cannot reach assets or API',async()=>{
      const other=await signingFixture();const now=Math.floor(Date.now()/1000);
      for(const jwt of [null,'invalid.jwt.value',await key.token('subject-editor',{iat:now-1000,exp:now-60}),await key.token('subject-editor',{aud:'other-app'}),await key.token('subject-editor',{iss:'https://other.cloudflareaccess.com'}),await other.token('subject-editor')])assert.equal((await call('/',jwt)).status,401);
      assert.equal(assets,0);assert.equal(forwarded.length,0);
    });
    await t.test('unknown, disabled and roleless Access identities are denied by private API even for JS',async()=>{
      for(const subject of ['subject-disabled','subject-no-role','unknown-subject'])assert.equal((await call('/assets/index-12345678.js',await key.token(subject))).status,403);
      assert.equal(assets,0);
    });
    await t.test('registered editor can load HTML/bootstrap/assets with secure no-store headers and HEAD',async()=>{
      for(const path of ['/','/index.html','/preferences-bootstrap.js','/assets/index-12345678.js']){
        const r=await call(path);assert.equal(r.status,200,path);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('X-Frame-Options'),'DENY');
        assert.match(r.headers.get('Content-Security-Policy'),/script-src 'self'/);assert.ok(!r.headers.get('Content-Security-Policy').includes('unsafe-inline'));
        for(const name of ['Set-Cookie','Access-Control-Allow-Origin','ETag'])assert.equal(r.headers.get(name),null);
      }
      const head=await call('/',token,'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
    });
    await t.test('session keeps role private to API; spoofed role/email/cookie/forwarded headers are stripped',async()=>{
      const r=await call('/api/v1/session',token,'GET',{'Cookie':'CF_Authorization=forged','Authorization':'Bearer forged','Cf-Access-Authenticated-User-Email':'owner@invalid','X-Role':'super_admin','X-Forwarded-Host':'evil.invalid'});
      assert.equal(r.status,200);assert.equal((await r.json()).administrator.role,'editor');
      const sent=forwarded.at(-1);for(const name of ['Cookie','Authorization','Cf-Access-Authenticated-User-Email','X-Role','X-Forwarded-Host'])assert.equal(sent.headers.get(name),null);
      assert.equal(sent.headers.get('Cf-Access-Jwt-Assertion'),token);
    });
    await t.test('API ETag and 202 pending survive proxying without permitting browser caches',async()=>{
      const r=await gateway.fetch(req('/api/v1/services/test'),{...env,ADMIN_API:{fetch(){return Response.json({delivery:'pending'},{status:202,headers:{ETag:'"7"','Access-Control-Allow-Origin':'*'}});}}});
      assert.equal(r.status,202);assert.equal(r.headers.get('ETag'),'"7"');assert.equal((await r.json()).delivery,'pending');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
    });
    await t.test('editor cannot publish or manage users, even with privileged request headers',async()=>{
      assert.equal((await call('/api/v1/services/test/publish',token,'POST',{Origin:origin,'X-Kuwago-Request':'1','Content-Type':'application/json','X-Role':'super_admin'},'{}')).status,403);
      assert.equal((await call('/api/v1/admins',token)).status,403);
    });
    await t.test('CSRF and CORS preflight rejected without delegating mutating requests',async()=>{
      for(const headers of [{},{Origin:'https://evil.invalid','X-Kuwago-Request':'1','Content-Type':'application/json'},{Origin:origin,'Content-Type':'application/json'},{Origin:origin,'X-Kuwago-Request':'1','Content-Type':'application/json','Sec-Fetch-Site':'cross-site'}]){
        const count=forwarded.length;assert.equal((await call('/api/v1/services',token,'POST',headers,'{}')).status,403);assert.equal(forwarded.length,count);
      }
      for(const method of ['GET','OPTIONS']){const r=await call('/api/v1/session',token,method,{Origin:'https://evil.invalid'});assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);}
    });
    await t.test('foreign host, raw private files, source files, public API and local test login never route to a binding',async()=>{
      const count=forwarded.length;
      for(const path of ['/v1/catalog','/.env','/src/main.tsx','/development/quarantine/private','/__local-test/login','/services','/assets/index-%2f.js','/api/v2/services'])assert.equal((await call(path)).status,404,path);
      assert.equal(forwarded.length,count);
      assert.equal((await gateway.fetch(new Request('https://alternative.invalid/',{headers:{'Cf-Access-Jwt-Assertion':token}}),env)).status,403);
    });
    await t.test('private previews require registered identity/ownership and are delegated to API without public mapping',async()=>{
      assert.equal((await call('/api/v1/media/missing/preview')).status,503); // No private bucket is attached to this test API.
      assert.equal((await call('/api/v1/media/missing/preview',null)).status,401);
      const r=await publicWorker.fetch(new Request(origin+'/api/v1/session'),{APP_ENV:'development',PUBLICATION:{}});assert.equal(r.status,404);
    });
    await t.test('a second enabled editor cannot discover another uploader private preview',async()=>{
      await db.batch([
        db.prepare("INSERT INTO principals(id,issuer,subject,enabled) VALUES ('gateway-other',?,'subject-other',1)").bind(issuer),
        db.prepare("INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES ('gateway-other','editor','fixture-operator')"),
        db.prepare("INSERT INTO media_assets(id,private_object_key,state,provenance,mime_type,byte_size,uploaded_by) VALUES ('gateway-photo','development/quarantine/gateway-photo','quarantine','demo','image/png',1,'fixture-editor')"),
      ]);
      privateMedia={get(){throw Error('private bytes must not be read');}};
      assert.equal((await call('/api/v1/media/gateway-photo/preview',await key.token('subject-other'))).status,404);
      assert.equal((await call('/api/v1/media/gateway-photo/preview')).status,409);
      privateMedia=undefined;
    });
    await t.test('revocation takes effect on next HTML/asset/API request; no cached authorization',async()=>{
      await db.prepare("UPDATE principals SET enabled=0 WHERE id='fixture-editor'").run();
      for(const path of ['/','/preferences-bootstrap.js','/api/v1/session'])assert.equal((await call(path)).status,403);
      await db.prepare("UPDATE principals SET enabled=1 WHERE id='fixture-editor'").run();
    });
    await t.test('wrong configuration, binding errors, redirects and SPA fallback fail closed',async()=>{
      assert.equal((await gateway.fetch(req(),{...env,ACCESS_AUD:''})).status,503);
      assert.equal((await gateway.fetch(req(),{...env,ADMIN_API:{fetch(){throw Error('sensitive private failure');}}})).status,503);
      assert.equal((await gateway.fetch(req(),{...env,ADMIN_API:{fetch(){return Response.json({administrator:{role:'super_admin'}});}}})).status,503);
      assert.equal((await gateway.fetch(req('/api/v1/session'),{...env,ADMIN_API:{fetch(){return Response.redirect('https://evil.invalid',302);}}})).status,502);
      const r=await gateway.fetch(req('/assets/fake-12345678.js'),{...env,ASSETS:{fetch(){return new Response('<html>fallback</html>',{headers:{'Content-Type':'text/html'}});}}});assert.equal(r.status,502);
      assert.ok(!(await r.text()).includes('fallback'));
    });
  }finally{await mf.dispose();}
});

test('gateway config has only local assets/API and no private/public storage bindings',()=>{
  const c=JSON.parse(readFileSync(new URL('../wrangler.gateway.local.json',import.meta.url),'utf8'));
  assertGatewayConfig(c);
  assert.equal(c.assets.run_worker_first,true);assert.equal(c.assets.not_found_handling,'none');
  assert.equal(c.env.development.services[0].remote,false);assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);
  for(const value of [c,c.env.development])for(const name of ['account_id','d1_databases','r2_buckets','images'])assert.equal(value[name],undefined);
  for(const patch of [{account_id:'forbidden'},{d1_databases:[]},{r2_buckets:[]},{services:[]},{images:{binding:'IMAGES'}},{workers_dev:true},{assets:{...c.assets,run_worker_first:false}},{assets:{...c.assets,directory:'../../../'}},{env:{development:{...c.env.development,assets:c.assets}}}])assert.throws(()=>assertGatewayConfig({...c,...patch}));
});
