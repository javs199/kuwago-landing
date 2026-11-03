import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ledgerSql,migrations} from '../scripts/safe-d1/policy.mjs';
import {localSnapshot,migrationPlan,runPolicyMigration,policyPrincipal,frozenSixSources} from '../scripts/single-operator-migration.mjs';
const migration=readFileSync(new URL('../next-stage/0007_single_operator_approval.sql',import.meta.url),'utf8');
function fixture(){
 const db=new DatabaseSync(':memory:');
 const backupSql=[ledgerSql+';',...frozenSixSources(),...migrations.map(m=>`INSERT INTO d1_migrations(name) VALUES ('${m.name}');`),
 `INSERT INTO principals(id,issuer,subject,enabled) VALUES ('technical','urn:test','technical',0),('${policyPrincipal}','https://blue-bread-0e64.cloudflareaccess.com','57fd05c6-e0f3-5838-8e16-4ab77d8dff41',1),('admin','urn:test','admin',1);`,
 `INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES ('${policyPrincipal}','super_admin','technical'),('admin','admin','technical');`,
 `INSERT INTO media_assets(id,private_object_key,provenance,uploaded_by) VALUES ('existing','development/quarantine/existing','demo','${policyPrincipal}');`,
 "INSERT INTO media_processing(media_id) VALUES ('existing');"].join('\n');
 db.exec('PRAGMA foreign_keys=ON;BEGIN;PRAGMA defer_foreign_keys=ON;'+backupSql+'COMMIT');
 const schema=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name").all();
 const literal=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
 const dump=schema.map(r=>r.sql+';').join('\n')+'\n'+schema.filter(r=>r.type==='table').flatMap(t=>db.prepare(`SELECT * FROM "${t.name}"`).all().map(row=>`INSERT INTO "${t.name}" VALUES (${Object.values(row).map(literal).join(',')});`)).join('\n');
 const plan=migrationPlan({backupSql:dump,baseline:localSnapshot(db),sql:migration,executionId:'test-policy-7',now:'2026-10-27T00:00:00.000Z'});
 return {db,plan};
}
test('policy migration preserves media and child references; SQL allows only canonical enabled super_admin self approval',()=>{
 const {db,plan}=fixture();try{
  db.exec('BEGIN');for(const s of plan.batch)db.prepare(s.sql).run(...s.params);db.exec('COMMIT');
  assert.equal(db.prepare('SELECT count(*) AS n FROM media_processing').get().n,1);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const make=(id,uploader)=>db.prepare("INSERT INTO media_assets(id,private_object_key,provenance,uploaded_by) VALUES (?,?,'demo',?)").run(id,'development/quarantine/'+id,uploader);
  const validate=id=>db.prepare("UPDATE media_assets SET state='validated',derivative_object_key=?,sha256=?,mime_type='image/png',byte_size=80,width=1,height=1 WHERE id=?").run('development/derived/'+id,'a'.repeat(64),id);
  const approve=(id,who,mode)=>db.prepare("UPDATE media_assets SET state='approved',provenance='verified',usage_approval='approved',reviewed_by=?,reviewed_at='2026-10-27T00:00:00Z',approval_mode=? WHERE id=?").run(who,mode,id);
  validate('existing');assert.throws(()=>approve('existing',policyPrincipal,'independent'));approve('existing',policyPrincipal,'super_admin_self');
  make('admin-image','admin');validate('admin-image');assert.throws(()=>approve('admin-image','admin','super_admin_self'));approve('admin-image',policyPrincipal,'independent');
  assert.throws(()=>db.prepare("UPDATE media_assets SET approval_mode='independent' WHERE id='existing'").run());
  db.exec("BEGIN;INSERT INTO services(id,provenance,status,working_revision_id) VALUES ('service','demo','draft','super-revision');");
  const revision=(id,who)=>{db.prepare("INSERT INTO service_revisions(id,service_id,number,created_by) VALUES (?,'service',?,?)").run(id,id==='super-revision'?1:2,who);db.prepare("UPDATE service_revisions SET content_hash=?,sealed_at='2026-10-27T00:00:00Z' WHERE id=?").run('b'.repeat(64),id);};
  revision('super-revision',policyPrincipal);revision('admin-revision','admin');db.exec('COMMIT');
  const serviceApproval=(id,rev,who,mode)=>db.prepare('INSERT INTO commercial_approvals(id,revision_id,content_hash,approved_by,approval_mode) VALUES (?,?,?,?,?)').run(id,rev,'b'.repeat(64),who,mode);
  assert.throws(()=>serviceApproval('wrong','super-revision',policyPrincipal,'independent'));
  serviceApproval('correct','super-revision',policyPrincipal,'super_admin_self');
  assert.throws(()=>serviceApproval('admin-self','admin-revision','admin','super_admin_self'));
  serviceApproval('reviewed','admin-revision',policyPrincipal,'independent');
 }finally{db.close();}
});
for(const scenario of ['success','concurrent','ambiguous','persistence'])test('durable policy runner: '+scenario,async()=>{
 const {db,plan}=fixture();let sends=0;const events=[];
 try{
  if(scenario==='concurrent')db.exec("UPDATE principals SET enabled=0 WHERE id='admin'");
  const transport={schemaRows:async()=>db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),snapshot:async()=>({snapshot:localSnapshot(db)}),bookmark:async()=>'test-bookmark',apply:async batch=>{sends++;db.exec('BEGIN');try{for(const s of batch)db.prepare(s.sql).run(...s.params);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}if(scenario==='ambiguous')throw Error('lost response after commit');}};
  const result=await runPolicyMigration({plan,transport,journal:(name,value)=>{if(scenario==='persistence'&&name==='intent')throw Error('disk failure');events.push({name,value});}});
  assert.equal(sends,['concurrent','persistence'].includes(scenario)?0:1);
  assert.equal(result.status,['success','ambiguous'].includes(scenario)?'PASS':'STOPPED');
  if(scenario==='ambiguous'){assert.equal(result.ambiguousResponse,true);assert.equal(result.verified,true);}
 }finally{db.close();}
});
