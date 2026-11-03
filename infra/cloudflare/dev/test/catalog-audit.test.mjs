import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorker} from '../.wrangler/build/security.js';
import {localDatabase,seedAdministrators,issuer,audience,origin,signingFixture,jwksFetcher,request} from './auth-fixtures.mjs';

const migration=readFileSync(new URL('../../../../packages/database/migrations/0004_catalog_operations.sql',import.meta.url),'utf8')
  .replace(/^--.*$/gm,'').trim().split(/;\s*(?=(?:CREATE|INSERT|DROP|ALTER|PRAGMA)\b)/);

async function existingDatabase(){
  const local=await localDatabase({},3);const {db}=local;
  try{
    await seedAdministrators(db);
    // Synthetic historical published revision plus a newer working draft. No commercial data or bytes.
    await db.batch([
      db.prepare("INSERT INTO categories(id,slug,active) VALUES ('audit-category','audit-category',1)"),
      db.prepare("INSERT INTO category_translations VALUES ('audit-category','es','Prueba'),('audit-category','en','Test')"),
      db.prepare("INSERT INTO services(id,provenance,working_revision_id,internal_notes) VALUES ('audit-service','verified','audit-r2','PRIVATE AUDIT FIXTURE')"),
      db.prepare("INSERT INTO service_revisions(id,service_id,number,slug,category_id,created_by) VALUES ('audit-r1','audit-service',1,'audit-service','audit-category','fixture-editor'),('audit-r2','audit-service',2,'audit-service','audit-category','fixture-editor')"),
      db.prepare("INSERT INTO service_translations VALUES ('audit-r1','es','Publicado de prueba','Prueba'),('audit-r1','en','Published test','Test'),('audit-r2','es','Borrador de prueba','Prueba'),('audit-r2','en','Draft test','Test')"),
      db.prepare("INSERT INTO option_identities VALUES ('audit-option','audit-service')"),
      db.prepare("INSERT INTO service_options(revision_id,service_id,option_id,sort_order,duration_minutes,experience_type,venue) VALUES ('audit-r1','audit-service','audit-option',0,60,'private','in_property'),('audit-r2','audit-service','audit-option',0,90,'shared','off_property')"),
      db.prepare("INSERT INTO option_translations VALUES ('audit-r1','audit-option','es','Prueba'),('audit-r1','audit-option','en','Test'),('audit-r2','audit-option','es','Borrador'),('audit-r2','audit-option','en','Draft')"),
      db.prepare("INSERT INTO option_prices VALUES ('audit-r1','audit-option','quote',NULL,NULL,'service'),('audit-r2','audit-option','quote',NULL,'CRC','group')"),
      db.prepare("INSERT INTO media_assets(id,private_object_key,derivative_object_key,state,provenance,usage_approval,sha256,mime_type,byte_size,width,height,uploaded_by,reviewed_by,reviewed_at) VALUES ('audit-media','development/quarantine/audit','development/derived/audit','approved','verified','approved',?,'image/png',1,1,1,'fixture-editor','fixture-admin','2026-01-01T00:00:00Z')").bind('a'.repeat(64)),
      db.prepare("INSERT INTO revision_media VALUES ('audit-r1','audit-media',0),('audit-r2','audit-media',0)"),
      db.prepare("INSERT INTO revision_media_translations VALUES ('audit-r1','audit-media','es','Prueba'),('audit-r1','audit-media','en','Test'),('audit-r2','audit-media','es','Prueba'),('audit-r2','audit-media','en','Test')"),
      db.prepare("UPDATE service_revisions SET content_hash=?,sealed_at='2026-01-01T00:00:00Z' WHERE id='audit-r1'").bind('b'.repeat(64)),
      db.prepare("INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by) VALUES ('audit-approval','audit-r1',?,'fixture-admin')").bind('b'.repeat(64)),
      db.prepare("UPDATE services SET status='published',published_revision_id='audit-r1' WHERE id='audit-service'"),
      db.prepare("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,revision_id,request_id,outcome) VALUES ('audit-event','fixture-admin','test.publication','service','audit-service','audit-r1','audit-request','allowed')"),
      db.prepare("INSERT INTO publication_commands(id,service_id,actor_id,idempotency_key,action,expected_version,state) VALUES ('audit-command-1','audit-service','fixture-admin','audit-key-1','publish',1,'visible'),('audit-command-2','audit-service','fixture-admin','audit-key-2','archive',2,'pending')"),
      db.prepare("INSERT INTO publication_outbox(generation,command_id,attempts,delivered_at,last_error_code) VALUES (7,'audit-command-1',3,'2026-01-01T00:00:00Z',NULL),(19,'audit-command-2',2,NULL,'synthetic_failure')"),
    ]);
    return local;
  }catch(error){await local.mf.dispose();throw error;}
}

