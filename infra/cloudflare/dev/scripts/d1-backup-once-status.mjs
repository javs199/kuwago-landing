import {existsSync} from 'node:fs';
import {backupAuthorizationId,backupExecutionApproved,backupIntendedPermission,backupAttemptFile,backupResultFile} from './safe-d1/backup-once-permit.mjs';
import {target} from './safe-d1/policy.mjs';
import {backupExpectedStage,backupExpectedApplicationTables,backupExpectedHistory,expectedStageFourFingerprint} from './safe-d1/backup-stage-four.mjs';
// Local non-secret plan only. Does not read credentials or connect remotely.
console.log(JSON.stringify({authorizationId:backupAuthorizationId,executionApproved:backupExecutionApproved,intendedPermission:backupIntendedPermission,target,expectedStage:backupExpectedStage,applicationTables:backupExpectedApplicationTables.length,expectedHistory:backupExpectedHistory,expectedFingerprint:expectedStageFourFingerprint,fingerprintPolicy:'pinned-to-confirmed-stage-four-reconciliation',alreadyUsed:existsSync(backupAttemptFile)||existsSync(backupResultFile)}));
