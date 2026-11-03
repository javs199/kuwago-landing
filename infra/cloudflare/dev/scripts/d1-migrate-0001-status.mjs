import {existsSync} from 'node:fs';
import {firstMigrationApproved,firstMigrationVerifiedBaselineEnabled,firstMigrationAuthorizationId,firstMigrationAttemptFile,firstMigrationResultFile} from './safe-d1/migration-0001-permit.mjs';
import {target,migrations} from './safe-d1/policy.mjs';
console.log(JSON.stringify({authorizationId:firstMigrationAuthorizationId,approved:firstMigrationApproved,verifiedBaselineEnabled:firstMigrationVerifiedBaselineEnabled,target,migration:migrations[0].name,migrationSha256:migrations[0].sha256,alreadyUsed:existsSync(firstMigrationAttemptFile)||existsSync(firstMigrationResultFile)}));
