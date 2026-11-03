// Reviewed batch preparation. Remote permission remains release-locked separately.
import {decodeJwt} from 'jose';
import {createAccessVerifier} from '../.wrangler/build/security.js';
import {approvedSources,digest,migrations,requireSafe,target,schemaDigest} from './safe-d1/policy.mjs';
import {isReadReceipt,schemaGuardQuery} from './safe-d1/read.mjs';
import {cellsQuery,snapshotFingerprint} from './safe-d1/snapshot.mjs';

export const remoteBootstrapEnabled=false;
export const technicalIssuer='urn:kuwago:technical:bootstrap:development';
export const recipientEmail='ch.jesus.99@gmail.com';
// Observed in the authorized Access user detail, NOT inferred from an email.
export const expectedSubject='57fd05c6-e0f3-5838-8e16-4ab77d8dff41';
export const devAccess=Object.freeze({
 issuer:'https://blue-bread-0e64.cloudflareaccess.com',
 audience:'dd73f3792def5ce94841273f79026f08e326c98d6fd98925ba0551196bb16adc',
});
const identities=new WeakSet(),plans=new WeakSet(),used=new WeakSet(),batchPlans=new WeakMap();
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
export const isBootstrapPlan=plan=>plans.has(plan);
export const bootstrapBatchPlan=batch=>batchPlans.get(batch);
export const identityEvidenceHash=identity=>digest(JSON.stringify({issuer:identity.issuer,subject:identity.subject,audience:identity.audience,email:identity.email}));
export const bootstrapPostflightQueries=Object.freeze([
 schemaGuardQuery,'SELECT id,issuer,subject,enabled,created_at FROM principals ORDER BY id',
 'SELECT principal_id,role_id,granted_by,granted_at FROM administrator_roles',
 'SELECT id,actor_id,action,entity_type,entity_id,request_id,outcome,revision_id,created_at FROM audit_events',
 'SELECT * FROM principal_roles','PRAGMA foreign_key_check',
]);
export function isBootstrapRead(plan,sql,params=[]){return plans.has(plan)&&params.length===0&&(bootstrapPostflightQueries.includes(sql)||plan.unchangedTables.some(t=>sql===cellsQuery(t.name,t.columns)));}
// Reuse the real verifier; decoding is used ONLY after signature/iss/aud/time verification.
export async function verifyBootstrapRecipient(request,{fetcher=fetch}={}){
 const identity=await createAccessVerifier(devAccess,fetcher)(request);
 const payload=decodeJwt(request.headers.get('Cf-Access-Jwt-Assertion'));
 requireSafe(payload.email===recipientEmail,'bootstrap_recipient_email_mismatch');
 requireSafe(identity.subject===expectedSubject,'bootstrap_recipient_subject_mismatch');
 const evidence=Object.freeze({...identity,email:recipientEmail,audience:devAccess.audience,
  verifiedAt:Date.now(),expiresAt:payload.exp*1000});
 identities.add(evidence);return evidence;
}
export function assertBootstrapIdentityFresh(identity){
 requireSafe(identities.has(identity)&&identity.issuer===devAccess.issuer&&identity.audience===devAccess.audience,
  'bootstrap_verified_identity_required');
 const checkedAt=Date.now(),ageMs=checkedAt-identity.verifiedAt;
 requireSafe(ageMs>=0&&ageMs<300000&&checkedAt<identity.expiresAt,
  'bootstrap_identity_stale');
 return {checkedAt,ageMs};
}
// The caller must supply a real stage-6 read receipt and a complete independently
// verified baseline snapshot. Neither is manufactured from a post-write response.
export function prepareSingleOperatorBootstrap({preflight,snapshot,expectedFingerprint,identity,executionId,authorizationReference}){
 assertBootstrapIdentityFresh(identity);approvedSources();
 requireSafe(isReadReceipt(preflight)&&preflight.stage===6&&Date.now()-preflight.observedAt>=0&&Date.now()-preflight.observedAt<30000,'bootstrap_preflight_invalid');
 requireSafe(snapshot?.stage===6&&/^[a-f0-9]{64}$/.test(expectedFingerprint)&&snapshotFingerprint(snapshot.snapshot)===expectedFingerprint,'bootstrap_fingerprint_mismatch');
 requireSafe(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(executionId)&&/^[a-f0-9]{64}$/.test(authorizationReference),'bootstrap_execution_or_authorization_invalid');
 const tables=snapshot.snapshot.tables;
 requireSafe(schemaDigest(snapshot.snapshot.schema.filter(s=>s.name!=='d1_migrations'))===preflight.schemaHash,'bootstrap_snapshot_schema_mismatch');
 requireSafe(tables.length>0&&new Set(tables.map(t=>t.name)).size===tables.length,'bootstrap_snapshot_invalid');
 for(const name of ['principals','administrator_roles','principal_roles','audit_events'])
  requireSafe(tables.some(t=>t.name===name&&t.rows.length===0),'bootstrap_not_first_administrator');
 // Ensure the snapshot covers precisely the schema's tables plus sqlite_sequence.
 const expectedTables=snapshot.snapshot.schema.filter(s=>s.type==='table').map(s=>s.name).concat('sqlite_sequence').sort();
 requireSafe(JSON.stringify(tables.map(t=>t.name).sort())===JSON.stringify(expectedTables),'bootstrap_snapshot_incomplete');
 const recipientId='access:'+digest(identity.issuer+'\n'+identity.subject),actorId='bootstrap:'+executionId;
 const action='administrators.bootstrap.single_operator.v1.approval.'+authorizationReference;
 const statements=[];
 const add=(sql,params=[])=>statements.push(Object.freeze({sql,params:Object.freeze(params)}));
 // Deliberate NOT NULL failure aborts the complete D1 atomic batch, without new DDL.
 const guard=(condition,params)=>add(`INSERT INTO principals(id,issuer,subject,enabled) SELECT NULL,?,?,0 WHERE COALESCE((${condition}),0)=0`,[technicalIssuer,executionId,...params]);
 guard(`(${schemaGuardQuery})=?`,[preflight.guardSchema]);
 guard("(SELECT json_group_array(json_array(id,name)) FROM (SELECT id,name FROM d1_migrations ORDER BY id))=?",[JSON.stringify(migrations.map((m,i)=>[i+1,m.name]))]);
 for(const table of tables){
  const columns=table.columns.map((_,i)=>'c'+i).join(',');
  guard(`(SELECT json_group_array(json_array(${columns})) FROM (${cellsQuery(table.name,table.columns)}))=?`,[JSON.stringify(table.rows)]);
 }
 add('INSERT INTO principals(id,issuer,subject,enabled) VALUES (?,?,?,0)',[actorId,technicalIssuer,executionId]);
 add('INSERT INTO principals(id,issuer,subject,enabled) VALUES (?,?,?,1)',[recipientId,identity.issuer,identity.subject]);
 add("INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES (?,'super_admin',?)",[recipientId,actorId]);
 // Actor is the technical executor, NOT a fictional independent human approver.
 add("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,request_id,outcome) VALUES (?,?,?,'administrator_role',?,?,'allowed')",
  ['bootstrap-audit:'+executionId,actorId,action,recipientId,executionId]);
 const readbackStart=statements.length;
 for(const sql of bootstrapPostflightQueries.slice(1,4))add(sql);
 const plan=freeze({environment:'development',target,executionId,recipientId,actorId,action,
  authorizationReference,baselineFingerprint:expectedFingerprint,statements:Object.freeze(statements),
  batchSha256:digest(JSON.stringify(statements)),remoteEnabled:false,preparedAt:Date.now(),identity,
  expectedSchema:preflight.guardSchema,baselineSnapshot:structuredClone(snapshot),readbackStart,
  unchangedTables:structuredClone(tables.filter(t=>!['principals','administrator_roles','audit_events'].includes(t.name)))});
 plans.add(plan);batchPlans.set(plan.statements,plan);return plan;
}
// Local rehearsal adapter only. This module has no route into the existing remote
// transport and cannot enable its capabilities. Future wiring requires review.
export async function rehearseBootstrap(plan,localDb){
 requireSafe(plans.has(plan)&&!used.has(plan),'bootstrap_plan_consumed_or_invalid');assertBootstrapIdentityFresh(plan.identity);
 requireSafe(Date.now()-plan.preparedAt<30000,'bootstrap_plan_stale');
 used.add(plan); // Consume BEFORE invoking batch; ambiguous responses never retry.
 await localDb.batch(plan.statements.map(s=>localDb.prepare(s.sql).bind(...s.params)));
 return verifyBootstrapPostflight(plan,localDb);
}
export async function verifyBootstrapPostflight(plan,db){
 requireSafe(plans.has(plan),'bootstrap_plan_invalid');
 const rows=async(sql,params=[])=>{const result=await db.prepare(sql).bind(...params).all();requireSafe(result.success,'bootstrap_readback_failed');return result.results;};
 requireSafe((await rows(schemaGuardQuery))[0]?.value===plan.expectedSchema,'bootstrap_schema_postflight_mismatch');
 for(const table of plan.unchangedTables){
  const result=await rows(cellsQuery(table.name,table.columns));
  requireSafe(JSON.stringify(result.map(r=>table.columns.map((_,i)=>r['c'+i])))===JSON.stringify(table.rows),'bootstrap_unrelated_data_postflight_mismatch');
 }
 const principals=await rows(bootstrapPostflightQueries[1]);
 requireSafe(principals.length===2&&principals.some(p=>p.id===plan.actorId&&p.issuer===technicalIssuer&&p.subject===plan.executionId&&p.enabled===0)&&principals.some(p=>p.id===plan.recipientId&&p.issuer===plan.identity.issuer&&p.subject===plan.identity.subject&&p.enabled===1),'bootstrap_principal_postflight_mismatch');
 const roles=await rows(bootstrapPostflightQueries[2]);
 requireSafe(roles.length===1&&roles[0].principal_id===plan.recipientId&&roles[0].role_id==='super_admin'&&roles[0].granted_by===plan.actorId,'bootstrap_role_postflight_mismatch');
 const audit=await rows(bootstrapPostflightQueries[3]);
 requireSafe(audit.length===1&&audit[0].id==='bootstrap-audit:'+plan.executionId&&audit[0].actor_id===plan.actorId&&audit[0].action===plan.action&&audit[0].entity_type==='administrator_role'&&audit[0].entity_id===plan.recipientId&&audit[0].request_id===plan.executionId&&audit[0].outcome==='allowed'&&audit[0].revision_id===null,'bootstrap_audit_postflight_mismatch');
 requireSafe((await rows('SELECT * FROM principal_roles')).length===0,'bootstrap_legacy_role_unexpected');
 requireSafe((await rows('PRAGMA foreign_key_check')).length===0,'bootstrap_integrity_failed');
 return {status:'local_rehearsal_pass',remoteExecuted:false,technicalActorDisabled:true,independentHumanApproval:false};
}
