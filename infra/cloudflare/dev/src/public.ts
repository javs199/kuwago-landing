import type { PublicationStore } from './catalog/types.js';
import { manifestKey, parseSnapshot } from './catalog/snapshot.js';
import { ApiFailure } from './catalog/errors.js';
import { readBarrier,sha256,type BarrierBinding } from './catalog/head.js';
import { activeDiscount } from '../../../../packages/contracts/src/public.js';
export default {
  async fetch(request:Request,env:{APP_ENV:string;PUBLICATION:PublicationStore;CATALOG_BARRIER?:BarrierBinding;ALLOWED_ORIGINS?:string}):Promise<Response> {
    const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    // Read-only public catalog: only the listed site origins may read it from the browser. No credentials.
    const origin=request.headers.get('Origin');
    if(origin&&(env.ALLOWED_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean).includes(origin))headers['Access-Control-Allow-Origin']=origin;
    try {
      if(env.APP_ENV!=='development'||!env.PUBLICATION)throw new ApiFailure(503,'catalog_unavailable');
      if(!['GET','HEAD'].includes(request.method))throw new ApiFailure(405,'read_only_api');
      const url=new URL(request.url);const media=url.pathname.match(/^\/v1\/media\/([a-f0-9]{64})$/);const detail=url.pathname.match(/^\/v1\/services\/([A-Za-z0-9_-]{1,96})$/);
      if(!['/v1/catalog','/v1/categories','/v1/services'].includes(url.pathname)&&!detail&&!media)throw new ApiFailure(404,'not_found');
      if([...url.searchParams.keys()].some(k=>!['limit','cursor'].includes(k)))throw new ApiFailure(422,'invalid_query');
      const head=await readBarrier(env.CATALOG_BARRIER);
      if(head.mode!=='ready'||head.generation===null)throw new ApiFailure(503,'catalog_unavailable');
      const value=await env.PUBLICATION.get(manifestKey);if(!value)throw new ApiFailure(503,'catalog_unavailable');
      const text=await value.text();const snapshot=parseSnapshot(text);
      if(snapshot.epoch!==head.epoch||snapshot.generation!==head.generation||await sha256(text)!==head.payloadHash)throw new ApiFailure(503,'catalog_unavailable');
      const verified=await readBarrier(env.CATALOG_BARRIER);
      if(JSON.stringify(verified)!==JSON.stringify(head))throw new ApiFailure(503,'catalog_unavailable');
      // Discount validity is evaluated per request (Costa Rica day), so an expired discount disappears without republishing.
      const catalog={...snapshot.catalog,services:snapshot.catalog.services.map(({discount,...service})=>{
        const active=activeDiscount(discount);return active?{...service,discount:active}:service;
      })};
      if(media){
        if(!catalog.services.some(service=>service.media.some(image=>image.url===url.pathname)))throw new ApiFailure(404,'not_found');
        const object=await env.PUBLICATION.get('media/'+media[1]);if(!object?.arrayBuffer)throw new ApiFailure(503,'catalog_unavailable');const bytes=await object.arrayBuffer();
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(bytes.byteLength>2097152||digest!==media[1]||JSON.stringify(await readBarrier(env.CATALOG_BARRIER))!==JSON.stringify(head))throw new ApiFailure(503,'catalog_unavailable');
        return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Type':'image/png','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'cross-origin'}});
      }
      let body:unknown=catalog;
      if(url.pathname==='/v1/categories')body={categories:catalog.categories};
      if(url.pathname==='/v1/services'){
        const raw=url.searchParams.get('limit')??'20';const limit=Number(raw);const cursor=url.searchParams.get('cursor')??'';
        if(!/^[1-9][0-9]*$/.test(raw)||limit>100||cursor.length>96)throw new ApiFailure(422,'invalid_query');
        const all=catalog.services.filter(s=>s.id>cursor).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
        body={services:all.slice(0,limit),nextCursor:all.length>limit?all[limit-1]!.id:null};
      }
      if(detail){const service=catalog.services.find(s=>s.id===detail[1])??catalog.services.find(s=>s.slug===detail[1]);if(!service)throw new ApiFailure(404,'not_found');body={service};}
      return request.method==='HEAD'?new Response(null,{headers}):Response.json(body,{headers});
    }catch(error){const failure=error instanceof ApiFailure?error:new ApiFailure(503,'catalog_unavailable');return Response.json({error:failure.code},{status:failure.status,headers});}
  },
};
