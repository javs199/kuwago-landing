import { SecurityFailure } from './errors.js';
import { administratorFor, requirePermission, type Permission, type Administrator } from './rbac.js';
import type { AuthDatabase, VerifiedIdentity } from './types.js';

export type SecurityEvent = {
  event: 'access_denied' | 'access_authorized' | 'request_rejected' | 'security_failure';
  requestId: string; operation: Permission; status: number;
  principalId?: string; role?: string;
};
export type SecurityLogger = (event: SecurityEvent) => void;
export const securityLogger: SecurityLogger = event => console.info(JSON.stringify(event));

export async function authorizeRequest(request: Request, db: AuthDatabase, permission: Permission,
  verify: (request: Request) => Promise<VerifiedIdentity>, requestId: string,
  log: SecurityLogger = securityLogger): Promise<Administrator> {
  let administrator: Administrator | undefined;
  try {
    const identity = await verify(request);
    administrator = await administratorFor(db, identity);
    let allowed = true;
    try { requirePermission(administrator, permission); } catch { allowed = false; }
    // Only authenticated, registered principals produce D1 audit writes; strangers get sanitized logs.
    const result = await db.prepare(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,request_id,outcome)
      VALUES (?,?,'security.authorization','permission',?,?,?)`)
      .bind(crypto.randomUUID(), administrator.id, permission, requestId, allowed ? 'allowed' : 'denied').run();
    if (!result.success) throw new SecurityFailure(503, 'security_unavailable');
    if (!allowed) throw new SecurityFailure(403, 'forbidden');
    log({ event:'access_authorized', requestId, operation:permission, status:200, principalId:administrator.id, role:administrator.role });
    return administrator;
  } catch (error) {
    const failure = error instanceof SecurityFailure ? error : new SecurityFailure(503, 'security_unavailable');
    log({ event:failure.status === 503 ? 'security_failure' : 'access_denied', requestId, operation:permission,
      status:failure.status, ...(administrator ? {principalId:administrator.id,role:administrator.role} : {}) });
    throw failure;
  }
}

export function requireMutationOrigin(request: Request, origin: string | undefined, binaryUpload=false): void {
  const site = request.headers.get('Sec-Fetch-Site');
  let expected: URL;
  try {
    expected = new URL(origin ?? '');
    if (expected.protocol !== 'https:' || expected.origin !== origin || expected.username || expected.password) throw new Error('invalid_origin');
  } catch { throw new SecurityFailure(503, 'security_unavailable'); }
  if (request.headers.get('Origin') !== expected.origin || request.headers.get('X-Kuwago-Request') !== '1' || (site !== null && site !== 'same-origin') || (!binaryUpload && request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')) throw new SecurityFailure(403, 'csrf_rejected');
}
