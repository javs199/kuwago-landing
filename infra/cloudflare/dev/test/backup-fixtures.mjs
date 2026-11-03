import {captureDatabase} from '../scripts/safe-d1/snapshot.mjs';
import {target} from '../scripts/safe-d1/policy.mjs';
// Synthetic SQLite dump for simulated Cloudflare responses only; never a remote exporter.
export async function fixtureExport(db){
 const source=await captureDatabase({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async sql=>(await db.prepare(sql).all()).results});
 const raw=(await db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA') ORDER BY type,name").all()).results;
 const quote=name=>'"'+name.replaceAll('"','""')+'"';
 const literal=cell=>{const split=cell.indexOf(':'),type=cell.slice(0,split),value=cell.slice(split+1);if(type==='null')return 'NULL';if(type==='text')return `CAST(X'${value}' AS TEXT)`;if(type==='blob')return `X'${value}'`;if(type==='real')return value;if(type==='integer')return Buffer.from(value,'hex').toString('utf8');throw Error('unsupported test cell');};
 const parts=['PRAGMA defer_foreign_keys=TRUE',...raw.filter(r=>r.type==='table').map(r=>r.sql)];
 for(const table of source.snapshot.tables){if(table.name==='sqlite_sequence')parts.push('DELETE FROM sqlite_sequence');for(const row of table.rows)parts.push(`INSERT INTO ${quote(table.name)} (${table.columns.map(quote).join(',')}) VALUES (${row.map(literal).join(',')})`);}
 parts.push(...raw.filter(r=>r.type!=='table').map(r=>r.sql));return Buffer.from(parts.join(';\n')+';\n');
}
