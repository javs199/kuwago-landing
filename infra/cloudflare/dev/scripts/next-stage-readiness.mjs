// Read local evidence and an inert planning document only. No credentials, network,
// SQL executor, authentication harness, Wrangler process or deployment capability.
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {custodyRoot} from './safe-d1/windows-custody.mjs';
import {root,target,digest,migrations,schemaHashes,requireSafe} from './safe-d1/policy.mjs';
const plan=JSON.parse(readFileSync(resolve(root,'next-stage/development-plan.json'))),e=plan.migrationEvidence;
requireSafe(process.argv.length===2&&plan.environment==='development'&&plan.target.account===target.account&&plan.target.databaseId===target.id&&plan.target.database===target.name,'next_stage_scope_invalid');
requireSafe(Object.values(plan.gates).every(v=>v===false)&&plan.bootstrap.remoteWriteEnabled===false&&plan.bootstrap.automaticProvisioning===false,'next_stage_must_remain_blocked');
const prefix=resolve(custodyRoot,'migration-0005-0006-'+e.executionId),bytes=readFileSync(prefix+'.result.json'),closureBytes=readFileSync(prefix+'.closed.json'),checkpoint=readFileSync(prefix+'.stage-6.postflight.private.json');
const r=JSON.parse(bytes),c=JSON.parse(closureBytes);
requireSafe(digest(bytes)===e.resultSha256&&digest(closureBytes)===e.closureSha256&&digest(checkpoint)===e.checkpointSha256&&c.resultSha256===e.resultSha256&&c.checkpointSha256===e.checkpointSha256&&c.stage===6&&r.status==='completed_0005_0006_only'&&r.finalCheckpoint.fingerprint===e.fingerprint&&r.verifiedStages[1].schemaHash===schemaHashes[6]&&JSON.stringify(r.verifiedStages[1].history)===JSON.stringify(migrations.map((m,i)=>({id:i+1,name:m.name}))),'next_stage_migration_evidence_invalid');
for(const file of [plan.integration.gatewaySource,plan.integration.apiSource,plan.integration.accessVerifier,plan.integration.rbacSource])requireSafe(existsSync(resolve(root,file)),'next_stage_existing_component_missing');
requireSafe(existsSync(resolve(root,'../../../',plan.integration.adminClient)),'next_stage_admin_client_missing');
console.log(JSON.stringify({inspection:'local-evidence-only',migrationClosureVerified:true,lastKnownRemoteStage:6,lastKnownRemoteVerificationAt:r.finishedAt,bootstrapReady:false,deployReady:false,remoteGatesBlocked:true,pending:['JWT verification receipt exists; reverify privately at actual bootstrap execution','review durable single-operator bootstrap and explicit one-batch authorization','gateway origin/app/AUD and private API topology',plan.recovery.stage6FullBackupAvailable?'stage-6 full encrypted backup is pinned/restored; revalidate it before bootstrap':'stage-6 full encrypted backup and isolated restore; separately authorize export','fresh bootstrap-specific preflight and recovery bookmark','explicit remote creation/deployment approvals'],reusedComponentsLocated:true}));
