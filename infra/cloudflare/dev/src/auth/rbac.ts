import { SecurityFailure } from './errors.js';
import type { AuthDatabase, VerifiedIdentity } from './types.js';

export const editorPermissions = ['admin:read','drafts:write','translations:write','media:prepare','media:read-private'] as const;
export const adminPermissions = [...editorPermissions,'services:publish','services:unpublish','services:archive','audit:read'] as const;
export const rolePermissions = {
  editor: editorPermissions,
  admin: adminPermissions,
  super_admin: [...adminPermissions,'admins:manage'],
} as const;
export type AdminRole = keyof typeof rolePermissions;
export type Permission = typeof rolePermissions.super_admin[number];
export type Administrator = { id: string; role: AdminRole; permissions: readonly Permission[] };

export async function administratorFor(db: AuthDatabase, identity: VerifiedIdentity): Promise<Administrator> {
  try {
    // No email lookup, auto-provisioning, body-supplied role or principal cache.
    const response = await db.prepare(`SELECT p.id, p.enabled, ar.role_id AS role, rp.permission
      FROM principals p LEFT JOIN administrator_roles ar ON ar.principal_id=p.id
      LEFT JOIN admin_role_permissions rp ON rp.role_id=ar.role_id
      WHERE p.issuer=? AND p.subject=?`).bind(identity.issuer, identity.subject)
      .all<{ id: string; enabled: number; role: string | null; permission: string | null }>();
    if (!response.success) throw new Error('db_unavailable');
    const rows = response.results; const principal = rows[0];
    if (!principal || principal.enabled !== 1 || !principal.role || !Object.hasOwn(rolePermissions, principal.role)) throw new SecurityFailure(403, 'forbidden');
    const role = principal.role as AdminRole;
    const ceiling: readonly string[] = rolePermissions[role];
    const permissions = new Set<Permission>();
    for (const row of rows) {
      if (row.id !== principal.id || row.role !== role || row.enabled !== 1 || !row.permission || !ceiling.includes(row.permission)) throw new SecurityFailure(503, 'security_unavailable');
      permissions.add(row.permission as Permission);
    }
    // Missing DB grants cannot be supplied by static inheritance or request claims.
    return { id: principal.id, role, permissions: [...permissions] };
  } catch (error) {
    if (error instanceof SecurityFailure) throw error;
    throw new SecurityFailure(503, 'security_unavailable');
  }
}
export function requirePermission(administrator: Administrator, permission: Permission): void {
  if (!administrator.permissions.includes(permission)) throw new SecurityFailure(403, 'forbidden');
}
