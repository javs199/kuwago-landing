import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createWorker,commitCatalogMutation} from '../.wrangler/build/security.js';
import publicWorker from '../.wrangler/build/public.js';
import {PublicCatalogSchema} from '../../../../packages/contracts/dist/public.js';
import {issuer,audience,origin,signingFixture,jwksFetcher,request,localDatabase,seedAdministrators,localBarrier} from './auth-fixtures.mjs';

const categoryData={slug:'test-only-category',active:true,translations:{es:{name:'Categoría de prueba'},en:{name:'Test-only category'}}};
function draft(categoryId,mediaId){return {slug:'test-only-'+crypto.randomUUID(),categoryId,internalNotes:'PRIVATE TEST NOTES',
  translations:{es:{title:'SOLO PRUEBA, no comercial',description:'Datos sintéticos'},en:{title:'TEST ONLY, not commercial',description:'Synthetic data'}},
  options:[{id:crypto.randomUUID(),translations:{es:{name:'Prueba'},en:{name:'Test'}},durationMinutes:60,experienceType:'private',venue:'in_property',price:{kind:'quote',currency:null,unit:'service'}}],
  media:mediaId?[{id:mediaId,sortOrder:0,alt:{es:'Imagen sintética',en:'Synthetic image'}}]:[]};}
