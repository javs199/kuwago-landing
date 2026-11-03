export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ success: boolean; results: T[] }>;
  run(): Promise<{ success: boolean }>;
}
export interface AuthDatabase { prepare(query: string): D1Statement }
export type VerifiedIdentity = { issuer: string; subject: string };
export interface AuthEnvironment {
  DB: AuthDatabase;
  APP_ENV: string;
  ACCESS_ISSUER?: string;
  ACCESS_AUD?: string;
  ADMIN_ORIGIN?: string;
  MUTATIONS_ENABLED?: string;
}
