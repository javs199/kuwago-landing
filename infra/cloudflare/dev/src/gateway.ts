import {accessConfiguration,createAccessVerifier} from './auth/access.js';
import {SecurityFailure} from './auth/errors.js';
import {requireMutationOrigin} from './auth/middleware.js';
import {rolePermissions} from './auth/rbac.js';

interface FetchBinding {fetch(request:Request):Promise<Response>}
export type GatewayEnvironment={
  APP_ENV:string;ADMIN_ORIGIN?:string;ACCESS_ISSUER?:string;ACCESS_AUD?:string;
  ADMIN_API:FetchBinding;ASSETS:FetchBinding;
};
const csp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'none'";
const forwarding=['Accept','Content-Type','If-Match','X-Kuwago-Request','Origin','Sec-Fetch-Site'] as const;
function originConfiguration(value:string|undefined){
  try{const url=new URL(value??'');if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw Error();return url.origin;}
  catch{throw new SecurityFailure(503,'security_unavailable');}
}
function secure(response:Response,requestId:string,head=false,api=false){
  const headers=new Headers(response.headers);
  for(const name of [...headers.keys()])if(/^access-control-/i.test(name)||['set-cookie','location','refresh','last-modified','server','x-powered-by',...(!api?['etag']:[])].includes(name.toLowerCase()))headers.delete(name);
  headers.set('Cache-Control','no-store');headers.set('Pragma','no-cache');
  headers.set('Content-Security-Policy',csp);headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','DENY');headers.set('Referrer-Policy','no-referrer');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Resource-Policy','same-origin');headers.set('Strict-Transport-Security','max-age=31536000');
  headers.set('X-Robots-Tag','noindex, nofollow, noarchive');headers.set('X-Request-ID',requestId);
  return new Response(head?null:response.body,{status:response.status,headers});
}
async function sessionAllowed(response:Response){
  if(response.status!==200)throw new SecurityFailure(response.status===401?401:response.status===403?403:503,response.status===401?'unauthenticated':response.status===403?'forbidden':'security_unavailable');
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw new SecurityFailure(503,'security_unavailable');
  const reader=response.body?.getReader();if(!reader)throw new SecurityFailure(503,'security_unavailable');
  const bytes=new Uint8Array(8192);let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;if(size+part.value.length>bytes.length)throw Error();bytes.set(part.value,size);size+=part.value.length;}}
  finally{await reader.cancel().catch(()=>undefined);}
  const data=JSON.parse(new TextDecoder().decode(bytes.subarray(0,size))) as {administrator?:{id?:unknown;role?:unknown;permissions?:unknown}};
  const actor=data.administrator;
  if(!actor||typeof actor.id!=='string'||!actor.id||typeof actor.role!=='string'||!Object.hasOwn(rolePermissions,actor.role)||!Array.isArray(actor.permissions)||!actor.permissions.includes('admin:read'))throw new SecurityFailure(503,'security_unavailable');
}
export function createGateway(fetcher:typeof fetch=fetch){
  let cached:{key:string;verify:ReturnType<typeof createAccessVerifier>}|undefined;
  return {async fetch(request:Request,env:GatewayEnvironment):Promise<Response>{
    const requestId=crypto.randomUUID();const head=request.method==='HEAD';
    try{
      if(env.APP_ENV!=='development'||!env.ADMIN_API||!env.ASSETS)throw new SecurityFailure(503,'security_unavailable');
      const origin=originConfiguration(env.ADMIN_ORIGIN),url=new URL(request.url);
      // Never discover host/identity from forwarded headers or rewrite a foreign Origin.
      if(url.origin!==origin)throw new SecurityFailure(403,'forbidden');
      const configuration=accessConfiguration(env.ACCESS_ISSUER,env.ACCESS_AUD),key=configuration.issuer+'|'+configuration.audience;
      if(!cached||cached.key!==key)cached={key,verify:createAccessVerifier(configuration,fetcher)};
      await cached.verify(request);
      if(request.headers.has('Origin')&&request.headers.get('Origin')!==origin)throw new SecurityFailure(403,'csrf_rejected');
      const path=url.pathname;
      if(path.includes('%')||path.includes('\\')||path.includes('//'))throw new SecurityFailure(404,'not_found');
      const api=/^\/api\/v1(?:\/[A-Za-z0-9_-]+)+$/.test(path);
      const document=path==='/'||path==='/index.html';
      const bootstrap=path==='/preferences-bootstrap.js';
      const asset=/^\/assets\/[A-Za-z0-9][A-Za-z0-9_.-]*-[A-Za-z0-9_-]{8,}\.(js|css|svg|woff2?|webp|png)$/.exec(path);
      if(!api&&!document&&!bootstrap&&!asset)throw new SecurityFailure(404,'not_found');
      if(request.method==='OPTIONS')throw new SecurityFailure(403,'forbidden');
      const assertion=request.headers.get('Cf-Access-Jwt-Assertion')!;
      if(api){
        if(!['GET','HEAD','POST','PATCH','DELETE','PUT'].includes(request.method))throw new SecurityFailure(405,'method_not_allowed');
        if(!['GET','HEAD'].includes(request.method))requireMutationOrigin(request,origin,path==='/api/v1/media'&&request.method==='POST');
        const headers=new Headers({'Cf-Access-Jwt-Assertion':assertion});
        for(const name of forwarding){const value=request.headers.get(name);if(value!==null)headers.set(name,value);}
        const forwarded=new Request(request,{headers,redirect:'manual'});
        const response=await env.ADMIN_API.fetch(forwarded);
        if(response.status>=300&&response.status<400)throw new SecurityFailure(502,'security_unavailable');
        // ETag is the API's optimistic concurrency version, not an asset-cache grant.
        return secure(response,requestId,head,true);
      }
      if(!['GET','HEAD'].includes(request.method))throw new SecurityFailure(405,'method_not_allowed');
      if(url.search)throw new SecurityFailure(404,'not_found');
      // Valid Access membership alone does not authorize access to the Admin build.
      await sessionAllowed(await env.ADMIN_API.fetch(new Request(origin+'/api/v1/session',{headers:{'Cf-Access-Jwt-Assertion':assertion,Accept:'application/json'},redirect:'manual'})));
      const target=new URL(document?'/index.html':path,origin);
      const response=await env.ASSETS.fetch(new Request(target,{method:'GET',redirect:'manual'}));
      if(response.status!==200)throw new SecurityFailure(response.status===404?404:502,response.status===404?'not_found':'security_unavailable');
      const type=response.headers.get('Content-Type')?.split(';')[0]?.trim()??'';
      const extension=bootstrap?'js':asset?.[1];
      const expected:Record<string,readonly string[]>={js:['text/javascript','application/javascript'],css:['text/css'],svg:['image/svg+xml'],woff:['font/woff','application/font-woff'],woff2:['font/woff2'],webp:['image/webp'],png:['image/png']};
      if(document?type!=='text/html':!expected[extension??'']?.includes(type))throw new SecurityFailure(502,'security_unavailable');
      return secure(response,requestId,head);
    }catch(error){
      const failure=error instanceof SecurityFailure?error:new SecurityFailure(503,'security_unavailable');
      return secure(Response.json({error:failure.code,requestId},{status:failure.status}),requestId,head);
    }
  }};
}
export default createGateway();
