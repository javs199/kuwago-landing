import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorker,rolePermissions} from '../.wrangler/build/security.js';
import {issuer,audience,origin,signingFixture,jwksFetcher,request,localDatabase,seedAdministrators} from './auth-fixtures.mjs';

test('middleware, real local D1 and canonical RBAC',async t=>{
  const key=await signingFixture();const fetcher=jwksFetcher(()=>[key.publicJwk]);
  const {mf,db}=await localDatabase();const logs=[];
  const worker=createWorker(fetcher.fetch,event=>logs.push(event));
  const env={DB:db,APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true'};
  const headers={'Origin':origin,'Content-Type':'application/json','X-Kuwago-Request':'1'};
  const invoke=async(subject,path='/api/v1/session',method='GET',extraHeaders={},body,claims={})=>worker.fetch(request(subject?await key.token(subject,claims):undefined,path,method,{...headers,...extraHeaders},body),env);
  try {
    await t.test('migrations do not create privileged principals or migrate legacy grants',async()=>{
      assert.equal((await db.prepare('SELECT count(*) n FROM principals').first()).n,0);
      assert.equal((await db.prepare('SELECT count(*) n FROM administrator_roles').first()).n,0);
      await seedAdministrators(db);
      assert.equal((await invoke('subject-legacy')).status,403);
    });
    await t.test('D1 role matrix exactly matches server ceiling',async()=>{
      for(const [role,permissions]of Object.entries(rolePermissions)){
        const rows=(await db.prepare('SELECT permission FROM admin_role_permissions WHERE role_id=?').bind(role).all()).results;
        assert.deepEqual(rows.map(x=>x.permission).sort(),[...permissions].sort());
      }
    });
    await t.test('anonymous direct endpoints and email-only requests cannot bypass middleware',async()=>{
      for(const path of ['/api/v1/session','/api/v1/admins','/api/v1/media/private','/api/v1/services/id/publish'])assert.equal((await invoke(undefined,path)).status,401);
      assert.equal((await invoke(undefined,'/api/v1/admins','GET',{'Cf-Access-Authenticated-User-Email':'super@test.invalid','X-Role':'super_admin'})).status,401);
    });
    await t.test('unknown, disabled and roleless administrators all receive generic denial',async()=>{
      for(const subject of ['unknown','subject-disabled','subject-no-role']){
        const result=await invoke(subject);assert.equal(result.status,403);assert.equal((await result.json()).error,'forbidden');
      }
      assert.equal((await db.prepare("SELECT count(*) n FROM principals WHERE subject='unknown'").first()).n,0);
    });
    await t.test('editor identity can read own authorization context, without JWT, email or issuer',async()=>{
      const result=await invoke('subject-editor');assert.equal(result.status,200);
      const data=await result.json();assert.equal(data.administrator.role,'editor');
      assert.deepEqual(Object.keys(data),['administrator']);
      assert.deepEqual(Object.keys(data.administrator).sort(),['id','permissions','role']);
      assert.equal(result.headers.get('cache-control'),'no-store');
      assert.equal(result.headers.get('access-control-allow-origin'),null);
    });
    await t.test('editor publication denied; administrator publication requires version precondition',async()=>{
      assert.equal((await invoke('subject-editor','/api/v1/services/id/publish','POST',{},'{}')).status,403);
      for(const action of ['publish','unpublish','archive'])assert.equal((await invoke('subject-admin','/api/v1/services/id/'+action,'POST',{},'{}')).status,428);
      assert.equal((await db.prepare('SELECT count(*) n FROM services').first()).n,0);
      assert.equal((await db.prepare('SELECT count(*) n FROM publication_outbox').first()).n,0);
    });
    await t.test('admin cannot manage administrators; super admin passes authorization without modifying users',async()=>{
      assert.equal((await invoke('subject-admin','/api/v1/admins')).status,403);
      const before=(await db.prepare('SELECT count(*) n FROM principals').first()).n;
      assert.equal((await invoke('subject-super','/api/v1/admins')).status,501);
      assert.equal((await db.prepare('SELECT count(*) n FROM principals').first()).n,before);
    });
    await t.test('frontend body, headers and JWT custom role claims cannot elevate an editor',async()=>{
      const result=await invoke('subject-editor','/api/v1/admins/fixture-editor','PATCH',{'X-Role':'super_admin','X-Admin-Id':'fixture-super'},JSON.stringify({role:'super_admin',permissions:['admins:manage']}),{role:'super_admin',email:'super@test.invalid'});
      assert.equal(result.status,403);
      assert.equal((await db.prepare("SELECT role_id FROM administrator_roles WHERE principal_id='fixture-editor'").first()).role_id,'editor');
    });
    await t.test('role revocation and disabled principal take effect without identity cache',async()=>{
      await db.prepare("UPDATE principals SET enabled=0 WHERE id='fixture-editor'").run();
      assert.equal((await invoke('subject-editor')).status,403);
      await db.prepare("UPDATE principals SET enabled=1 WHERE id='fixture-editor'").run();
      await db.prepare("UPDATE administrator_roles SET role_id='editor' WHERE principal_id='fixture-admin'").run();
      assert.equal((await invoke('subject-admin','/api/v1/services/id/publish','POST',{},'{}')).status,403);
      await db.prepare("UPDATE administrator_roles SET role_id='admin' WHERE principal_id='fixture-admin'").run();
    });
    await t.test('unexpected elevated DB grant fails closed instead of broadening static permissions',async()=>{
      await db.prepare("INSERT INTO admin_role_permissions VALUES ('editor','admins:manage')").run();
      assert.equal((await invoke('subject-editor','/api/v1/admins')).status,503);
      await db.prepare("DELETE FROM admin_role_permissions WHERE role_id='editor' AND permission='admins:manage'").run();
    });
    await t.test('CSRF controls reject missing/foreign/null Origin, wrong headers and form requests',async()=>{
      for(const patch of [{Origin:''},{Origin:'null'},{Origin:'https://attacker.invalid'},{'X-Kuwago-Request':''},{'Content-Type':'application/x-www-form-urlencoded'},{'Sec-Fetch-Site':'same-site'}]){
        const result=await invoke('subject-editor','/api/v1/services','POST',patch,'{}');
        assert.equal(result.status,403);assert.equal((await result.json()).error,'csrf_rejected');
      }
      assert.equal((await invoke('subject-editor','/api/v1/services','POST',{},'{}')).status,422);
    });
    await t.test('unknown paths and methods denied; private images fail closed without a storage binding and catalog listing is authenticated',async()=>{
      assert.equal((await invoke('subject-editor','/api/v1/unknown')).status,404);
      assert.equal((await invoke('subject-editor','/api/v1/session','DELETE',{},'{}')).status,405);
      assert.equal((await invoke('subject-editor','/api/v1/media/private')).status,503);
      assert.equal((await invoke('subject-editor','/api/v1/services')).status,200);
    });
    await t.test('security audit records authorization outcome only, and logs exclude tokens and client input',async()=>{
      const events=(await db.prepare("SELECT * FROM audit_events WHERE action='security.authorization'").all()).results;
      assert.ok(events.some(x=>x.outcome==='denied'&&x.entity_id==='services:publish'));
      assert.ok(events.some(x=>x.outcome==='allowed'&&x.entity_id==='admins:manage'));
      const text=JSON.stringify({logs,events});
      for(const secret of ['Cf-Access-Jwt-Assertion','eyJ','super@test.invalid','https://attacker.invalid','permissions":'])assert.ok(!text.includes(secret));
      for(const event of logs)assert.ok(Object.keys(event).every(k=>['event','requestId','operation','status','principalId','role'].includes(k)));
    });
    await t.test('missing configuration, wrong execution environment, DB read or audit failures deny access generically',async()=>{
      const token=await key.token();
      for(const broken of [{...env,ACCESS_AUD:''},{...env,APP_ENV:'production'},{...env,DB:{prepare(){throw new Error('sensitive database diagnostics');}}}]){
        const result=await worker.fetch(request(token),broken);assert.equal(result.status,503);assert.ok(!(await result.text()).includes('diagnostics'));
      }
      const brokenAudit={prepare(query){return query.startsWith('INSERT INTO audit_events')?{bind(){return this;},async run(){throw new Error('private audit diagnostics');}}:db.prepare(query);}};
      assert.equal((await worker.fetch(request(token),{...env,DB:brokenAudit})).status,503);
    });
    await t.test('canonical approval trigger accepts independent admin and rejects historical publisher grants',async()=>{
      await db.batch([
        db.prepare("INSERT INTO services(id,provenance,working_revision_id) VALUES ('test-content','demo','test-rev')"),
        db.prepare("INSERT INTO service_revisions(id,service_id,number,created_by) VALUES ('test-rev','test-content',1,'fixture-editor')"),
      ]);
      const hash='b'.repeat(64);
      await db.prepare("UPDATE service_revisions SET content_hash=?,sealed_at='2026-10-23T00:00:00Z' WHERE id='test-rev'").bind(hash).run();
      await assert.rejects(db.prepare("INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by) VALUES ('legacy-approval','test-rev',?,'fixture-legacy')").bind(hash).run());
      await db.prepare("INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by) VALUES ('new-approval','test-rev',?,'fixture-admin')").bind(hash).run();
    });
  } finally {await mf.dispose();}
});

test('actual bundled Worker verifies a signed JWT and queries D1 inside local workerd',async()=>{
  const key=await signingFixture('runtime-key');
  const {mf,db}=await localDatabase({
    script:readFileSync(new URL('../.wrangler/build/worker.js',import.meta.url),'utf8'),
    bindings:{APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin},
    outboundService:async req=>{
      assert.equal(req.url,issuer+'/cdn-cgi/access/certs');
      return Response.json({keys:[key.publicJwk]});
    },
  });
  try {
    await seedAdministrators(db);
    const unauthenticated=await mf.dispatchFetch('https://worker.test.invalid/api/v1/session');assert.equal(unauthenticated.status,401);
    const response=await mf.dispatchFetch('https://worker.test.invalid/api/v1/session',{headers:{'Cf-Access-Jwt-Assertion':await key.token('subject-super')}});
    assert.equal(response.status,200);assert.equal((await response.json()).administrator.role,'super_admin');
  } finally {await mf.dispose();}
});
