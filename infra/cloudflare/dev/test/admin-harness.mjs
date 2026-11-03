import {normalizeImage} from '../scripts/image-normalizer.mjs';
// Operator-opt-in test process. Never imported by a production Worker or React bundle.
import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createInterface} from 'node:readline';
import {readFileSync} from 'node:fs';
import publicWorker from '../.wrangler/build/public.js';
import {localDatabase,signingFixture,issuer,audience,localBarrier} from './auth-fixtures.mjs';
if(process.argv.slice(2).join(' ')!=='--provision-test-identities --allow-test-reviewer')throw new Error('Explicit provisioning and opt-in to the test reviewer role are required');
const frontendOrigin=process.env.KUWAGO_TEST_FRONTEND_ORIGIN??'http://127.0.0.1:5175';
if(!['http://127.0.0.1:5175','http://127.0.0.1:5185'].includes(frontendOrigin))throw new Error('Loopback frontend required');
const key=await signingFixture('isolated-ui-test-key');
const internalOrigin='https://localhost';const ttl=600000;const created=Date.now();
let apiDown=false,deliveryOffline=false,tokenMode='normal';
const {mf,db}=await localDatabase({script:undefined,modules:[
  {type:'ESModule',path:'admin-e2e-entry.mjs',contents:`import worker from './admin-e2e-worker.mjs'; export default {async fetch(request,env){const flags=await (await env.TEST_CONTROL.fetch('https://test-control.internal/')).json();return worker.fetch(request,{...env,PUBLICATION:flags.deliveryOffline?{get(){throw new Error('test storage offline')},put(){throw new Error('test storage offline')}}:env.PUBLICATION});}};`},
  {type:'ESModule',path:'admin-e2e-worker.mjs',contents:readFileSync(new URL('../.wrangler/build/worker.js',import.meta.url),'utf8')},
],r2Buckets:{PUBLICATION:'admin-ui-e2e-test-only',PRIVATE_MEDIA:'admin-ui-private-test-only'},bindings:{APP_ENV:'development',EXECUTION_MODE:'local-only',ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ADMIN_ORIGIN:internalOrigin,MUTATIONS_ENABLED:'true'},
serviceBindings:{IMAGE_NORMALIZER:normalizeImage,TEST_CONTROL:async()=>Response.json({deliveryOffline})},
outboundService:async request=>{if(request.url!==issuer+'/cdn-cgi/access/certs')throw new Error('unexpected_network_request');return Response.json({keys:[key.publicJwk]});}});
await db.batch([
  db.prepare("INSERT INTO principals(id,issuer,subject,enabled) VALUES ('fixture-operator',?,'subject-operator',1),('fixture-editor',?,'subject-editor',1),('fixture-editor2',?,'subject-editor2',1),('fixture-admin',?,'subject-admin',1),('fixture-disabled',?,'subject-disabled',0)").bind(...Array(5).fill(issuer)),
  db.prepare("INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES ('fixture-editor','editor','fixture-operator'),('fixture-editor2','editor','fixture-operator'),('fixture-admin','admin','fixture-operator'),('fixture-disabled','editor','fixture-operator')"),
]);
const worker=await mf.getWorker();const store=await mf.getR2Bucket('PUBLICATION');
const identities={editor:'subject-editor',editor2:'subject-editor2',reviewer:'subject-admin',disabled:'subject-disabled'};
const credentials={};const hashes=new Map();
for(const id of Object.keys(identities)){credentials[id]=Array.from({length:8},()=>randomBytes(24).toString('base64url'));hashes.set(id,credentials[id].map(value=>createHash('sha256').update(value).digest()));}
const sessions=new Map();
async function signed(subject){if(tokenMode==='invalid')return 'invalid.jwt.value';const now=Math.floor(Date.now()/1000);return key.token(subject,tokenMode==='expired'?{iat:now-3600,exp:now-30}:{exp:now+600});}
const server=createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const send=(status,body,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json',...extra});res.end(JSON.stringify(body));};
  try{
    if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!['127.0.0.1:8794',new URL(frontendOrigin).host].includes(req.headers.host))return send(403,{error:'forbidden'});
    const url=new URL(req.url,'http://127.0.0.1:8794');let bytes=0;const chunks=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>2097152)return send(413,{error:'body_too_large'});chunks.push(chunk);}
    const raw=Buffer.concat(chunks);const body=raw.toString('utf8');
    if(!['GET','HEAD'].includes(req.method)&&
      (req.headers.origin!==frontendOrigin||req.headers['x-kuwago-request']!=='1'||!['application/json','image/png','image/jpeg','image/webp'].includes(req.headers['content-type']?.split(';')[0])||req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'))return send(403,{error:'csrf_rejected'});
    const cookie=/\bkuwago_local_test=([A-Za-z0-9_-]{32,})/.exec(req.headers.cookie??'')?.[1];
    if(url.pathname==='/__local-test/logout'&&req.method==='POST'){sessions.delete(cookie);return send(200,{ended:true},{'Set-Cookie':'kuwago_local_test=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
    if(url.pathname==='/__local-test/login'&&req.method==='POST'){
      const value=JSON.parse(body);if(!Object.hasOwn(identities,value.identity)||typeof value.code!=='string'||Date.now()-created>ttl)return send(401,{error:'unauthenticated'});
      const candidate=createHash('sha256').update(value.code).digest();const allowed=hashes.get(value.identity);const index=allowed.findIndex(hash=>timingSafeEqual(hash,candidate));
      if(index<0)return send(401,{error:'unauthenticated'});allowed.splice(index,1);
      const subject=identities[value.identity];const token=await signed(subject);
      const verified=await worker.fetch(new Request(internalOrigin+'/api/v1/session',{headers:{'Cf-Access-Jwt-Assertion':token}}));
      if(verified.status!==200)return send(verified.status,{error:'unauthenticated'});
      const session=randomBytes(32).toString('base64url');sessions.set(session,{subject,until:Date.now()+ttl});
      return send(200,{authenticated:true},{'Set-Cookie':`kuwago_local_test=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`});
    }
    if(url.pathname.startsWith('/api/v1/')){
      if(apiDown)return send(503,{error:'test_api_unavailable'});
      if(req.headers['cf-access-jwt-assertion']||req.headers.authorization)return send(403,{error:'forbidden'});
      const session=sessions.get(cookie);const token=session&&session.until>Date.now()?await signed(session.subject):null;
      // The browser origin is validated above BEFORE conversion to canonical HTTPS.
      const forwarded={'Content-Type':req.headers['content-type']??'application/json','X-Kuwago-Request':req.headers['x-kuwago-request']??'',...(token?{'Cf-Access-Jwt-Assertion':token}:{}),...(req.headers['if-match']?{'If-Match':req.headers['if-match']}:{})};
      if(!['GET','HEAD'].includes(req.method)){forwarded.Origin=internalOrigin;forwarded['Sec-Fetch-Site']='same-origin';}
      const result=await worker.fetch(new Request(internalOrigin+url.pathname+url.search,{method:req.method,headers:forwarded,...(raw.length?{body:raw}:{})}));
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    if(url.pathname.startsWith('/v1/')&&['GET','HEAD'].includes(req.method)){
      const result=await publicWorker.fetch(new Request('https://public.test.invalid'+url.pathname+url.search),{APP_ENV:'development',PUBLICATION:store,CATALOG_BARRIER:localBarrier(db)});
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    return send(404,{error:'not_found'});
  }catch{return send(503,{error:'test_harness_failure'});}
});
await new Promise(resolve=>server.listen(8794,'127.0.0.1',resolve));
// Ephemeral one-time TEST credentials on the operator's pipe/terminal, never JWT/private keys.
console.log(JSON.stringify({event:'ready',credentials,origin:frontendOrigin}));
const input=createInterface({input:process.stdin});
for await(const line of input){
  try{
    const command=JSON.parse(line);
    if(command.action==='api-down')apiDown=command.value===true;
    else if(command.action==='r2-down')deliveryOffline=command.value===true;
    else if(command.action==='token-mode'&&['normal','invalid','expired'].includes(command.value))tokenMode=command.value;
    else if(command.action==='attach-synthetic-media'){
      const revision=await db.prepare("SELECT r.id FROM service_revisions r JOIN services s ON s.working_revision_id=r.id WHERE s.id=? AND s.status='draft' AND r.sealed_at IS NULL").bind(command.serviceId).first();
      if(!revision)throw new Error('draft_fixture_required');
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO media_assets(id,private_object_key,derivative_object_key,state,provenance,usage_approval,sha256,mime_type,byte_size,width,height,uploaded_by,reviewed_by,reviewed_at)
          VALUES ('ui-test-media','development/quarantine/ui-test','development/derived/ui-test','approved','verified','approved',?,'image/png',1,1,1,'fixture-editor','fixture-admin','2026-01-01T00:00:00Z')`).bind('a'.repeat(64)),
        db.prepare('INSERT INTO revision_media VALUES (?,?,0)').bind(revision.id,'ui-test-media'),
        db.prepare("INSERT INTO revision_media_translations VALUES (?,?,'es',''),(?,?,'en','')").bind(revision.id,'ui-test-media',revision.id,'ui-test-media'),
        db.prepare('UPDATE services SET row_version=row_version+1 WHERE id=?').bind(command.serviceId),db.prepare('UPDATE catalog_state SET version=version+1'),
      ]);
    }else if(command.action==='reconcile'){
      await db.prepare('UPDATE publication_outbox SET next_attempt_at=0').run();
      const token=await key.token('subject-admin');await worker.fetch(new Request(internalOrigin+'/api/v1/catalog/sync',{method:'POST',headers:{'Cf-Access-Jwt-Assertion':token,Origin:internalOrigin,'Content-Type':'application/json','X-Kuwago-Request':'1'},body:'{}'}));
    }else if(command.action==='shutdown'){console.log(JSON.stringify({event:'stopped'}));break;}
    else throw new Error('unsupported_control');
    console.log(JSON.stringify({event:'control',ok:true}));
  }catch{console.log(JSON.stringify({event:'control',ok:false}));}
}
await new Promise(resolve=>server.close(resolve));await mf.dispose();
