import {spawn} from 'node:child_process';
/* global location, document, innerWidth */
import {createInterface} from 'node:readline';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.KUWAGO_PLAYWRIGHT_MODULE)throw Error('An existing Playwright module path is required; never install implicitly');
const {chromium}=await import(pathToFileURL(process.env.KUWAGO_PLAYWRIGHT_MODULE).href);
const out=resolve(root,'.wrangler/gateway-e2e');mkdirSync(out,{recursive:true});
const child=spawn(process.execPath,['test/gateway-harness.mjs','--provision-gateway-test-identities'],{cwd:root,stdio:['pipe','pipe','pipe']});
const buffered=[],waiting=[];let diagnostics='';child.stderr.on('data',b=>{diagnostics+=b;});
createInterface({input:child.stdout}).on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}if(!['ready','control'].includes(data.event))return;const next=waiting.shift();if(next)next(data);else buffered.push(data);});
async function next(){if(buffered.length)return buffered.shift();let timer;try{return await Promise.race([new Promise(ok=>waiting.push(ok)),new Promise((_,fail)=>{timer=setTimeout(()=>fail(Error('local_gateway_harness_timeout')),30000);})]);}finally{clearTimeout(timer);}}
async function control(action,value){child.stdin.write(JSON.stringify({action,value})+'\n');assert.equal((await next()).ok,true);}
const checks=[],pageErrors=[],cspErrors=[],networkErrors=[];let browser,page,current='startup',draftPayload;
async function check(name,task){current=name;await task();checks.push(name);console.log(JSON.stringify({check:name,passed:true}));}
try{
  const ready=await next();assert.equal(ready.event,'ready');const base=ready.origin;
  browser=await chromium.launch({headless:true,channel:process.env.KUWAGO_E2E_BROWSER_CHANNEL??'msedge'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(/Content Security Policy|violates.*directive/i.test(m.text()))cspErrors.push(m.text());else if(m.type()==='error')networkErrors.push(m.text());});
  page.on('requestfailed',r=>networkErrors.push(new URL(r.url()).pathname+':'+r.failure()?.errorText));
  const js=readFileSync(resolve(root,'../../../apps/admin/dist/index.html'),'utf8').match(/src="(\/assets\/[^" ]+\.js)"/)[1];
  await check('anonymous HTML, bootstrap and real bundle are denied',async()=>{for(const path of ['/','/preferences-bootstrap.js',js])assert.equal((await context.request.get(base+path)).status(),401);});
  await control('identity','editor');
  await check('production React build loads through real gateway and API with CSP',async()=>{const r=await page.goto(base+'/#services');assert.equal(r.status(),200);await page.getByText('fixture-editor · editor',{exact:false}).waitFor();assert.match(r.headers()['content-security-policy'],/script-src 'self'/);assert.ok(!r.headers()['content-security-policy'].includes('unsafe-inline'));});
  await check('ES/EN categories and draft persist through same-origin gateway',async()=>{
    await page.getByRole('button',{name:'Gestionar categorías',exact:true}).click();await page.getByLabel('Categoría · Español').fill('Gateway sintético');await page.getByLabel('Categoría · Inglés').fill('Synthetic gateway');await page.getByLabel('Slug',{exact:true}).fill('gateway-category');
    const created=page.waitForResponse(r=>r.url().endsWith('/api/v1/categories')&&r.request().method()==='POST');await page.getByRole('button',{name:'Guardar categoría',exact:true}).click();assert.equal((await created).status(),201);
    await page.getByRole('link',{name:'Nuevo servicio',exact:true}).click();await page.getByLabel('Nombre · Español',{exact:true}).fill('Prueba gateway');await page.getByLabel('Nombre · Inglés',{exact:true}).fill('Gateway test');await page.getByLabel('Descripción · Español').fill('Solo pruebas sintéticas.');await page.getByLabel('Descripción · Inglés').fill('Synthetic tests only.');await page.getByLabel('Categoría',{exact:true}).selectOption({label:'Gateway sintético'});await page.getByLabel('Slug',{exact:true}).fill('gateway-service');
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/v1/services')&&r.request().method()==='POST');await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();draftPayload=(await saved).request().postDataJSON();await page.waitForURL(/services\/[^/]+\/edit/);await page.getByText('Guardado en D1 local · pendiente de aprobación',{exact:true}).first().waitFor();
  });
  await check('API version headers and real optimistic 409 cross gateway unchanged',async()=>{
    const result=await page.evaluate(async body=>{const id=location.hash.match(/services\/([^/]+)/)[1],r=await fetch('/api/v1/services/'+id);const conflict=await fetch('/api/v1/services/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','X-Kuwago-Request':'1','If-Match':'"999999"'},body:JSON.stringify(body)});return {etag:r.headers.get('ETag'),status:conflict.status};},draftPayload);
    assert.match(result.etag,/^"[1-9][0-9]*"$/);assert.equal(result.status,409);
  });
  await check('protected PNG upload and private preview cross both Workers',async()=>{
    const png=await sharp({create:{width:24,height:16,channels:3,background:'#3B0C5B'}}).png().toBuffer();
    const uploaded=page.waitForResponse(r=>r.url().endsWith('/api/v1/media')&&r.request().method()==='POST');await page.getByLabel('Seleccionar archivo multimedia',{exact:true}).setInputFiles({name:'gateway-synthetic.png',mimeType:'image/png',buffer:png});assert.equal((await uploaded).status(),201);
    await page.getByRole('button',{name:'Asociar',exact:true}).first().click();await page.locator('.media-private-preview').first().waitFor();assert.ok(await page.locator('.media-private-preview').first().evaluate(image=>image.complete&&image.naturalWidth===24));
  });
  await check('editor publication and CSRF requests denied at server',async()=>{
    const result=await page.evaluate(async()=>{
      const id=location.hash.match(/services\/([^/]+)/)[1];
      return {publish:(await fetch('/api/v1/services/'+id+'/publish',{method:'POST',headers:{'Content-Type':'application/json','X-Kuwago-Request':'1','If-Match':'"1"'},body:'{}'})).status,csrf:(await fetch('/api/v1/services',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status};
    });assert.equal(result.publish,403);assert.equal(result.csrf,403);
  });
  await check('CORS, public API, source and alternative login routes fail closed',async()=>{
    assert.equal((await context.request.get(base+'/api/v1/session',{headers:{Origin:'https://evil.invalid'}})).status(),403);
    assert.equal((await context.request.fetch(base+'/api/v1/session',{method:'OPTIONS',headers:{Origin:'https://evil.invalid','Access-Control-Request-Method':'POST'}})).status(),403);
    for(const path of ['/v1/catalog','/.env','/src/main.tsx','/__local-test/login','/services'])assert.equal((await context.request.get(base+path)).status(),404);
  });
  await check('responsive themes and language preserve preferences under CSP',async()=>{
    await page.evaluate(()=>{localStorage.setItem('kuwago-admin-theme','dark');localStorage.setItem('kuwago-admin-language','en');});await page.reload();await page.getByText('fixture-editor · editor',{exact:false}).waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.screenshot({path:resolve(out,'desktop-dark.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'mobile-dark.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>{localStorage.setItem('kuwago-admin-theme','light');localStorage.setItem('kuwago-admin-language','es');});await page.reload();await page.screenshot({path:resolve(out,'mobile-light.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:resolve(out,'desktop-light.png'),fullPage:true});
  });
  await check('React hash navigation and reload stay protected',async()=>{await page.goto(base+'/#overview');await page.goto(base+'/#services');await page.getByRole('link',{name:'Nuevo servicio',exact:true}).waitFor();});
  await check('expired and forged sessions deny API and cached assets',async()=>{
    for(const mode of ['expired','invalid']){await control('token-mode',mode);for(const path of ['/','/preferences-bootstrap.js',js,'/api/v1/session'])assert.equal((await context.request.get(base+path)).status(),401);}
    await control('token-mode','normal');
  });
  await check('session expiry reaches existing React error state',async()=>{await control('token-mode','expired');await page.getByRole('button',{name:'Recargar desde servidor',exact:true}).first().click();await page.getByRole('alert').filter({hasText:'Sesión ausente o expirada'}).first().waitFor();await control('token-mode','normal');});
  await check('disabled administrator cannot load UI, assets or API',async()=>{await control('identity','disabled');for(const path of ['/',js,'/api/v1/session'])assert.equal((await context.request.get(base+path)).status(),403);});
  await check('private API outage fails closed before serving HTML',async()=>{await control('identity','editor');await control('api-down',true);assert.equal((await context.request.get(base+'/')).status(),503);await control('api-down',false);});
  assert.deepEqual(pageErrors,[]);assert.deepEqual(cspErrors,[]);
  const report={passed:checks.length,checks,pageErrors,cspErrors,remoteOperations:0};writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){if(page){await page.screenshot({path:resolve(out,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(resolve(out,'failure.html'),await page.content());}console.error(JSON.stringify({current,error:String(error),pageErrors,cspErrors,networkErrors,localDiagnostics:diagnostics.slice(-1000)}));process.exitCode=1;}
finally{if(browser)await browser.close();if(child.exitCode===null){child.stdin.end('{"action":"shutdown"}\n');await new Promise(ok=>child.once('exit',ok));}}
