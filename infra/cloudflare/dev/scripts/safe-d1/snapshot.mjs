import {assertIdentity,requireSafe,schemaDigest,schemaHashes,digest,normalizeSql,ledgerSql,migrations,schemaQuery} from './policy.mjs';
export const sequenceQuery="SELECT name FROM sqlite_schema WHERE type='table' AND name='sqlite_sequence'";
export const identifier=name=>{requireSafe(typeof name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name),'backup_identifier_invalid');return '"'+name+'"';};
export const columnsQuery=table=>`PRAGMA table_info(${identifier(table)})`;
export function cellsQuery(table,columns){return 'SELECT '+columns.map((name,i)=>`typeof(${identifier(name)})||':'||CASE WHEN typeof(${identifier(name)})='real' THEN printf('%!.17g',${identifier(name)}) ELSE hex(CAST(${identifier(name)} AS BLOB)) END AS c${i}`).join(',')+` FROM ${identifier(table)} ORDER BY `+columns.map((_,i)=>'c'+i).join(',')+' LIMIT 10001';}
export function isBackupRead(sql){
 if(sql===sequenceQuery)return true;
 const columnMatch=/^PRAGMA table_info\("([A-Za-z_][A-Za-z0-9_]{0,127})"\)$/.exec(sql);if(columnMatch)return sql===columnsQuery(columnMatch[1]);
 const table=/ FROM "([A-Za-z_][A-Za-z0-9_]{0,127})" ORDER BY /.exec(sql);if(!table)return false;
 const columns=[...sql.matchAll(/typeof\("([A-Za-z_][A-Za-z0-9_]{0,127})"\)\|\|/g)].map(m=>m[1]);
 return columns.length>0&&columns.length<=100&&sql===cellsQuery(table[1],columns);
}
export function snapshotFingerprint(snapshot){return digest(JSON.stringify(snapshot));}
export function canonicalSchema(schema){return schema.map(row=>({type:row.type,name:row.name,sql:normalizeSql(row.sql)}));}
export function normalizeSnapshot(schema,tables){
 return {schema:canonicalSchema(schema),tables:tables.map(t=>({name:t.name,columns:t.columns,rows:t.rows})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)};
}
export async function captureDatabase(transport,{requireApproved=true}={}){
 assertIdentity(await transport.metadata());
 const raw=await transport.select(schemaQuery);requireSafe(Array.isArray(raw)&&raw.every(r=>['table','index','trigger','view'].includes(r.type)&&typeof r.sql==='string'&&typeof r.name==='string'),'backup_schema_invalid');
 const schema=raw.filter(r=>!['_cf_KV','_cf_METADATA'].includes(r.name));
 const application=schema.filter(r=>r.name!=='d1_migrations');const stage=schemaHashes.indexOf(schemaDigest(application));if(requireApproved)requireSafe(stage>=0,'backup_unapproved_schema');
 const ledger=schema.find(r=>r.name==='d1_migrations');if(requireApproved)requireSafe(stage===0?!ledger:ledger&&normalizeSql(ledger.sql)===normalizeSql(ledgerSql),'backup_ledger_invalid');
 if(ledger&&requireApproved){const history=await transport.select('SELECT id,name,applied_at FROM d1_migrations ORDER BY id');requireSafe(history.length===stage&&history.every((r,i)=>r.id===i+1&&r.name===migrations[i].name),'backup_history_invalid');}
 const tables=[];const names=schema.filter(r=>r.type==='table').map(r=>r.name);
 if((await transport.select(sequenceQuery)).length)names.push('sqlite_sequence');
 let totalRows=0;
 for(const name of names){const columns=(await transport.select(columnsQuery(name))).map(r=>r.name);requireSafe(columns.length>0&&columns.length<=100,'backup_column_limit');const data=await transport.select(cellsQuery(name,columns));requireSafe(Array.isArray(data)&&data.length<=10000,'backup_row_limit');totalRows+=data.length;requireSafe(totalRows<=10000,'backup_row_limit');tables.push({name,columns,rows:data.map(r=>columns.map((_,i)=>{requireSafe(typeof r['c'+i]==='string','backup_cell_invalid');return r['c'+i];}))});}
 const quick=await transport.select('PRAGMA quick_check'),fk=await transport.select('PRAGMA foreign_key_check');requireSafe(quick.length===1&&quick[0].quick_check==='ok'&&fk.length===0,'backup_source_integrity_failed');
 return {stage,snapshot:normalizeSnapshot(schema,tables)};
}
