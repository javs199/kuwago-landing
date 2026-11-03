import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDevelopmentWorker} from '../.wrangler/build/development.js';
import {issuer,audience,origin,signingFixture,jwksFetcher,localDatabase,seedAdministrators} from './auth-fixtures.mjs';

test('combined DEV ingress protects assets and real D1 reads; mutations stay disabled',async()=>{
  const {mf,db}=await localDatabase();
  try {
    await seedAdministrators(db);
    const key=await signingFixture();
    const worker=createDevelopmentWorker(jwksFetcher(()=>[key.publicJwk]).fetch);
    let assetReads=0;
    const env={DB:db,APP_ENV:'development',ADMIN_ORIGIN:origin,ACCESS_ISSUER:issuer,ACCESS_AUD:audience,MUTATIONS_ENABLED:'false',DEV_MAINTENANCE:'false',
      ASSETS:{async fetch(){assetReads++;return new Response('<html>Admin</html>',{headers:{'Content-Type':'text/html'}});}}};
    const call=async(path='/',subject='subject-super',method='GET')=>worker.fetch(new Request(origin+path,{method,
      headers:{...(subject?{'Cf-Access-Jwt-Assertion':await key.token(subject)}:{}),...(method==='POST'?{'Origin':origin,'Sec-Fetch-Site':'same-origin','X-Kuwago-Request':'1','Content-Type':'application/json'}:{})},
      ...(method==='POST'?{body:'{}'}:{})}),env);
    assert.equal((await call('/',null)).status,401);
    assert.equal((await call('/assets/index-12345678.js','subject-disabled')).status,403);
    assert.equal(assetReads,0);
    const page=await call();assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');
    const session=await call('/api/v1/session');assert.equal(session.status,200);assert.equal((await session.json()).administrator.role,'super_admin');
    const services=await call('/api/v1/services');assert.equal(services.status,200);assert.deepEqual((await services.json()).items,[]);
    assert.equal((await call('/api/v1/services','subject-super','POST')).status,501);
    env.MUTATIONS_ENABLED='true';assert.equal((await call('/api/v1/services','subject-super','POST')).status,422);
    const audits=await db.prepare('SELECT COUNT(*) AS n FROM audit_events').all();
    env.DEV_MAINTENANCE='true';assert.equal((await call('/')).status,503);
    assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM audit_events').all(),audits);env.DEV_MAINTENANCE='false';
    for(const path of ['/catalog/services','/__local-test','/private/image','/unknown','/api/v1/admins'])assert.ok([404,501].includes((await call(path)).status),path);
  } finally {await mf.dispose();}
});

test('remote DEV configuration pins existing resources and invokes authentication before every asset',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.development.json',import.meta.url),'utf8'));
  assert.equal(config.account_id,'7a8bcd7992a3de359d2aff87df2fb693');
  assert.equal(config.name,'kuwago-admin-api-development');
  assert.equal(config.d1_databases[0].database_id,'c5cfbe44-4fd0-4c2a-83c1-b833935534ba');
  assert.equal(config.r2_buckets[0].bucket_name,'kuwago-media-development');
  assert.equal(config.assets.run_worker_first,true);
  assert.equal(config.preview_urls,false);
  assert.equal(config.vars.MUTATIONS_ENABLED,'false');
  assert.deepEqual(config.routes,[]);
  assert.equal(config.images,undefined);
  assert.equal(config.services,undefined);
  assert.equal(config.triggers,undefined);
});