test('local administrative catalog workflow and isolated public projection',async t=>{
  const {mf,db}=await localDatabase({r2Buckets:{PUBLICATION:'publication-test-only'}});
  try {
    await seedAdministrators(db);const store=await mf.getR2Bucket('PUBLICATION');const key=await signingFixture();const fetcher=jwksFetcher(()=>[key.publicJwk]);
    const worker=createWorker(fetcher.fetch,()=>{});
    const env={APP_ENV:'development',DB:db,PUBLICATION:store,ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true'};
    const call=async(method,path,body,version,subject='subject-editor',override={})=>{
      const token=subject?await key.token(subject):undefined;
      const response=await worker.fetch(request(token,'/api/v1'+path,method,{'Origin':origin,'Content-Type':'application/json','X-Kuwago-Request':'1',...(version?{'If-Match':`"${version}"`}:{})},body===undefined?undefined:JSON.stringify(body)),{...env,...override});
      const json=await response.json();return {response,status:response.status,...json};
    };
    const pub=async(path='/v1/catalog',options={})=>{
      const response=await publicWorker.fetch(new Request('https://public.test.invalid'+path,options),{APP_ENV:'development',PUBLICATION:store,CATALOG_BARRIER:localBarrier(db)});
      return {status:response.status,body:await response.json()};
    };
    let categoryId;let service;let data;
    await t.test('public source starts unavailable, then explicit sync initializes a real empty API catalog',async()=>{
      assert.equal((await pub()).status,503);
      assert.equal((await call('POST','/catalog/sync',{},undefined,'subject-admin')).status,200);
      const empty=await pub();assert.equal(empty.status,200);assert.deepEqual(PublicCatalogSchema.parse(empty.body).services,[]);
    });
    await t.test('categories preserve stable IDs, complete ES/EN and optimistic version',async()=>{
      const created=await call('POST','/categories',categoryData);assert.equal(created.status,201,JSON.stringify(created));categoryId=created.category.id;
      assert.equal((await call('PATCH','/categories/'+categoryId,{...categoryData,translations:{es:{name:'Solo ES'}}},1)).status,422);
      const edited=await call('PATCH','/categories/'+categoryId,{...categoryData,translations:{...categoryData.translations,en:{name:'Updated test category'}}},1);
      assert.equal(edited.status,200);assert.equal(edited.category.id,categoryId);assert.equal(edited.version,2);
      assert.equal((await call('PATCH','/categories/'+categoryId,categoryData,1)).status,409);
      assert.deepEqual((await pub('/v1/categories')).body.categories,[]);
    });
    await t.test('draft creation validates and never leaks unverified content to public API',async()=>{
      data=draft(categoryId,'approved-test-media');
      await db.prepare(`INSERT INTO media_assets(id,private_object_key,derivative_object_key,state,provenance,usage_approval,sha256,mime_type,byte_size,width,height,uploaded_by,reviewed_by,reviewed_at)
        VALUES ('approved-test-media','development/quarantine/test-only','development/derived/test-only','approved','verified','approved',?,'image/png',1,1,1,'fixture-editor','fixture-admin','2026-01-01T00:00:00Z')`).bind('a'.repeat(64)).run();
      service=await call('POST','/services',data);assert.equal(service.status,201,JSON.stringify(service));assert.equal(service.version,1);
      assert.equal(service.data.service.status,'draft');assert.equal(service.response.headers.get('etag'),'"1"');
      assert.equal((await pub('/v1/services/'+service.data.service.id)).status,404);
      assert.equal((await call('GET','/services')).items.length,1);
    });
    await t.test('input cannot supply provenance, image URLs, approvals, actor IDs or publication state',async()=>{
      for(const extra of [{provenance:'verified'},{status:'published'},{actorId:'fixture-super'},{commercialApproval:{status:'approved'}}])assert.equal((await call('POST','/services',{...data,...extra})).status,422);
      assert.equal((await call('POST','/services',{...data,media:[{...data.media[0],url:'https://attacker.invalid/private'}]})).status,422);
      assert.equal((await call('POST','/services',data,undefined,null)).status,401);
      assert.equal((await call('POST','/services',draft(categoryId),undefined,'subject-editor',{MUTATIONS_ENABLED:'false'})).status,501);
    });
    await t.test('commercial approval requires complete ES/EN, valid money, approved media and independent reviewer',async()=>{
      const invalid=draft(categoryId,'approved-test-media');invalid.translations.en.description='';
      const bad=await call('POST','/services',invalid);assert.equal(bad.status,201);
      assert.equal((await call('POST',`/services/${bad.data.service.id}/approve`,{revisionId:bad.data.service.workingRevisionId,confirmCommercialApproval:true},1,'subject-admin')).status,422);
      const wrong=draft(categoryId);wrong.options[0].price={kind:'fixed',amountMinor:100,unit:'service',currency:'UNKNOWN'};
      assert.equal((await call('POST','/services',wrong)).status,422);
      await db.prepare("INSERT INTO media_assets(id,private_object_key,provenance,uploaded_by) VALUES ('pending-test-media','development/quarantine/pending','demo','fixture-editor')").run();
      const pending=await call('POST','/services',draft(categoryId,'pending-test-media'));
      assert.equal((await call('POST',`/services/${pending.data.service.id}/approve`,{revisionId:pending.data.service.workingRevisionId,confirmCommercialApproval:true},1,'subject-admin')).status,422);
      const self=await call('POST','/services',draft(categoryId,'approved-test-media'),undefined,'subject-admin');
      assert.equal((await call('POST',`/services/${self.data.service.id}/approve`,{revisionId:self.data.service.workingRevisionId,confirmCommercialApproval:true},1,'subject-admin')).status,403);
    });
    await t.test('translation-only revision preserves other fields and rechecks its own DB permission',async()=>{
      const payload=draft(categoryId,'approved-test-media');const fixture=await call('POST','/services',payload);const id=fixture.data.service.id;
      await db.prepare("DELETE FROM admin_role_permissions WHERE role_id='editor' AND permission='drafts:write'").run();
      try{
        const translated=await call('PATCH',`/services/${id}/translations`,{translations:{es:{title:'Traducción de prueba',description:'Local'},en:{title:'Test translation',description:'Local'}}},fixture.version);
        assert.equal(translated.status,200);const current=translated.data.revisions.find(r=>r.id===translated.data.service.workingRevisionId);
        assert.equal(current.translations.en.title,'Test translation');assert.deepEqual(current.options,payload.options);assert.equal(current.slug,payload.slug);
      }finally{await db.prepare("INSERT INTO admin_role_permissions(role_id,permission) VALUES ('editor','drafts:write')").run();}
    });
    await t.test('approval seals exact hash/revision; publication and audit commit together',async()=>{
      const id=service.data.service.id;const revisionId=service.data.service.workingRevisionId;
      assert.equal((await call('POST',`/services/${id}/publish`,{revisionId},service.version,'subject-editor')).status,403);
      const ready=await call('POST',`/services/${id}/validate`,{revisionId},service.version,'subject-admin');assert.equal(ready.status,200);
      assert.equal((await call('POST',`/services/${id}/approve`,{revisionId,confirmCommercialApproval:false},service.version,'subject-admin')).status,422);
      service=await call('POST',`/services/${id}/approve`,{revisionId,confirmCommercialApproval:true},service.version,'subject-admin');assert.equal(service.status,200,JSON.stringify(service));assert.equal(service.version,2);
      const sealed=await db.prepare('SELECT content_hash,sealed_at FROM service_revisions WHERE id=?').bind(revisionId).first();assert.match(sealed.content_hash,/^[a-f0-9]{64}$/);assert.ok(sealed.sealed_at);
      service=await call('POST',`/services/${id}/publish`,{revisionId},service.version,'subject-admin');assert.equal(service.status,200,JSON.stringify(service));assert.equal(service.delivery,'visible');assert.equal(service.version,3);
      const audit=(await db.prepare("SELECT * FROM audit_events WHERE action='service.publish' AND entity_id=?").bind(id).all()).results;assert.equal(audit.length,1);
      assert.equal((await db.prepare('SELECT count(*) n FROM mutation_guards').first()).n,0);
    });
    await t.test('public categories/services/detail expose only immutable approved DTOs, with no private bindings',async()=>{
      const result=await pub();assert.equal(result.status,200);const parsed=PublicCatalogSchema.parse(result.body);assert.equal(parsed.services.length,1);assert.equal(parsed.categories.length,1);
      const text=JSON.stringify(result.body);for(const secret of ['internalNotes','PRIVATE TEST NOTES','workingRevisionId','commercialApproval','private_object_key','development/quarantine','/api/v1/media','reviewed_by','usageApproval'])assert.ok(!text.includes(secret),secret);
      const detail=await pub('/v1/services/'+service.data.service.id);assert.equal(detail.body.service.revisionId,service.data.service.publishedRevisionId);
      assert.match(detail.body.service.media[0].url,/^\/v1\/media\/[a-f0-9]{64}$/);
      assert.equal((await pub('/v1/services',{method:'POST'})).status,405);
      assert.equal((await pub('/api/v1/services')).status,404);
      const config=JSON.parse(readFileSync(new URL('../wrangler.public.local.json',import.meta.url),'utf8'));assert.equal(config.env.development.d1_databases,undefined);assert.deepEqual(config.env.development.r2_buckets.map(b=>b.binding),['PUBLICATION']);
    });
    await t.test('editing a published service creates a new draft revision and cannot edit the published revision',async()=>{
      const id=service.data.service.id;const published=service.data.service.publishedRevisionId;
      const edited=await call('PATCH','/services/'+id,{...data,translations:{...data.translations,en:{title:'DRAFT SECRET',description:'Not approved'}}},service.version);assert.equal(edited.status,200,JSON.stringify(edited));service=edited;
      assert.notEqual(service.data.service.workingRevisionId,published);assert.equal(service.data.service.publishedRevisionId,published);
      assert.ok(!JSON.stringify((await pub()).body).includes('DRAFT SECRET'));
      assert.equal((await call('PATCH',`/services/${id}/revisions/${published}`,data,service.version)).status,405);
      assert.equal((await call('GET',`/services/${id}/revisions`)).items.length,2);
      const history=await call('GET',`/services/${id}/revisions/${published}`);assert.equal(history.revision.translations.en.title,data.translations.en.title);
    });
    await t.test('stale versions and simultaneous writers yield one winner; no false success audit',async()=>{
      const id=service.data.service.id;const version=service.version;
      const attempts=await Promise.all([call('PATCH','/services/'+id,data,version),call('PATCH','/services/'+id,{...data,internalNotes:'RACE TEST'},version)]);
      assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);service=attempts.find(x=>x.status===200);
      assert.equal((await call('PATCH','/services/'+id,data,version)).status,409);
    });
    await t.test('SQL injection stays data, foreign references and invalid state transitions are rejected',async()=>{
      assert.equal((await call('GET',"/services?q="+encodeURIComponent("%' OR 1=1 --"))).items.length,0);
      assert.equal((await call('POST','/services',{...draft(categoryId),categoryId:'nonexistent'})).status,422);
      assert.equal((await call('POST',`/services/${service.data.service.id}/unpublish`,{},service.version,'subject-editor')).status,403);
      assert.equal((await call('PATCH','/categories/'+categoryId,categoryData,2)).status,409);
      assert.equal((await db.prepare('SELECT count(*) n FROM principals').first()).n,7);
    });
    await t.test('unpublish removes public service; archival is final and invalid repeated state changes fail',async()=>{
      const id=service.data.service.id;
      service=await call('POST',`/services/${id}/unpublish`,{},service.version,'subject-admin');assert.equal(service.status,200,JSON.stringify(service));assert.equal(service.data.service.status,'draft');assert.equal((await pub('/v1/services/'+id)).status,404);
      assert.equal((await call('POST',`/services/${id}/unpublish`,{},service.version,'subject-admin')).status,409);
      service=await call('POST',`/services/${id}/archive`,{},service.version,'subject-admin');assert.equal(service.status,200);
      assert.equal((await call('PATCH','/services/'+id,data,service.version)).status,409);
      assert.equal((await call('POST',`/services/${id}/archive`,{},service.version,'subject-admin')).status,409);
      assert.deepEqual((await pub('/v1/categories')).body.categories,[]);
    });
    await t.test('byte limit, body allowlists, missing version and audit pagination are enforced',async()=>{
      assert.equal((await call('POST','/services',{...data,internalNotes:'x'.repeat(70000)})).status,413);
      assert.equal((await call('PATCH','/services/'+service.data.service.id,data)).status,428);
      assert.equal((await call('GET','/audit',undefined,undefined,'subject-editor')).status,403);
      assert.ok((await call('GET','/audit?limit=2',undefined,undefined,'subject-admin')).items.length<=2);
    });
    await t.test('a failing business audit rolls back publication, command, outbox and version together',async()=>{
      let fixture=await call('POST','/services',draft(categoryId,'approved-test-media'));
      const id=fixture.data.service.id;const revisionId=fixture.data.service.workingRevisionId;
      fixture=await call('POST',`/services/${id}/approve`,{revisionId,confirmCommercialApproval:true},fixture.version,'subject-admin');
      const before=(await db.prepare('SELECT count(*) n FROM publication_outbox').first()).n;
      const previousPublic=JSON.stringify((await pub()).body);
      await db.prepare("CREATE TRIGGER test_fail_business_audit BEFORE INSERT ON audit_events WHEN NEW.action='service.publish' BEGIN SELECT RAISE(ABORT,'test_transaction_failure'); END").run();
      try{
        const result=await call('POST',`/services/${id}/publish`,{revisionId},fixture.version,'subject-admin');assert.equal(result.status,503);assert.equal(result.error,'transaction_failed');
        const actual=await call('GET','/services/'+id);assert.equal(actual.version,fixture.version);assert.equal(actual.data.service.status,'draft');
        assert.equal((await db.prepare('SELECT count(*) n FROM publication_outbox').first()).n,before);
        assert.equal((await db.prepare('SELECT count(*) n FROM publication_commands WHERE service_id=?').bind(id).first()).n,0);
        assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE entity_id=? AND action='service.publish'").bind(id).first()).n,0);
        assert.equal(JSON.stringify((await pub()).body),previousPublic);
      }finally{await db.prepare('DROP TRIGGER test_fail_business_audit').run();}
    });
    await t.test('category changes invalidate prior commercial approval rather than silently publishing new category content',async()=>{
      let fixture=await call('POST','/services',draft(categoryId,'approved-test-media'));const id=fixture.data.service.id;const revisionId=fixture.data.service.workingRevisionId;
      fixture=await call('POST',`/services/${id}/approve`,{revisionId,confirmCommercialApproval:true},fixture.version,'subject-admin');
      const changed=await call('PATCH','/categories/'+categoryId,{...categoryData,translations:{es:{name:'Cambio de prueba'},en:{name:'Changed test'}}},2);assert.equal(changed.status,200);
      assert.equal((await call('POST',`/services/${id}/publish`,{revisionId},fixture.version,'subject-admin')).status,422);
    });
    await t.test('revoked administrator is rechecked inside the SQL transaction, not only middleware',async()=>{
      const version=(await db.prepare('SELECT version FROM catalog_state WHERE id=1').first()).version;
      await db.prepare("UPDATE principals SET enabled=0 WHERE id='fixture-editor'").run();
      try{
        await assert.rejects(commitCatalogMutation(db,{id:'fixture-editor',role:'editor',permissions:['drafts:write']},'drafts:write',version,{sql:'1',values:[]},[],{action:'test.forbidden',entity:'service',id:'test',requestId:crypto.randomUUID()}),e=>e.status===403);
        assert.equal((await call('GET','/services')).status,403);
      }finally{await db.prepare("UPDATE principals SET enabled=1 WHERE id='fixture-editor'").run();}
    });
    await t.test('delivery failure is pending, retry is explicit, and parallel publication cannot overwrite a newer snapshot',async()=>{
      let fixture=await call('POST','/services',draft(categoryId,'approved-test-media'));const id=fixture.data.service.id;const revisionId=fixture.data.service.workingRevisionId;
      fixture=await call('POST',`/services/${id}/approve`,{revisionId,confirmCommercialApproval:true},fixture.version,'subject-admin');
      const unavailable={async get(){throw new Error('test store offline');},async put(){throw new Error('test store offline');}};
      const pending=await call('POST',`/services/${id}/publish`,{revisionId},fixture.version,'subject-admin',{PUBLICATION:unavailable});assert.equal(pending.status,202);assert.equal(pending.delivery,'pending');
      assert.equal((await pub('/v1/services/'+id)).status,503);
      // Advance the durable retry deadline in this fixture, without a production clock bypass.
      await db.prepare('UPDATE publication_outbox SET next_attempt_at=0').run();
      assert.equal((await call('POST','/catalog/sync',{},undefined,'subject-admin')).status,200);
      assert.equal((await pub('/v1/services/'+id)).status,200);
      const payload={...draft(categoryId,'approved-test-media'),options:fixture.data.revisions.find(r=>r.id===revisionId).options};
      const edited=await call('PATCH','/services/'+id,payload,pending.version);
      const approved=await call('POST',`/services/${id}/approve`,{revisionId:edited.data.service.workingRevisionId,confirmCommercialApproval:true},edited.version,'subject-admin');
      const attempts=await Promise.all([call('POST',`/services/${id}/publish`,{revisionId:approved.data.service.workingRevisionId},approved.version,'subject-admin'),call('POST',`/services/${id}/publish`,{revisionId:approved.data.service.workingRevisionId},approved.version,'subject-admin')]);
      assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
      assert.equal((await pub('/v1/services/'+id)).body.service.revisionId,approved.data.service.workingRevisionId);
    });
    await t.test('pending withdrawal preserves only the former approved copy; repeated reconciliation is idempotent',async()=>{
      let fixture=await call('POST','/services',draft(categoryId,'approved-test-media'));
      const id=fixture.data.service.id;const revisionId=fixture.data.service.workingRevisionId;
      fixture=await call('POST',`/services/${id}/approve`,{revisionId,confirmCommercialApproval:true},fixture.version,'subject-admin');
      fixture=await call('POST',`/services/${id}/publish`,{revisionId},fixture.version,'subject-admin');assert.equal(fixture.status,200);
      const unavailable={async get(){throw new Error('synthetic offline store');},async put(){throw new Error('synthetic offline store');}};
      const withdrawn=await call('POST',`/services/${id}/unpublish`,{},fixture.version,'subject-admin',{PUBLICATION:unavailable});
      assert.equal(withdrawn.status,202);assert.equal(withdrawn.delivery,'pending');assert.equal(withdrawn.data.service.status,'draft');
      assert.equal(withdrawn.data.service.publishedRevisionId,null);
      const previous=await pub('/v1/services/'+id);assert.equal(previous.status,503);
      const before=(await db.prepare('SELECT count(*) n FROM publication_commands').first()).n;
      await db.prepare('UPDATE publication_outbox SET next_attempt_at=0').run();
      assert.equal((await call('POST','/catalog/sync',{},undefined,'subject-admin')).status,200);
      assert.equal((await pub('/v1/services/'+id)).status,404);
      const acknowledged=(await db.prepare('SELECT * FROM publication_outbox ORDER BY generation DESC LIMIT 1').first());
      assert.ok(acknowledged.delivered_at);
      let writes=0;const watched={get:name=>store.get(name),put(...args){writes++;return store.put(...args);}};
      const text=await (await store.get('catalog/v1/current.json')).text();
      for(let attempt=0;attempt<3;attempt++)assert.equal((await call('POST','/catalog/sync',{},undefined,'subject-admin',{PUBLICATION:watched})).status,200);
      assert.equal(writes,0);assert.equal(await (await store.get('catalog/v1/current.json')).text(),text);
      assert.equal((await db.prepare('SELECT count(*) n FROM publication_commands').first()).n,before);
      assert.deepEqual(await db.prepare('SELECT * FROM publication_outbox WHERE generation=?').bind(acknowledged.generation).first(),acknowledged);
      assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE entity_id=? AND action='service.unpublish'").bind(id).first()).n,1);
    });
    await t.test('public corruption, private URL or unknown fields fail closed without static fallback',async()=>{
      const original=await store.get('catalog/v1/current.json');const text=await original.text();const snapshot=JSON.parse(text);
      try{
        snapshot.catalog.services[0].internalNotes='must not leak';await store.put('catalog/v1/current.json',JSON.stringify(snapshot));
        assert.equal((await pub()).status,503);
        delete snapshot.catalog.services[0].internalNotes;snapshot.catalog.services[0].media[0].url='/api/v1/media/private';await store.put('catalog/v1/current.json',JSON.stringify(snapshot));
        assert.equal((await pub()).status,503);
        assert.equal((await call('POST','/catalog/sync',{},undefined,'subject-admin')).status,200);
        assert.equal((await pub()).status,200);
      }finally{await store.put('catalog/v1/current.json',text);}
    });
    await t.test('barrier rejects a divergent higher generation and sync restores the authoritative snapshot',async()=>{
      const original=await store.get('catalog/v1/current.json');const text=await original.text();const newer=JSON.parse(text);newer.generation+=1000;
      await store.put('catalog/v1/current.json',JSON.stringify(newer));
      try{
        assert.equal((await pub()).status,503);
        const result=await call('POST','/catalog/sync',{},undefined,'subject-admin');
        assert.equal(result.status,200);assert.equal(await (await store.get('catalog/v1/current.json')).text(),text);
        assert.equal((await pub()).status,200);
      }finally{await store.put('catalog/v1/current.json',text);}
    });
  } finally {await mf.dispose();}
});

