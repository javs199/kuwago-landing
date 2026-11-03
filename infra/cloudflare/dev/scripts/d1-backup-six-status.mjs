import {existsSync} from 'node:fs';
import {stageSixBackupApproved,stageSixBackupId,stageSixBackupPrefix} from './safe-d1/backup-six-permit.mjs';
import {target,migrations} from './safe-d1/policy.mjs';
import {stageSixFingerprint} from './safe-d1/backup-stage-six.mjs';
console.log(JSON.stringify({authorizationId:stageSixBackupId,executionApproved:stageSixBackupApproved,intendedPermission:'D1 Read + D1 Write',target,expectedStage:6,applicationTables:32,expectedHistory:migrations.map(m=>m.name),expectedFingerprint:stageSixFingerprint,alreadyUsed:existsSync(stageSixBackupPrefix+'.attempt.json')||existsSync(stageSixBackupPrefix+'.result.json')}));
