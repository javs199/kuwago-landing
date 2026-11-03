import {mediaRoutes,handleMedia} from './multimedia.js';
import { accessConfiguration, createAccessVerifier } from './auth/access.js';
import { SecurityFailure } from './auth/errors.js';
import { authorizeRequest, requireMutationOrigin, securityLogger, type SecurityLogger } from './auth/middleware.js';
import type { Permission } from './auth/rbac.js';
import type { AuthEnvironment } from './auth/types.js';
import type { CatalogEnvironment } from './catalog/types.js';
import { catalogRoutes, handleCatalog, auditPage } from './catalog/routes.js';
import { ApiFailure } from './catalog/errors.js';

type Route = { pattern: RegExp; method: string; permission: Permission; session?: boolean };
const routes: readonly Route[] = [
  ...catalogRoutes,
  ...mediaRoutes,
  { pattern:/^\/api\/v1\/session$/, method:'GET', permission:'admin:read', session:true },
  { pattern:/^\/api\/v1\/services$/, method:'GET', permission:'admin:read' },
  { pattern:/^\/api\/v1\/services$/, method:'POST', permission:'drafts:write' },
  { pattern:/^\/api\/v1\/services\/[A-Za-z0-9_-]+$/, method:'PATCH', permission:'drafts:write' },
  { pattern:/^\/api\/v1\/services\/[A-Za-z0-9_-]+\/translations$/, method:'PATCH', permission:'translations:write' },
  { pattern:/^\/api\/v1\/services\/[A-Za-z0-9_-]+\/publish$/, method:'POST', permission:'services:publish' },
  { pattern:/^\/api\/v1\/services\/[A-Za-z0-9_-]+\/unpublish$/, method:'POST', permission:'services:unpublish' },
  { pattern:/^\/api\/v1\/services\/[A-Za-z0-9_-]+\/archive$/, method:'POST', permission:'services:archive' },
  { pattern:/^\/api\/v1\/media$/, method:'POST', permission:'media:prepare' },
  { pattern:/^\/api\/v1\/media\/[A-Za-z0-9_-]+$/, method:'GET', permission:'media:read-private' },
  { pattern:/^\/api\/v1\/audit$/, method:'GET', permission:'audit:read' },
  { pattern:/^\/api\/v1\/admins(?:\/[A-Za-z0-9_-]+)?$/, method:'GET', permission:'admins:manage' },
  { pattern:/^\/api\/v1\/admins(?:\/[A-Za-z0-9_-]+)?$/, method:'PATCH', permission:'admins:manage' },
];
export function createWorker(fetcher: typeof fetch = fetch, log: SecurityLogger = securityLogger) {
  let cached: { key: string; verify: ReturnType<typeof createAccessVerifier> } | undefined;
  return {
    async fetch(request: Request, env: AuthEnvironment & CatalogEnvironment): Promise<Response> {
      const requestId = crypto.randomUUID();
      const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'", 'X-Request-ID':requestId };
      let operation: Permission = 'admin:read';
      let middlewareStarted = false;
      let authorized = false;
      try {
        if (env.APP_ENV !== 'development' || !env.DB) throw new SecurityFailure(503, 'security_unavailable');
        const config = accessConfiguration(env.ACCESS_ISSUER, env.ACCESS_AUD);
        const key = `${config.issuer}|${config.audience}`;
        if (!cached || cached.key !== key) cached = {key,verify:createAccessVerifier(config,fetcher)};
        const pathname = new URL(request.url).pathname;
        const route = routes.find(row => row.pattern.test(pathname) && row.method === request.method);
        operation = route?.permission ?? 'admin:read';
        middlewareStarted = true;
        const administrator = await authorizeRequest(request, env.DB, operation, cached.verify, requestId, log);
        authorized = true;
        if (!route) throw new SecurityFailure(routes.some(row => row.pattern.test(pathname)) ? 405 : 404, routes.some(row => row.pattern.test(pathname)) ? 'method_not_allowed' : 'not_found');
        if (!['GET','HEAD','OPTIONS'].includes(request.method)) requireMutationOrigin(request,env.ADMIN_ORIGIN,pathname==='/api/v1/media'&&request.method==='POST');
        if (route.session) return Response.json({ administrator:{id:administrator.id,role:administrator.role,permissions:administrator.permissions} },{headers});
        if(mediaRoutes.some(r=>r.method===request.method&&r.pattern.test(pathname))){
          if(request.method!=='GET'&&env.MUTATIONS_ENABLED!=='true')throw new SecurityFailure(501,'operation_not_enabled');
          return await handleMedia(request,env,administrator,requestId,headers);
        }
        if(catalogRoutes.some(r=>r.method===request.method&&r.pattern.test(pathname))){
          if(request.method!=='GET'&&env.MUTATIONS_ENABLED!=='true')throw new SecurityFailure(501,'operation_not_enabled');
          return await handleCatalog(request,env,administrator,requestId,headers);
        }
        if(pathname==='/api/v1/audit'&&request.method==='GET')return Response.json(await auditPage(env.DB,new URL(request.url)),{headers});
        // Media bytes and administrator management remain outside this phase.
        throw new SecurityFailure(501, 'operation_not_enabled');
      } catch (error) {
        const failure = error instanceof SecurityFailure || error instanceof ApiFailure ? error : new SecurityFailure(503, 'security_unavailable');
        if (!middlewareStarted || authorized) log({event:failure.status === 503 ? 'security_failure' : 'request_rejected',requestId,operation,status:failure.status});
        return Response.json({error:failure.code,requestId},{status:failure.status,headers});
      }
    },
  };
}
export default createWorker();
