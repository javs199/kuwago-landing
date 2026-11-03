import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {target,migrations,ledgerSql} from '../scripts/safe-d1/policy.mjs';
import {captureDatabase} from '../scripts/safe-d1/snapshot.mjs';
import {validateCurrentAdminSnapshot} from '../scripts/safe-d1/backup-current-admin.mjs';
test('current-admin backup accepts schema six with exact enabled administrator, disabled grantor and audit; rejects unrelated content',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;'+ledgerSql);
  for(const m of migrations){db.exec(readFileSync(new URL('../../../../packages/database/migrations/'+m.name,import.meta.url),'utf8'));db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(m.name);}
  const id='access:b329a52cf0fdf888743364ca9b3ff5a753aceb6fdd1d2937951e6c43c6e0dcfd';
  db.prepare('INSERT INTO principals(id,issuer,subject,enabled) VALUES (?,?,?,1)').run(id,'https://blue-bread-0e64.cloudflareaccess.com','57fd05c6-e0f3-5838-8e16-4ab77d8dff41');
  db.exec("INSERT INTO principals(id,issuer,subject,enabled) VALUES ('technical-test','urn:test','test',0)");
  db.prepare("INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES (?,'super_admin','technical-test')").run(id);
  const capture=await captureDatabase({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>db.prepare(sql).all()});
  assert.equal(validateCurrentAdminSnapshot(capture).applicationTables,32);
  const disabled=structuredClone(capture);const p=disabled.snapshot.tables.find(t=>t.name==='principals');p.rows.forEach(row=>row[p.columns.indexOf('enabled')]='integer:30');
  assert.throws(()=>validateCurrentAdminSnapshot(disabled),/identity/);
  const other=structuredClone(capture);other.snapshot.tables.find(t=>t.name==='services').rows.push(Array(10).fill('null:'));assert.throws(()=>validateCurrentAdminSnapshot(other),/content/);
 }finally{db.close();}
});

