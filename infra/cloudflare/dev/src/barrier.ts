import { publicationHead } from './catalog/head.js';
import type { CatalogDatabase } from './catalog/types.js';
import { publishedProperties } from './properties/repository.js';
// A separate Worker with ingress disabled. Never expose this through the Admin or public router.
export default {
  async fetch(request:Request,env:{APP_ENV:string;DB:CatalogDatabase}):Promise<Response>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    try{
      if(env.APP_ENV!=='development'||request.method!=='GET')return new Response(null,{status:404,headers});
      const path=new URL(request.url).pathname;
      if(path==='/properties')return Response.json(await publishedProperties(env.DB),{headers});
      if(path!=='/head')return new Response(null,{status:404,headers});
      return Response.json(await publicationHead(env.DB),{headers});
    }catch{return Response.json({error:'catalog_unavailable'},{status:503,headers});}
  },
};
