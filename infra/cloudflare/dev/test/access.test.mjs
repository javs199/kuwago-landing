import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createAccessVerifier, accessConfiguration } from '../.wrangler/build/security.js';
import { issuer,audience,signingFixture,jwksFetcher,request } from './auth-fixtures.mjs';

test('cryptographic Access verifier',async t=>{
  const key=await signingFixture();const other=await signingFixture('other-key');
  let keys=[key.publicJwk];const fetcher=jwksFetcher(()=>keys);
  const verify=createAccessVerifier({issuer,audience},fetcher.fetch);
  const reject=async token=>assert.rejects(verify(request(token)),error=>error.status===401&&error.code==='unauthenticated');
  await t.test('only configured Cloudflare team HTTPS issuer and audience accepted',()=>{
    for(const values of [[undefined,audience],[issuer,undefined],['http://localhost',audience],['https://untrusted.invalid',audience],[issuer+'/',audience],['https://name.cloudflareaccess.com@attacker.invalid',audience]])assert.throws(()=>accessConfiguration(...values));
  });
  await t.test('missing token, email header and malformed token do not fetch keys or authenticate',async()=>{
    await reject(); await reject('not-a-jwt'); await reject('x'.repeat(16385));
    await assert.rejects(verify(request(undefined,'/api/v1/session','GET',{'Cf-Access-Authenticated-User-Email':'admin@test.invalid'})));
    assert.equal(fetcher.calls,0);
  });
  await t.test('valid RS256 signature yields only stable verified issuer and subject',async()=>{
    assert.deepEqual(await verify(request(await key.token())),{issuer,subject:'subject-editor'});
    assert.equal(fetcher.calls,1);
  });
  await t.test('same kid with incorrect signature is rejected',async()=>await reject(await other.token('subject-editor',{}, {kid:'test-key-1'})));
  await t.test('expired, not-yet-valid, future issued-at and missing claims are rejected',async()=>{
    const now=Math.floor(Date.now()/1000);
    for(const claims of [{iat:now-100,exp:now-10},{nbf:now+100},{iat:now+100},{exp:undefined},{iat:undefined},{sub:undefined},{sub:''},{exp:now-10,iat:now},{iat:now-100,exp:now+10,nbf:now+20}])await reject(await key.token('subject-editor',claims));
  });
  await t.test('wrong application audience and issuer cannot be accepted',async()=>{
    await reject(await key.token('subject-editor',{aud:'other-application'}));
    await reject(await key.token('subject-editor',{iss:'https://other-team.cloudflareaccess.com'}));
  });
  await t.test('algorithm confusion and attacker-controlled key headers are rejected',async()=>{
    const now=Math.floor(Date.now()/1000);
    const symmetric=await new SignJWT({iss:issuer,aud:audience,sub:'subject-editor',iat:now,exp:now+100}).setProtectedHeader({alg:'HS256',kid:'test-key-1'}).sign(crypto.getRandomValues(new Uint8Array(32)));
    await reject(symmetric);
    for(const header of [{jku:'https://attacker.invalid/jwks'},{jwk:key.publicJwk},{x5u:'https://attacker.invalid/cert'}])await reject(await key.token('subject-editor',{},header));
  });
  await t.test('unknown kid cannot trigger repeated JWKS fetch within cooldown',async()=>{
    const before=fetcher.calls;
    await reject(await other.token()); await reject(await other.token());
    assert.equal(fetcher.calls,before);
  });
  await t.test('JWKS rotation refreshes after bounded cooldown and caches new key',async()=>{
    keys=[other.publicJwk];const now=Date.now();
    const mocked=t.mock.method(Date,'now',()=>now+31_000);
    try { assert.deepEqual(await verify(request(await other.token('subject-editor',{iat:Math.floor(now/1000)}))),{issuer,subject:'subject-editor'}); }
    finally {mocked.mock.restore();}
    assert.equal(fetcher.calls,2);
  });
  await t.test('unavailable, oversized and malformed JWKS fail closed with generic errors',async()=>{
    for(const badFetch of [async()=>{throw new Error('private diagnostic');},async()=>Response.json({keys:[]}),async()=>new Response('x'.repeat(65537)),async()=>new Response('{}',{status:302})]){
      const fail=createAccessVerifier({issuer,audience},badFetch);
      await assert.rejects(fail(request(await key.token())),e=>e.status===401&&!e.message.includes('private diagnostic'));
    }
  });
  await t.test('JWKS fetch never follows redirects and is restricted to configured issuer',async()=>{
    let calls=0;
    const check=createAccessVerifier({issuer,audience},async (input,options)=>{
      calls++;assert.equal(String(input),issuer+'/cdn-cgi/access/certs');assert.equal(options.redirect,'manual');
      return new Response(null,{status:302,headers:{Location:'https://attacker.invalid/keys'}});
    });
    await assert.rejects(check(request(await key.token())));assert.equal(calls,1);
  });
});
