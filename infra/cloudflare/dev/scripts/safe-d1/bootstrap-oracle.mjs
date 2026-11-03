import {requireSafe} from './policy.mjs';
import {isBootstrapPlan,technicalIssuer} from '../single-operator-bootstrap.mjs';
// Only generated timestamps come from readbacks of this same accepted batch.
// All identities, roles, action fields, schema and unrelated rows are projected
// independently from the verified baseline and fixed plan.
export function projectBootstrap(plan,ack){
 requireSafe(isBootstrapPlan(plan)&&ack.stage===6&&ack.executionId===plan.executionId&&ack.batchSha256===plan.batchSha256,'bootstrap_oracle_scope_mismatch');
 const output=ack.bootstrapOutput;requireSafe(Array.isArray(output)&&output.length===3&&output[0].length===2&&output[1].length===1&&output[2].length===1,'bootstrap_oracle_readbacks_invalid');
 const start=Date.parse(ack.requestStartedAt)-5000,end=Date.parse(ack.responseCompletedAt)+5000;
 const time=value=>{const n=Date.parse(value);requireSafe(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&new Date(n).toISOString()===value&&n>=start&&n<=end,'bootstrap_generated_time_invalid');return value;};
 const actor=output[0].find(p=>p.id===plan.actorId),person=output[0].find(p=>p.id===plan.recipientId);
 requireSafe(actor&&person,'bootstrap_oracle_principals_invalid');
 const expected={
  principals:[{id:plan.actorId,issuer:technicalIssuer,subject:plan.executionId,enabled:0,created_at:time(actor.created_at)},{id:plan.recipientId,issuer:plan.identity.issuer,subject:plan.identity.subject,enabled:1,created_at:time(person.created_at)}],
  administrator_roles:[{principal_id:plan.recipientId,role_id:'super_admin',granted_by:plan.actorId,granted_at:time(output[1][0].granted_at)}],
  audit_events:[{id:'bootstrap-audit:'+plan.executionId,actor_id:plan.actorId,action:plan.action,entity_type:'administrator_role',entity_id:plan.recipientId,request_id:plan.executionId,outcome:'allowed',revision_id:null,created_at:time(output[2][0].created_at)}],
 };
 const actual={principals:output[0],administrator_roles:output[1],audit_events:output[2]};
 for(const name of Object.keys(expected))for(const row of expected[name]){
  const key=name==='administrator_roles'?'principal_id':'id',found=actual[name].find(r=>r[key]===row[key]);
  requireSafe(found&&Object.keys(found).sort().join('|')===Object.keys(row).sort().join('|')&&Object.keys(row).every(k=>found[k]===row[k]),'bootstrap_same_batch_readback_mismatch');
 }
 const capture=structuredClone(plan.baselineSnapshot);
 const cell=value=>value===null?'null:':(typeof value==='number'?'integer:':'text:')+Buffer.from(String(value)).toString('hex').toUpperCase();
 for(const table of capture.snapshot.tables)if(expected[table.name])table.rows=expected[table.name].map(row=>table.columns.map(c=>{requireSafe(Object.hasOwn(row,c),'bootstrap_oracle_column_invalid');return cell(row[c]);})).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:1);
 return capture;
}
