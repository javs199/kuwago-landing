import type { CatalogDatabase } from './types.js';
import type { D1Statement } from '../auth/types.js';
import { rolePermissions, type Permission, type Administrator } from '../auth/rbac.js';
import { ApiFailure } from './input.js';
export type Condition={sql:string;values:unknown[]};
export async function commit(db:CatalogDatabase,actor:Administrator,permission:Permission,version:number,
  condition:Condition,statements:D1Statement[],audit:{action:string;entity:string;id:string;revision?:string;requestId:string}):Promise<void> {
  const op=crypto.randomUUID();
  const roles=Object.entries(rolePermissions).filter(([,p])=>(p as readonly string[]).includes(permission)).map(([r])=>r);
  const roleSlots=roles.map(()=>'?').join(',');
  const guard=db.prepare(`INSERT INTO mutation_guards(operation_id,permission_ok,valid) VALUES (?,
    CASE WHEN EXISTS(SELECT 1 FROM principals p JOIN administrator_roles ar ON ar.principal_id=p.id
      JOIN admin_role_permissions rp ON rp.role_id=ar.role_id
      WHERE p.id=? AND p.enabled=1 AND rp.permission=? AND ar.role_id IN (${roleSlots})) THEN 1 ELSE 0 END,
    CASE WHEN (SELECT mode FROM publication_control WHERE id=1)='ready' AND (SELECT version FROM catalog_state WHERE id=1)=? AND (${condition.sql}) THEN 1 ELSE 0 END)`)
    .bind(op,actor.id,permission,...roles,version,...condition.values);
  try {
    const results=await db.batch([guard,...statements,
      db.prepare('UPDATE catalog_state SET version=version+1 WHERE id=1'),
      db.prepare(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,revision_id,request_id,outcome)
        VALUES (?,?,?,?,?,?,?,'allowed')`).bind(crypto.randomUUID(),actor.id,audit.action,audit.entity,audit.id,audit.revision??null,audit.requestId),
      db.prepare('DELETE FROM mutation_guards WHERE operation_id=?').bind(op),
    ]);
    if(results.some(r=>!r.success))throw new Error('batch_failed');
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message.includes('kuwago_mutation_permission'))throw new ApiFailure(403,'forbidden');
    if(message.includes('kuwago_mutation_precondition')||message.includes('UNIQUE constraint'))throw new ApiFailure(409,'version_or_state_conflict');
    if(message.includes('FOREIGN KEY constraint'))throw new ApiFailure(422,'invalid_reference');
    throw new ApiFailure(503,'transaction_failed');
  }
}
