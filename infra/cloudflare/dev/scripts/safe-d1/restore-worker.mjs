import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync,constants} from 'node:sqlite';
import {splitMigration} from './sql.mjs';
import {cellsQuery,normalizeSnapshot,snapshotFingerprint} from './snapshot.mjs';
const database=new DatabaseSync(':memory:',{enableForeignKeyConstraints:true,allowExtension:false});
try{
 const sql=new TextDecoder('utf-8',{fatal:true}).decode(workerData.bytes);if(sql.includes('\0'))throw Error('invalid');
 const statements=splitMigration(sql);if(!statements.length||statements.length>10000)throw Error('invalid');
 database.enableDefensive(true);database.exec('BEGIN; PRAGMA defer_foreign_keys=ON;');
 database.setAuthorizer((action,arg1,arg2)=>{
  if([constants.SQLITE_ATTACH,constants.SQLITE_DETACH,constants.SQLITE_TRANSACTION,constants.SQLITE_SAVEPOINT,constants.SQLITE_RECURSIVE,constants.SQLITE_SELECT].includes(action))return constants.SQLITE_DENY;
  if(action===constants.SQLITE_FUNCTION&&!['length','trim','instr','lower','upper','substr','coalesce','ifnull','json_valid','json_array','json','strftime','glob','like'].includes(String(arg2??arg1).toLowerCase()))return constants.SQLITE_DENY;
  return constants.SQLITE_OK;
 });
 for(const statement of statements){
  const allowed=/^CREATE\s+(?:(?:UNIQUE\s+)?INDEX|TABLE|TRIGGER|VIEW)\b/i.test(statement)||/^INSERT\s+INTO\b/i.test(statement)||/^PRAGMA\s+defer_foreign_keys\s*=\s*(TRUE|ON|1)$/i.test(statement)||/^DELETE\s+FROM\s+["`]?sqlite_sequence["`]?$/i.test(statement);
  if(!allowed||/^CREATE\s+VIRTUAL\b/i.test(statement))throw Error('invalid');database.exec(statement);
 }
 database.setAuthorizer(()=>constants.SQLITE_OK);database.exec('COMMIT');
 const quick=database.prepare('PRAGMA quick_check').all(),fk=database.prepare('PRAGMA foreign_key_check').all();if(quick.length!==1||quick[0].quick_check!=='ok'||fk.length)throw Error('integrity');
 const schema=database.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const names=schema.filter(row=>row.type==='table').map(row=>row.name);if(database.prepare("SELECT name FROM sqlite_schema WHERE name='sqlite_sequence'").all().length)names.push('sqlite_sequence');
 let count=0;const tables=names.map(name=>{const columns=database.prepare(`PRAGMA table_info("${name.replaceAll('"','""')}")`).all().map(r=>r.name);const values=database.prepare(cellsQuery(name,columns)).all();count+=values.length;if(count>10000||values.length>10000)throw Error('limit');return {name,columns,rows:values.map(r=>columns.map((_,i)=>r['c'+i]))};});
 const fingerprint=snapshotFingerprint(normalizeSnapshot(schema,tables));if(fingerprint!==workerData.expectedFingerprint)throw Error('mismatch');
 parentPort.postMessage({ok:true,fingerprint,tables:tables.length,rows:count});
}catch{parentPort.postMessage({ok:false});}finally{database.close();}
