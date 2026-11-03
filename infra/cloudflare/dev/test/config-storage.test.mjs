import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertLocalConfig, localCommand } from '../scripts/local.mjs';
import worker from '../src/deny-all.ts';
import { privateObjectKey, validateDecodedImage, canTransitionMedia } from '../src/media.ts';

const config = JSON.parse(readFileSync(new URL('../wrangler.local.json', import.meta.url), 'utf8'));
test('versioned SQL matches reviewed checksums', () => {
  const manifest=JSON.parse(readFileSync(new URL('../../../../packages/database/migrations.sha256.json',import.meta.url),'utf8'));
  assert.equal(manifest.algorithm,'SHA-256'); assert.equal(manifest.migrations.length,6);
  for(const {file,sha256} of manifest.migrations) assert.equal(createHash('sha256').update(readFileSync(new URL('../../../../packages/database/migrations/'+file,import.meta.url))).digest('hex'),sha256);
});
test('local configuration has no real IDs, remote bindings or production/staging environments', () => {
  assert.doesNotThrow(() => assertLocalConfig(config));
  for (const mutate of [c => {c.account_id='not-allowed';}, c => {c.env.production={};}, c => {c.env.development.d1_databases[0].remote=true;}, c => {c.env.development.d1_databases[0].database_id='not-allowed';}, c => {c.env.development.preview_urls=true;}]) {
    const copy=structuredClone(config); mutate(copy); assert.throws(()=>assertLocalConfig(copy));
  }
});
test('built Worker has no test identities, key material, simulation flags or authentication bypass',()=>{
  const bundle=readFileSync(new URL('../.wrangler/build/worker.js',import.meta.url),'utf8');
  for(const value of ['kuwago-unit-test','subject-super','test-key-1','fixture-super','generateKeyPair','PRIVATE KEY','AUTH_BYPASS','TEST_AUTH'])assert.ok(!bundle.includes(value));
  assert.equal(config.env.development.vars.ACCESS_ISSUER,'');assert.equal(config.env.development.vars.ACCESS_AUD,'');
  assert.equal(config.access,undefined);
});
test('public Worker bundle and config contain no administrative/D1/private-media surface',()=>{
  const bundle=readFileSync(new URL('../.wrangler/build/public.js',import.meta.url),'utf8');
  for(const value of ['administrator_roles','commercial_approvals','Cf-Access-Jwt-Assertion','PRIVATE_MEDIA','SELECT ','INSERT ','createAccessVerifier'])assert.ok(!bundle.includes(value));
  const publicConfig=JSON.parse(readFileSync(new URL('../wrangler.public.local.json',import.meta.url),'utf8'));
  assert.equal(publicConfig.account_id,undefined);assert.equal(publicConfig.dev.ip,'127.0.0.1');
  assert.equal(publicConfig.env.development.d1_databases,undefined);
  assert.equal(publicConfig.env.development.r2_buckets[0].remote,false);
});
test('wrapper exposes only fixed local operations; arbitrary command/extra remote arguments rejected', () => {
  for (const action of ['migrate','list','dev']) { const args=localCommand(action); assert.ok(args.includes('--local')); assert.ok(!args.includes('--remote')); assert.ok(args.includes('development')); }
  assert.ok(localCommand('validate').includes('--dry-run'));
  for(const action of ['deploy','login','remote','production','migrate --remote']) assert.throws(()=>localCommand(action));
});
test('remote candidate is explicitly pending and not targeted by local scripts', () => {
  const candidate=JSON.parse(readFileSync(new URL('../wrangler.remote-development.example.json',import.meta.url),'utf8'));
  assert.equal(candidate.name,'kuwago-admin-api-development');
  assert.match(candidate.account_id,/^__PENDING_/); assert.match(candidate.main,/^__BLOCKED_/);
  assert.equal(candidate.env,undefined); assert.equal(candidate.preview_urls,false);
  assert.equal(candidate.r2_buckets[0].bucket_name,'kuwago-media-development');
});
test('preparation worker denies every request without accepting identity or returning private data', async () => {
  for (const path of ['/','/api/v1/services','/api/v1/media/secret']) for(const method of ['GET','POST','DELETE','OPTIONS']) {
    const response=await worker.fetch(new Request('http://localhost'+path,{method}));
    assert.equal(response.status,503); assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    assert.deepEqual(await response.json(),{error:'admin_backend_not_enabled'});
  }
});
test('media storage keys are generated private DEV keys, not user-selected URLs', () => {
  assert.equal(privateObjectKey('test-only-image'),'development/quarantine/test-only-image');
  for(const id of ['../original','https://public.test/file','a/b','', 'x'.repeat(97)]) assert.throws(()=>privateObjectKey(id));
});
test('trusted decoder metadata must satisfy limits, MIME and complete normalization', () => {
  const image={mimeType:'image/jpeg',byteSize:2048,width:100,height:100,fullyDecoded:true,metadataStripped:true};
  assert.deepEqual(validateDecodedImage(image),[]);
  for (const patch of [{mimeType:'image/svg+xml'},{byteSize:2097153},{byteSize:0},{width:4097},{width:4000,height:3000},{width:1.5},{fullyDecoded:false},{metadataStripped:false}]) assert.ok(validateDecodedImage({...image,...patch}).length);
});
test('media lifecycle never restores retired/deleted content or approves quarantine directly', () => {
  assert.equal(canTransitionMedia('quarantine','validated'),true);
  for(const pair of [['quarantine','approved'],['retired','approved'],['deleted','quarantine']]) assert.equal(canTransitionMedia(...pair),false);
});
