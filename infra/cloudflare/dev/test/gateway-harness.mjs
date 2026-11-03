// Operator-only local test bridge. Never imported by any deployed entrypoint.
import {createServer} from 'node:http';
import {createInterface} from 'node:readline';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {normalizeImage} from '../scripts/image-normalizer.mjs';
import {localDatabase,seedAdministrators,signingFixture,issuer,audience} from './auth-fixtures.mjs';
if(process.argv.slice(2).join(' ')!=='--provision-gateway-test-identities')throw Error('Explicit local test identity provisioning required');
// Miniflare's own dev-server CSRF boundary permits localhost origins. This is a test-only canonical HTTPS origin.
const origin='https://localhost',localOrigin='http://127.0.0.1:5190',dist=fileURLToPath(new URL('../../../../apps/admin/dist/',import.meta.url));
const key=await signingFixture('gateway-browser-test-only');
let subject=null,tokenMode='normal',apiDown=false;
const outboundService=async request=>{if(request.url!==issuer+'/cdn-cgi/access/certs')throw Error('external_network_forbidden');return Response.json({keys:[key.publicJwk]});};
const {mf,db}=await localDatabase({script:readFileSync(new URL('../.wrangler/build/worker.js',import.meta.url),'utf8'),r2Buckets:{PRIVATE_MEDIA:'gateway-test-private',PUBLICATION:'gateway-test-publication'},bindings:{APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin,MUTATIONS_ENABLED:'true',EXECUTION_MODE:'local-only'},serviceBindings:{IMAGE_NORMALIZER:normalizeImage},outboundService});
await seedAdministrators(db);const api=await mf.getWorker();
const gatewayRuntime=new Miniflare(convertV4MiniflareOptions({name:'kuwago-gateway-browser-test-only',cf:false,telemetry:{enabled:false},modules:true,script:readFileSync(new URL('../.wrangler/build/gateway.js',import.meta.url),'utf8'),compatibilityDate:'2026-07-30',assets:{directory:dist,binding:'ASSETS',run_worker_first:true,assetConfig:{html_handling:'none',not_found_handling:'none'}},bindings:{APP_ENV:'development',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:origin},serviceBindings:{
  ADMIN_API:request=>{if(apiDown)throw Error('synthetic_api_outage');return api.fetch(request);},
},outboundService}));
const gateway=await gatewayRuntime.getWorker();
const server=createServer(async(req,res)=>{
  try{
    if(req.headers.host!=='127.0.0.1:5190'||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403);res.end();return;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2097152)throw Error('test_body_limit');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks),headers=new Headers();
    for(const [name,value] of Object.entries(req.headers))if(value&&!['host','cf-access-jwt-assertion'].includes(name))headers.set(name,Array.isArray(value)?value.join(','):value);
    if(headers.get('Origin')===localOrigin)headers.set('Origin',origin); // Only a validated loopback origin is canonicalized by this test bridge.
    if(subject){const now=Math.floor(Date.now()/1000);headers.set('Cf-Access-Jwt-Assertion',tokenMode==='invalid'?'invalid.jwt.value':await key.token(subject,tokenMode==='expired'?{iat:now-3600,exp:now-60}:{}));}
    const response=await gateway.fetch(new Request(origin+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:bytes}:{})}));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"isolated_test_bridge_failure"}');}
});
await new Promise(ok=>server.listen(5190,'127.0.0.1',ok));
console.log(JSON.stringify({event:'ready',origin:localOrigin}));
const input=createInterface({input:process.stdin});
try{for await(const line of input){
  try{
    const value=JSON.parse(line);
    if(value.action==='identity'&&[null,'editor','admin','super','disabled'].includes(value.value))subject=value.value?'subject-'+value.value:null;
    else if(value.action==='token-mode'&&['normal','expired','invalid'].includes(value.value))tokenMode=value.value;
    else if(value.action==='api-down')apiDown=value.value===true;
    else if(value.action==='shutdown')break;
    else throw Error('unsupported_operator_control');
    console.log(JSON.stringify({event:'control',ok:true}));
  }catch{console.log(JSON.stringify({event:'control',ok:false}));}
}}finally{await new Promise(ok=>server.close(ok));await gatewayRuntime.dispose();await mf.dispose();}