async function snapshot(db){
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_*' ORDER BY name").all()).results;
  const result=[];
  for(const {name} of tables){
    // Names/columns originate exclusively from SQLite metadata, never HTTP input.
    const columns=(await db.prepare(`PRAGMA table_info("${name}")`).all()).results.map(c=>c.name);
    result.push({name,columns,rows:(await db.prepare(`SELECT ${columns.map(c=>`"${c}"`).join(',')} FROM "${name}" ORDER BY ${columns.map(c=>`"${c}"`).join(',')}`).all()).results});
  }
  return result;
}
async function assertPreserved(db,before){
  for(const {name,columns,rows} of before){
    assert.deepEqual((await db.prepare(`SELECT ${columns.map(c=>`"${c}"`).join(',')} FROM "${name}" ORDER BY ${columns.map(c=>`"${c}"`).join(',')}`).all()).results,rows,name);
  }
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
}

test('audit: complete fresh local migration chain has clean integrity and no scratch tables',async()=>{
  const {mf,db}=await localDatabase();
  try{
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
    assert.equal((await db.prepare('SELECT version FROM catalog_state').first()).version,0);
    assert.equal((await db.prepare('SELECT count(*) n FROM services').first()).n,0);
    assert.deepEqual((await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%v4%'").all()).results,[]);
  }finally{await mf.dispose();}
});

test('audit: upgrade preserves every prior row, both revisions, approvals and outbox metadata',async()=>{
  const {mf,db}=await existingDatabase();
  try{
    const before=await snapshot(db);
    await db.batch(migration.map(q=>db.prepare(q.trim())));
    await assertPreserved(db,before);
    assert.equal((await db.prepare('SELECT version FROM catalog_state').first()).version,19);
    assert.deepEqual((await db.prepare('SELECT catalog_json FROM publication_outbox ORDER BY generation').all()).results,[{catalog_json:null},{catalog_json:null}]);
    assert.equal((await db.prepare("SELECT category_version FROM commercial_approvals WHERE id='audit-approval'").first()).category_version,null);
    await assert.rejects(db.prepare("UPDATE service_translations SET title='Forbidden' WHERE revision_id='audit-r1'").run(),/sealed_revision_immutable/);
    await assert.rejects(db.prepare("DELETE FROM service_revisions WHERE id='audit-r1'").run(),/sealed_revision_immutable/);
    await assert.rejects(db.prepare("INSERT INTO publication_outbox(generation,command_id) VALUES (20,'missing-command')").run(),/FOREIGN KEY/);
    await db.prepare("INSERT INTO publication_commands(id,service_id,actor_id,idempotency_key,action,expected_version) VALUES ('audit-unpublish','audit-service','fixture-admin','audit-key-3','unpublish',3)").run();
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});

test('audit: failure after 0004 table reconstruction rolls back all schema and historical rows',async()=>{
  const {mf,db}=await existingDatabase();
  try{
    const before=await snapshot(db);
    const schema=(await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).results;
    await assert.rejects(db.batch([...migration.map(q=>db.prepare(q.trim())),db.prepare('INSERT INTO mutation_guards VALUES (?,0,1)').bind('forced-audit-failure')]));
    await assertPreserved(db,before);
    assert.deepEqual((await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).results,schema);
  }finally{await mf.dispose();}
});

test('audit: every catalog route rejects anonymous, invalid and disabled identities and enforces the role matrix',async()=>{
  const {mf,db}=await localDatabase({r2Buckets:{PUBLICATION:'audit-authorization-publication'}});
  try{
    await seedAdministrators(db);const key=await signingFixture('audit-role-matrix');
    const worker=createWorker(jwksFetcher(()=>[key.publicJwk]).fetch,()=>{});
    const env={DB:db,APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true',PUBLICATION:await mf.getR2Bucket('PUBLICATION')};
    const endpoints=[
      ['GET','/session',false],['GET','/services',false],['POST','/services',false],
      ['GET','/services/absent',false],['PATCH','/services/absent',false],['PATCH','/services/absent/translations',false],
      ['GET','/services/absent/revisions',false],['GET','/services/absent/revisions/absent',false],
      ...['validate','approve','publish','unpublish','archive'].map(action=>['POST','/services/absent/'+action,true]),
      ['GET','/categories',false],['POST','/categories',false],['GET','/categories/absent',false],['PATCH','/categories/absent',false],
      ['GET','/audit',true],['POST','/catalog/sync',true],
    ];
    const identities=[undefined,'invalid.jwt.value',await key.token('subject-disabled')];
    const tokens={editor:await key.token('subject-editor'),admin:await key.token('subject-admin'),super_admin:await key.token('subject-super')};
    for(const [method,path,publisherOnly] of endpoints){
      const invoke=token=>worker.fetch(request(token,'/api/v1'+path,method,{Origin:origin,'Content-Type':'application/json','X-Kuwago-Request':'1','If-Match':'"1"'},method==='GET'?undefined:'{}'),env);
      for(const [index,token] of identities.entries())assert.equal((await invoke(token)).status,index===2?403:401,`${method} ${path} identity ${index}`);
      for(const [role,token] of Object.entries(tokens)){
        const response=await invoke(token);
        if(role==='editor'&&publisherOnly)assert.equal(response.status,403,`${method} ${path} editor`);
        else assert.ok([200,201,404,422,428].includes(response.status),`${method} ${path} ${role}: ${response.status}`);
      }
    }
    assert.equal((await db.prepare('SELECT count(*) n FROM services').first()).n,0);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});
