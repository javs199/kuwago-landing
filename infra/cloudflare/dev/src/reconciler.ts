import type { CatalogEnvironment } from './catalog/types.js';
import { reconcileScheduled } from './catalog/delivery.js';
export default {
  fetch(){return new Response(null,{status:404});},
  scheduled(controller:{scheduledTime:number},env:CatalogEnvironment&{APP_ENV:string},ctx:{waitUntil(task:Promise<unknown>):void}){
    if(env.APP_ENV!=='development')throw new Error('local_development_required');
    ctx.waitUntil(reconcileScheduled(env.DB,env.PUBLICATION,controller.scheduledTime,env));
  },
};