test('0004 upgrades existing publication commands/outbox without data loss or foreign-key breakage',async()=>{
  const {mf,db}=await localDatabase({},3);
  try{
    await seedAdministrators(db);
    await db.batch([
      db.prepare("INSERT INTO services(id,provenance,working_revision_id) VALUES ('legacy-test-service','demo','legacy-test-revision')"),
      db.prepare("INSERT INTO service_revisions(id,service_id,number,created_by) VALUES ('legacy-test-revision','legacy-test-service',1,'fixture-editor')"),
      db.prepare("INSERT INTO publication_commands(id,service_id,actor_id,idempotency_key,action,expected_version) VALUES ('legacy-command','legacy-test-service','fixture-admin','legacy-test-key','publish',1)"),
      db.prepare("INSERT INTO publication_outbox(generation,command_id) VALUES (1,'legacy-command')"),
    ]);
    const sql=readFileSync(new URL('../../../../packages/database/migrations/0004_catalog_operations.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
    await db.batch(sql.split(/;\s*(?=(?:CREATE|INSERT|DROP|ALTER|PRAGMA)\b)/).map(q=>db.prepare(q.trim())));
    assert.equal((await db.prepare("SELECT action FROM publication_commands WHERE id='legacy-command'").first()).action,'publish');
    assert.equal((await db.prepare('SELECT catalog_json FROM publication_outbox WHERE generation=1').first()).catalog_json,null);
    assert.equal((await db.prepare('SELECT version FROM catalog_state WHERE id=1').first()).version,1);
    await db.prepare("INSERT INTO publication_commands(id,service_id,actor_id,idempotency_key,action,expected_version) VALUES ('unpublish-command','legacy-test-service','fixture-admin','new-key','unpublish',1)").run();
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});

test('real admin and public Worker bundles run separately in workerd with only a shared local publication bucket',async()=>{
  const localOrigin='https://localhost';
  const key=await signingFixture('separate-workers');const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',cf:false,telemetry:{enabled:false},workers:[
    {name:'admin-test-only',modules:true,script:readFileSync(new URL('../.wrangler/build/worker.js',import.meta.url),'utf8'),compatibilityDate:'2026-07-30',
      bindings:{APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:localOrigin,MUTATIONS_ENABLED:'true'},d1Databases:{DB:'isolated-http-test-db'},r2Buckets:{PUBLICATION:'shared-publication-test'},
      outboundService:async req=>{assert.equal(req.url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[key.publicJwk]});}},
    {name:'barrier-test-only',modules:true,script:readFileSync(new URL('../.wrangler/build/barrier.js',import.meta.url),'utf8'),compatibilityDate:'2026-07-30',bindings:{APP_ENV:'development'},d1Databases:{DB:'isolated-http-test-db'}},
    {name:'public-test-only',modules:true,script:readFileSync(new URL('../.wrangler/build/public.js',import.meta.url),'utf8'),compatibilityDate:'2026-07-30',bindings:{APP_ENV:'development'},r2Buckets:{PUBLICATION:'shared-publication-test'},serviceBindings:{CATALOG_BARRIER:'barrier-test-only'}},
  ]}));
  try{
    const db=await mf.getD1Database('DB','admin-test-only');
    const manifest=JSON.parse(readFileSync(new URL('../../../../packages/database/migrations.sha256.json',import.meta.url),'utf8'));
    for(const {file}of manifest.migrations){const sql=readFileSync(new URL('../../../../packages/database/migrations/'+file,import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();await db.batch(sql.split(/;\s*(?=(?:CREATE|INSERT|DROP|ALTER|UPDATE|PRAGMA)\b)/).map(q=>db.prepare(q.trim())));}
    await seedAdministrators(db);
    const admin=await mf.getWorker('admin-test-only');const publicApi=await mf.getWorker('public-test-only');
    assert.equal((await admin.fetch('https://admin.test.invalid/api/v1/services')).status,401);
    const token=await key.token('subject-admin');
    const headers={'Cf-Access-Jwt-Assertion':token,Origin:localOrigin,'Content-Type':'application/json','X-Kuwago-Request':'1'};
    const category=await admin.fetch('https://admin.test.invalid/api/v1/categories',{method:'POST',headers,body:JSON.stringify(categoryData)});assert.equal(category.status,201,await category.text());
    const sync=await admin.fetch('https://admin.test.invalid/api/v1/catalog/sync',{method:'POST',headers,body:'{}'});assert.equal(sync.status,200);
    const result=await publicApi.fetch('https://public.test.invalid/v1/catalog');assert.equal(result.status,200);assert.deepEqual((await result.json()).services,[]);
    assert.equal((await publicApi.fetch('https://public.test.invalid/api/v1/services')).status,404);
  }finally{await mf.dispose();}
});
