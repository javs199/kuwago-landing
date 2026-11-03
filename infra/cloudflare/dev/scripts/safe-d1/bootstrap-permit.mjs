import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,target,requireSafe,digest} from './policy.mjs';
import {isBootstrapPlan,identityEvidenceHash} from '../single-operator-bootstrap.mjs';
export const bootstrapExecutionApproved=false; // Preparation is not write authorization.
const permits=new WeakMap(),readPermits=new WeakMap();
export const bootstrapSourceFiles=Object.freeze([
 'scripts/single-operator-bootstrap.mjs','scripts/safe-d1/bootstrap-permit.mjs',
 'scripts/safe-d1/bootstrap-runner.mjs','scripts/safe-d1/bootstrap-journal.mjs',
 'scripts/safe-d1/bootstrap-recovery.mjs','scripts/safe-d1/bootstrap-oracle.mjs',
 'scripts/safe-d1/transport.mjs','scripts/safe-d1/policy.mjs',
 'scripts/d1-bootstrap-private.mjs',
 'src/auth/access.ts','.wrangler/build/security.js',
]);
export const bootstrapSourceHash=()=>digest(JSON.stringify(bootstrapSourceFiles.map(file=>({file,sha256:digest(readFileSync(resolve(root,file)))}))));
export function scopeForBootstrap(plan,recoverySha256){
 requireSafe(isBootstrapPlan(plan)&&/^[a-f0-9]{64}$/.test(recoverySha256),'bootstrap_scope_invalid');
 return Object.freeze({environment:'development',target,executionId:plan.executionId,stage:6,
  batchSha256:plan.batchSha256,identitySha256:identityEvidenceHash(plan.identity),
  baselineFingerprint:plan.baselineFingerprint,authorizationReference:plan.authorizationReference,
  sourceSetSha256:bootstrapSourceHash(),stageSixBackupEvidenceSha256:recoverySha256,maximumBatches:1});
}
export function issueBootstrapPermit(plan,recoverySha256){
 requireSafe(bootstrapExecutionApproved,'bootstrap_not_authorized');
 const a=JSON.parse(readFileSync(resolve(root,'next-stage/bootstrap-authorization.json'))),scope=scopeForBootstrap(plan,recoverySha256);
 requireSafe(a.approved===true&&a.purpose==='single-operator-first-super-admin-only'&&a.migrationsAllowed===false&&a.exportsAllowed===false&&a.deploymentsAllowed===false,'bootstrap_scope_not_authorized');
 for(const [key,value] of Object.entries(scope))requireSafe(JSON.stringify(a[key])===JSON.stringify(value),'bootstrap_authorization_binding_mismatch');
 const permit=Object.freeze({});permits.set(permit,scope);return permit;
}
export function takeBootstrapPermit(permit){const scope=permits.get(permit);permits.delete(permit);return scope;}
export function issueBootstrapPreflightPermit(identity,recoverySha256){
 requireSafe(bootstrapExecutionApproved,'bootstrap_not_authorized');
 const a=JSON.parse(readFileSync(resolve(root,'next-stage/bootstrap-authorization.json')));
 requireSafe(a.approved===true&&JSON.stringify(a.target)===JSON.stringify(target)&&a.environment==='development'&&a.stage===6&&a.maximumBatches===1&&a.sourceSetSha256===bootstrapSourceHash()&&a.identitySha256===identityEvidenceHash(identity)&&a.stageSixBackupEvidenceSha256===recoverySha256&&/^[a-f0-9-]{36}$/.test(a.executionId),'bootstrap_preflight_not_authorized');
 const permit=Object.freeze({});readPermits.set(permit,Object.freeze({environment:'development',executionId:a.executionId,target,scope:'bootstrap-preflight'}));return permit;
}
export function takeBootstrapPreflightPermit(permit){const scope=readPermits.get(permit);readPermits.delete(permit);return scope;}
