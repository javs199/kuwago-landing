import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import barrierWorker from '../.wrangler/build/barrier.js';
export const localBarrier=db=>({fetch:request=>barrierWorker.fetch(request,{APP_ENV:'development',DB:db})});

// Generated in memory, exclusively for tests. No real Cloudflare JWT, private key or account.
export const issuer='https://kuwago-unit-test.cloudflareaccess.com';
export const audience='kuwago-test-app-only';
export const origin='https://admin.test.invalid';
export async function signingFixture(kid='test-key-1') {
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const publicJwk={...await exportJWK(publicKey),kid,alg:'RS256',use:'sig'};
  return {
    publicJwk,
    async token(subject='subject-editor',overrides={},header={}) {
      const now=Math.floor(Date.now()/1000);
      return new SignJWT({iss:issuer,aud:audience,sub:subject,iat:now,exp:now+3600,...overrides})
        .setProtectedHeader({alg:'RS256',kid,...header}).sign(privateKey);
    },
  };
}
export function jwksFetcher(keys) {
  let calls=0;
  return {
    fetch:async input=>{ if(String(input)!==issuer+'/cdn-cgi/access/certs') throw new Error('unexpected_external_request'); calls++; return Response.json({keys:keys()}); },
    get calls(){return calls;},
  };
}
export function request(token,path='/api/v1/session',method='GET',headers={},body) {
  return new Request('https://worker.test.invalid'+path,{method,headers:{...(token?{'Cf-Access-Jwt-Assertion':token}:{}),...headers},...(body!==undefined?{body}:{} )});
}
export async function localDatabase(options={},migrationLimit=Infinity) {
  const mf=new Miniflare(convertV4MiniflareOptions({
    name:'kuwago-auth-test-only',host:'127.0.0.1',modules:true,
    script:'export default {fetch(){return new Response(null,{status:503})}}',
    compatibilityDate:'2026-07-30',telemetry:{enabled:false},cf:false,
    d1Databases:{DB:'ephemeral-auth-only'},...options,
  }));
  try {
    const db=await mf.getD1Database('DB');
    const manifest=JSON.parse(readFileSync(new URL('../../../../packages/database/migrations.sha256.json',import.meta.url),'utf8'));
    for (const {file} of manifest.migrations.slice(0,migrationLimit)) {
      const content=readFileSync(new URL('../../../../packages/database/migrations/'+file,import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
      await db.batch(content.split(/;\s*(?=(?:CREATE|INSERT|DROP|ALTER|UPDATE|PRAGMA)\b)/).map(q=>db.prepare(q.trim())));
    }
    return {mf,db};
  } catch(error) {await mf.dispose();throw error;}
}
export async function seedAdministrators(db) {
  await db.batch([
    db.prepare("INSERT INTO principals(id,issuer,subject,enabled) VALUES ('fixture-operator',?,'subject-operator',1),('fixture-editor',?,'subject-editor',1),('fixture-admin',?,'subject-admin',1),('fixture-super',?,'subject-super',1),('fixture-disabled',?,'subject-disabled',0),('fixture-no-role',?,'subject-no-role',1),('fixture-legacy',?,'subject-legacy',1)").bind(...Array(7).fill(issuer)),
    db.prepare("INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES ('fixture-editor','editor','fixture-operator'),('fixture-admin','admin','fixture-operator'),('fixture-super','super_admin','fixture-operator'),('fixture-disabled','admin','fixture-operator')"),
    db.prepare("INSERT INTO principal_roles(principal_id,role_id,granted_by) VALUES ('fixture-legacy','publisher','fixture-operator')"),
  ]);
}
