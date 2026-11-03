import {requireSafe} from './policy.mjs';
import {snapshotFingerprint} from './snapshot.mjs';
const principal='access:b329a52cf0fdf888743364ca9b3ff5a753aceb6fdd1d2937951e6c43c6e0dcfd';
const decode=cell=>cell==='null:'?null:Buffer.from(cell.slice(cell.indexOf(':')+1),'hex').toString('utf8');
export function validateCurrentAdminSnapshot(capture){
 requireSafe(capture.stage===6,'baseline_stage_mismatch');
 const tables=capture.snapshot.tables;
 const rows=name=>{const table=tables.find(t=>t.name===name);requireSafe(table,'table_missing');return table.rows.map(row=>Object.fromEntries(table.columns.map((col,i)=>[col,decode(row[i])])));};
 requireSafe(tables.filter(t=>!['d1_migrations','sqlite_sequence'].includes(t.name)).length===32,'application_tables_mismatch');
 const principals=rows('principals'),roles=rows('administrator_roles');
 requireSafe(principals.length===2&&principals.filter(p=>p.enabled==='1').length===1&&principals.some(p=>p.id===principal&&p.enabled==='1'&&p.issuer==='https://blue-bread-0e64.cloudflareaccess.com'&&p.subject==='57fd05c6-e0f3-5838-8e16-4ab77d8dff41'),'bootstrap_identity_mismatch');
 requireSafe(roles.length===1&&roles[0].principal_id===principal&&roles[0].role_id==='super_admin'&&principals.some(p=>p.id===roles[0].granted_by&&p.enabled==='0'),'bootstrap_roles_mismatch');
 for(const name of ['services','categories','media_assets','commercial_approvals','publication_outbox','media_processing'])requireSafe(rows(name).length===0,'unexpected_catalog_content');
 return {stage:6,applicationTables:32,historyEntries:6,sourceFingerprint:snapshotFingerprint(capture.snapshot)};
}
