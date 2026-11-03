import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { AdminServiceSchema, ServicePriceSchema } from '../../../../packages/contracts/dist/index.js';

// Every fixture below is synthetic, ephemeral and never uploaded to a remote resource.
const hash='a'.repeat(64);
test('D1 local migrations and relational invariants', async t => {
  const mf=new Miniflare(convertV4MiniflareOptions({
    name:'kuwago-database-test-only',host:'127.0.0.1',modules:true,
    script:'export default {fetch(){return new Response(null,{status:503})}}',
    compatibilityDate:'2026-07-30',telemetry:{enabled:false},cf:false,
    d1Databases:{DB:'ephemeral-test-db'},
  }));
  try {
    const db=await mf.getD1Database('DB');
    const sql=q=>db.prepare(q);
    const run=(q,...values)=>sql(q).bind(...values).run();
    await t.test('both versioned migrations apply to an empty local workerd D1',async()=>{
      // These migration files contain only CREATE/INSERT top-level statements.
      // Keep trigger bodies intact; the Wrangler CLI also independently applies these files.
      for(const file of ['0001_admin_catalog.sql','0002_integrity_guards.sql']){
        const content=readFileSync(new URL('../../../../packages/database/migrations/'+file,import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
        const statements=content.split(/;\s*(?=(?:CREATE|INSERT)\b)/).map(q=>q.trim()).filter(Boolean);
        await db.batch(statements.map(q=>sql(q)));
      }
      assert.deepEqual((await sql('PRAGMA foreign_key_check').all()).results,[]);
      assert.equal((await sql('SELECT count(*) AS n FROM principals').first()).n,0);
      assert.equal((await sql('SELECT count(*) AS n FROM services').first()).n,0);
      assert.equal((await sql('SELECT count(*) AS n FROM roles').first()).n,4);
    });
    await db.batch([
      sql("INSERT INTO principals(id,issuer,subject,enabled) VALUES ('test-operator','https://test.invalid','operator',1),('test-editor','https://test.invalid','editor',1),('test-reviewer','https://test.invalid','reviewer',1)"),
      sql("INSERT INTO principal_roles(principal_id,role_id,granted_by) VALUES ('test-reviewer','publisher','test-operator')"),
      sql("INSERT INTO categories(id,slug,active) VALUES ('test-category','test-category',1)"),
      sql("INSERT INTO category_translations(category_id,locale,name) VALUES ('test-category','es','Prueba'),('test-category','en','Test')"),
    ]);
    const createService=(id,revision)=>db.batch([
      sql("INSERT INTO services(id,provenance,working_revision_id) VALUES (?,'verified',?)").bind(id,revision),
      sql("INSERT INTO service_revisions(id,service_id,number,created_by) VALUES (?,?,1,'test-editor')").bind(revision,id),
    ]);
    await createService('test-service','test-revision');
    await createService('test-other','test-other-revision');
    await t.test('deferred circular foreign keys allow atomic service and initial revision creation',async()=>{
      assert.equal((await sql("SELECT count(*) n FROM services WHERE id='test-service'").first()).n,1);
      await assert.rejects(run("INSERT INTO services(id,provenance,working_revision_id) VALUES ('dangling','demo','missing')"));
      await assert.rejects(run("UPDATE services SET working_revision_id='test-other-revision' WHERE id='test-service'"));
      await assert.rejects(run("UPDATE services SET status='unknown' WHERE id='test-service'"));
      await assert.rejects(run("UPDATE services SET status='published' WHERE id='test-service'"));
    });
    await t.test('role membership rejects self-grants and unknown roles; no implicit administrator',async()=>{
      await assert.rejects(run("INSERT INTO principal_roles VALUES ('test-editor','editor','test-editor','2026-10-23T00:00:00Z')"));
      await assert.rejects(run("INSERT INTO principal_roles VALUES ('test-editor','owner','test-operator','2026-10-23T00:00:00Z')"));
    });
    await db.batch([
      sql("INSERT INTO option_identities(id,service_id) VALUES ('test-option','test-service')"),
      sql("INSERT INTO service_options(revision_id,service_id,option_id,sort_order) VALUES ('test-revision','test-service','test-option',0)"),
    ]);
    await t.test('money uses safe integer minor units and explicit currencies; quote carries no amount',async()=>{
      for(const [kind,amount,currency]of [['fixed',1,null],['fixed',-1,'USD'],['fixed',1.5,'USD'],['fixed',1,'XXX'],['fixed',9007199254740992,'USD'],['quote',100,'USD']]){
        await assert.rejects(run("INSERT INTO option_prices VALUES ('test-revision','test-option',?,?,?,'service')",kind,amount,currency));
      }
      await run("INSERT INTO option_prices VALUES ('test-revision','test-option','quote',NULL,NULL,'service')");
      const price=await sql("SELECT kind,currency,unit FROM option_prices WHERE revision_id='test-revision'").first();
      assert.deepEqual(ServicePriceSchema.parse(price),{kind:'quote',currency:null,unit:'service'});
    });
    await t.test('locale, option ownership and media order integrity match the shared contract',async()=>{
      await assert.rejects(run("INSERT INTO service_translations VALUES ('test-revision','fr','','')"));
      await assert.rejects(run("INSERT INTO service_options(revision_id,service_id,option_id,sort_order) VALUES ('test-other-revision','test-other','test-option',0)"));
      await run("INSERT INTO media_assets(id,private_object_key,provenance,uploaded_by) VALUES ('test-image','development/quarantine/test-image','demo','test-editor')");
      await run("INSERT INTO revision_media VALUES ('test-revision','test-image',0)");
      await assert.rejects(run("INSERT INTO revision_media VALUES ('test-revision','test-image',8)"));
      await assert.rejects(run("INSERT INTO media_assets(id,private_object_key,provenance,uploaded_by) VALUES ('bad-key','https://public.invalid/x','demo','test-editor')"));
    });
    await t.test('draft DTO can round-trip to AdminServiceSchema without inventing public media URLs',async()=>{
      const service=await sql("SELECT id,provenance,status,working_revision_id AS workingRevisionId,published_revision_id AS publishedRevisionId,modified_at AS modifiedAt FROM services WHERE id='test-other'").first();
      const revision=await sql("SELECT id,service_id AS serviceId,slug,number,created_at AS createdAt,category_id AS categoryId FROM service_revisions WHERE id='test-other-revision'").first();
      assert.doesNotThrow(()=>AdminServiceSchema.parse({service,internalNotes:'',revisions:[{...revision,translations:{es:{title:'',description:''},en:{title:'',description:''}},options:[],media:[],commercialApproval:{status:'pending',revisionId:null}}]}));
    });
    await t.test('approval requires a sealed hash and independent enabled publisher',async()=>{
      await assert.rejects(run("INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by) VALUES ('test-approval','test-revision',?,'test-reviewer')",hash));
      await db.batch([
        sql("INSERT INTO service_translations VALUES ('test-revision','es','','')"),
        sql("INSERT INTO option_translations VALUES ('test-revision','test-option','es','')"),
        sql("INSERT INTO revision_media_translations VALUES ('test-revision','test-image','es','')"),
      ]);
      await run("UPDATE service_revisions SET category_id='test-category',slug='test-service',content_hash=?,sealed_at='2026-10-23T00:00:00Z' WHERE id='test-revision'",hash);
      await assert.rejects(run("INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by) VALUES ('self','test-revision',?,'test-editor')",hash));
      await assert.rejects(run("INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by) VALUES ('wrong','test-revision',?,'test-reviewer')",'b'.repeat(64)));
      await run("INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by) VALUES ('test-approval','test-revision',?,'test-reviewer')",hash);
    });
    await t.test('sealed revisions and every child collection reject edits, insertion and deletion',async()=>{
      for(const statement of ["UPDATE service_revisions SET slug='changed' WHERE id='test-revision'", "DELETE FROM service_revisions WHERE id='test-revision'", "INSERT INTO service_translations VALUES ('test-revision','en','Changed','Changed')", "UPDATE option_prices SET currency='USD' WHERE revision_id='test-revision'", "DELETE FROM revision_media WHERE revision_id='test-revision'", "INSERT INTO revision_media_translations VALUES ('test-revision','test-image','es','Changed')"]){await assert.rejects(run(statement));}
      for(const table of ['service_translations','service_options','option_translations','option_prices','revision_media','revision_media_translations']) {
        await assert.rejects(run(`DELETE FROM ${table} WHERE revision_id='test-revision'`),/sealed_revision_immutable/);
        await assert.rejects(run(`UPDATE ${table} SET revision_id='test-other-revision' WHERE revision_id='test-revision'`),/sealed_revision_immutable/);
      }
    });
    await t.test('SQL abort rolls back the full batch, including audit event; zero-row update alone is not an abort',async()=>{
      await assert.rejects(db.batch([
        sql("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,request_id,outcome) VALUES ('rollback-test','test-reviewer','test','service','test-service','local-test','allowed')"),
        sql("UPDATE service_revisions SET slug='forbidden' WHERE id='test-revision'"),
      ]));
      assert.equal((await sql("SELECT count(*) n FROM audit_events WHERE id='rollback-test'").first()).n,0);
      const result=await run("UPDATE services SET row_version=row_version+1 WHERE id='test-service' AND row_version=999");
      assert.equal(result.meta.changes,0);
    });
    await t.test('audit is append-only; approval can only be revoked once',async()=>{
      await run("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,request_id,outcome) VALUES ('audit-test','test-reviewer','test','service','test-service','local-test','allowed')");
      await assert.rejects(run("DELETE FROM audit_events WHERE id='audit-test'"));
      await assert.rejects(run("UPDATE audit_events SET outcome='failed' WHERE id='audit-test'"));
      await run("UPDATE commercial_approvals SET revoked_at='2026-10-23T01:00:00Z' WHERE id='test-approval'");
      await assert.rejects(run("UPDATE commercial_approvals SET revoked_at=NULL WHERE id='test-approval'"));
      await assert.rejects(run("UPDATE services SET status='published',published_revision_id='test-revision' WHERE id='test-service'"),/publication_requires/);
    });
    await t.test('media states and approved-file requirements prevent bypassing quarantine',async()=>{
      await assert.rejects(run("UPDATE media_assets SET state='approved' WHERE id='test-image'"));
      await assert.rejects(run("UPDATE media_assets SET state='validated' WHERE id='test-image'"));
      await assert.rejects(run("UPDATE media_assets SET width=4000,height=3000 WHERE id='test-image'"));
      await run("UPDATE media_assets SET state='rejected' WHERE id='test-image'");
      await assert.rejects(run("UPDATE media_assets SET state='quarantine' WHERE id='test-image'"));
    });
    await t.test('final foreign key check is clean',async()=>assert.deepEqual((await sql('PRAGMA foreign_key_check').all()).results,[]));
  } finally { await mf.dispose(); }
});
