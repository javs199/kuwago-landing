import {existsSync} from 'node:fs';
import {currentBackupApproved,currentBackupId,currentBackupPrefix} from './safe-d1/backup-current-permit.mjs';
import {target,migrations} from './safe-d1/policy.mjs';

console.log(JSON.stringify({authorizationId:currentBackupId,executionApproved:currentBackupApproved,intendedPermission:'D1 Read + D1 Write',target,expectedStage:6,applicationTables:32,expectedHistory:migrations.map(m=>m.name),alreadyUsed:existsSync(currentBackupPrefix+'.attempt.json')||existsSync(currentBackupPrefix+'.result.json')}));

