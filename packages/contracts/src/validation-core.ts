export type Issue = { path: string; code: string };
export type Result<T> = { success: true; data: T } | { success: false; issues: Issue[] };
export class ContractError extends Error {
  constructor(public readonly issues: Issue[]) { super('Invalid Kuwago contract'); this.name = 'ContractError'; }
}
export type Schema<T> = { parse(value: unknown): T; safeParse(value: unknown): Result<T> };
export function schema<T>(validate: (value: unknown, issues: Issue[], path: string) => void): Schema<T> {
  return {
    safeParse(value) {
      const issues: Issue[] = [];
      validate(value, issues, '$');
      return issues.length ? { success: false, issues } : { success: true, data: structuredClone(value) as T };
    },
    parse(value) { const result = this.safeParse(value); if (!result.success) throw new ContractError(result.issues); return result.data; },
  };
}
export function issue(issues: Issue[], path: string, code: string) { issues.push({ path, code }); }
export function object(value: unknown, keys: readonly string[], issues: Issue[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { issue(issues, path, 'object_required'); return {}; }
  for (const key of Object.keys(value)) if (!keys.includes(key)) issue(issues, `${path}.${key}`, 'unknown_field');
  return value as Record<string, unknown>;
}
export function text(value: unknown, issues: Issue[], path: string, required = true, max = 2000) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) issue(issues, path, 'invalid_text');
}
export function id(value: unknown, issues: Issue[], path: string) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value)) issue(issues, path, 'invalid_id');
}
export function slug(value: unknown, issues: Issue[], path: string, required = true) {
  if (!required && value === '') return;
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) issue(issues, path, 'invalid_slug');
}
export function enumeration(value: unknown, values: readonly unknown[], issues: Issue[], path: string) {
  if (!values.includes(value)) issue(issues, path, 'invalid_enum');
}
export function integer(value: unknown, min: number, max: number, issues: Issue[], path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) issue(issues, path, 'invalid_integer');
}
export function date(value: unknown, issues: Issue[], path: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,19) !== value.slice(0,19)) issue(issues, path, 'invalid_timestamp');
}
export function list(value: unknown, validate: (value: unknown, issues: Issue[], path: string) => void, issues: Issue[], path: string, max = 1000): unknown[] {
  if (!Array.isArray(value) || value.length > max) { issue(issues, path, 'invalid_list'); return []; }
  value.forEach((item, index) => validate(item, issues, `${path}[${index}]`)); return value;
}
export function unique(values: unknown[], key: string, issues: Issue[], path: string) {
  const seen = new Set<unknown>();
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const entry = (value as Record<string,unknown>)[key];
    if (seen.has(entry)) issue(issues, path, `duplicate_${key}`);
    seen.add(entry);
  }
}
export function translations(value: unknown, validate: (value: unknown, issues: Issue[], path: string) => void, issues: Issue[], path: string) {
  const row = object(value, ['es','en'], issues, path);
  for (const locale of ['es','en']) validate(row[locale], issues, `${path}.${locale}`);
}
export function url(value: unknown, issues: Issue[], path: string, allowBlob = false) {
  if (typeof value !== 'string') { issue(issues, path, 'invalid_public_url'); return; }
  // No credentials, query strings, fragments, traversal or signed/private URLs.
  const local = /^(?:\/(?!\/)|assets\/)[a-zA-Z0-9_./%-]+$/.test(value);
  let safe = false;
  try {
    const parsed = new URL(value, 'https://local.invalid/');
    safe = !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
      (local || (parsed.protocol === 'https:' && /^https:\/\//.test(value) && parsed.hostname !== 'local.invalid')) &&
      !/(?:^|\/)\.\.(?:\/|$)|%2e|%2f|%5c/i.test(value);
    if (allowBlob && parsed.protocol === 'blob:' && /^blob:https?:\/\//.test(value)) safe = true;
  } catch { /* Invalid URL. */ }
  if (!safe) issue(issues, path, 'invalid_public_url');
}

