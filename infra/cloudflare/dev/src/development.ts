import {createGateway, type GatewayEnvironment} from './gateway.js';
import {createWorker} from './index.js';
import type {AuthEnvironment} from './auth/types.js';
import type {CatalogEnvironment} from './catalog/types.js';
import {reconcileScheduled} from './catalog/delivery.js';

export type DevelopmentEnvironment = AuthEnvironment & CatalogEnvironment & Pick<GatewayEnvironment, 'ASSETS'> & {DEV_MAINTENANCE?:string};

// One existing Access-protected ingress. The API has no second network listener.
// Both gateway and API independently validate Access; API also resolves D1 RBAC.
export function createDevelopmentWorker(fetcher: typeof fetch = fetch) {
  const gateway = createGateway(fetcher);
  const api = createWorker(fetcher);
  return {
    async fetch(request: Request, env: DevelopmentEnvironment): Promise<Response> {
      // Optional DEV quiescence for a separately authorized backup/migration window.
      // Access remains in front; no session lookup or authorization-audit write runs here.
      if(env.APP_ENV==='development'&&env.DEV_MAINTENANCE==='true')return Response.json({error:'development_maintenance'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      return gateway.fetch(request, {
        ...env,
        ADMIN_API: {fetch: forwarded => api.fetch(forwarded, {...env, MUTATIONS_ENABLED: env.APP_ENV==='development'&&env.MUTATIONS_ENABLED==='true'?'true':'false'})},
      });
    },
    scheduled(controller:{scheduledTime:number},env:DevelopmentEnvironment,ctx:{waitUntil(task:Promise<unknown>):void}){
      if(env.APP_ENV==='development'&&env.MUTATIONS_ENABLED==='true'&&env.DEV_MAINTENANCE!=='true')ctx.waitUntil(reconcileScheduled(env.DB,env.PUBLICATION,controller.scheduledTime,env));
    },
  };
}

export default createDevelopmentWorker();
