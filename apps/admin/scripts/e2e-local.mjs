import {createRequire} from 'node:module';

const sharp=createRequire(new URL('../../../infra/cloudflare/dev/package.json',import.meta.url))('sharp');

/* global document, innerWidth, window */

import {spawn} from 'node:child_process';

import {createInterface} from 'node:readline';

import {mkdirSync,writeFileSync} from 'node:fs';

import {resolve} from 'node:path';

import {fileURLToPath,pathToFileURL} from 'node:url';

import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../../../',import.meta.url));

if(!process.env.KUWAGO_PLAYWRIGHT_MODULE)throw new Error('Set KUWAGO_PLAYWRIGHT_MODULE to an installed Playwright index.mjs; no dependency is installed by this script.');

const {chromium}=await import(pathToFileURL(resolve(process.env.KUWAGO_PLAYWRIGHT_MODULE)).href);

const backend=resolve(root,'infra/cloudflare/dev'),admin=resolve(root,'apps/admin');

const output=resolve(backend,'.wrangler/admin-e2e');mkdirSync(output,{recursive:true});

const harness=spawn(process.execPath,['test/admin-harness.mjs','--provision-test-identities','--allow-test-reviewer'],{cwd:backend,env:{...process.env,KUWAGO_TEST_FRONTEND_ORIGIN:'http://127.0.0.1:5185'},stdio:['pipe','pipe','pipe']});

let stderr='';harness.stderr.on('data',chunk=>{stderr+=chunk;});

const buffered=[],waiting=[];createInterface({input:harness.stdout}).on('line',line=>{let value;try{value=JSON.parse(line);}catch{return;}if(!['ready','control','stopped'].includes(value.event))return;const next=waiting.shift();if(next)next(value);else buffered.push(value);});

async function next(){if(buffered.length)return buffered.shift();let timer;try{return await Promise.race([new Promise(resolve=>waiting.push(resolve)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Harness response timeout: '+stderr.slice(-500))),30000);})]);}finally{clearTimeout(timer);}}

async function control(action,value={}){harness.stdin.write(JSON.stringify({action,...value})+'\n');const result=await next();assert.equal(result.ok,true,action);}

let vite,browser,page,currentCheck='initialization';const checks=[],consoleErrors=[];

async function check(name,task){currentCheck=name;await task();checks.push(name);}

try{

  const ready=await next();assert.equal(ready.event,'ready');const credentials=ready.credentials;

  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5185','--strictPort'],{cwd:admin,env:{...process.env,VITE_LOCAL_TEST_LOGIN:'true'},stdio:'ignore'});

  for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:5185');if(r.ok)break;}catch{/* wait for local listener */}await new Promise(resolve=>setTimeout(resolve,100));}

  browser=await chromium.launch({headless:true,channel:process.env.KUWAGO_E2E_BROWSER_CHANNEL??'msedge'});

  const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();

  page.on('pageerror',error=>consoleErrors.push(error.message));

  await page.goto('http://127.0.0.1:5185/#services');await page.waitForLoadState('networkidle');

  await page.getByLabel('Credencial de prueba de un solo uso').waitFor();

  async function login(target,identity){await target.getByLabel('Identidad local de prueba',{exact:true}).selectOption(identity);await target.getByLabel('Credencial de prueba de un solo uso').fill(credentials[identity].shift());await target.getByRole('button',{name:'Autenticar identidad de prueba',exact:true}).click();if(identity!=='disabled')await target.getByText(`fixture-${identity==='reviewer'?'admin':identity} · ${identity==='reviewer'?'admin':'editor'}`,{exact:false}).waitFor();}

  async function confirmAction(name){await page.getByRole('button',{name,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();}

  await check('authorized real JWT + local D1 session',async()=>{await login(page,'editor');assert.equal(await page.getByRole('button',{name:'Publicar servicio',exact:true}).count(),0);});

  await check('category API ES/EN create',async()=>{

    await page.getByRole('button',{name:'Gestionar categorías',exact:true}).click();await page.getByLabel('Categoría · Español').fill('Categoría E2E');await page.getByLabel('Categoría · Inglés').fill('E2E category');await page.getByLabel('Slug',{exact:true}).fill('e2e-category');

    const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/categories')&&r.request().method()==='POST');await page.getByRole('button',{name:'Guardar categoría',exact:true}).click();assert.equal((await response).status(),201);

  });

  let serviceId;

  await check('create bilingual draft through React HTTP client',async()=>{

    await page.getByRole('link',{name:'Nuevo servicio',exact:true}).click();await page.getByLabel('Nombre · Español',{exact:true}).fill('Servicio E2E sintético');await page.getByLabel('Nombre · Inglés',{exact:true}).fill('Synthetic E2E service');await page.getByLabel('Descripción · Español').fill('Solo datos de prueba, sin oferta comercial.');await page.getByLabel('Descripción · Inglés').fill('Test data only, not a commercial offer.');await page.getByLabel('Categoría',{exact:true}).selectOption({label:'Categoría E2E'});await page.getByLabel('Slug',{exact:true}).fill('e2e-synthetic-service');await page.getByLabel('Opción · Español 1').fill('Opción sintética');await page.getByLabel('Opción · Inglés 1').fill('Synthetic option');await page.getByLabel('Duración (minutos) 1').fill('60');

    await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.waitForURL(/services\/[a-f0-9-]+\/edit/);serviceId=page.url().match(/services\/([^/]+)\/edit/)[1];await page.getByText('Guardado en D1 local · pendiente de aprobación',{exact:true}).first().waitFor();assert.ok(await page.getByRole('button',{name:'Agregar imagen',exact:true}).isEnabled());

  });

  await check('real protected uploads, private previews, cover/order and ES/EN alt text',async()=>{

    const png=await sharp({create:{width:40,height:24,channels:3,background:'#3B0C5B'}}).png().toBuffer();

    for(let index=0;index<2;index++){

      const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/media')&&r.request().method()==='POST');

      await page.getByLabel('Seleccionar archivo multimedia',{exact:true}).setInputFiles({name:'synthetic-'+index+'.png',mimeType:'image/png',buffer:png});

      const result=await response;assert.equal(result.status(),201,await result.text());

      await page.getByRole('button',{name:'Asociar',exact:true}).first().waitFor();

      await page.getByRole('button',{name:'Asociar',exact:true}).first().click();

    }

    await page.getByRole('button',{name:'Portada',exact:true}).last().click();

    for(let index=1;index<=2;index++){await page.getByLabel('Texto alternativo · Español '+index).fill('Imagen sintética '+index);await page.getByLabel('Texto alternativo · Inglés '+index).fill('Synthetic image '+index);}

    await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByText('Guardado en D1 local · pendiente de aprobación',{exact:true}).first().waitFor();

    assert.ok(await page.locator('.media-private-preview').first().evaluate(image=>image.complete&&image.naturalWidth>0));

  });

  await check('editor cannot publish in UI or by direct API request',async()=>{

    assert.ok(await page.getByRole('button',{name:'Publicar servicio',exact:true}).isDisabled());const status=await page.evaluate(async id=>(await fetch('/api/v1/services/'+id+'/publish',{method:'POST',headers:{'Content-Type':'application/json','X-Kuwago-Request':'1','If-Match':'"1"'},body:'{}'})).status,serviceId);assert.equal(status,403);

  });

  await check('independent reviewer validates and approves exact saved revision',async()=>{

    await login(page,'reviewer');await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();await page.getByRole('button',{name:'Aprobar uso',exact:true}).first().waitFor();for(let index=0;index<2;index++){await page.getByRole('button',{name:'Aprobar uso',exact:true}).first().click();const response=page.waitForResponse(r=>r.url().includes('/approve')&&r.request().method()==='POST');await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();assert.equal((await response).status(),200);}await page.getByRole('button',{name:'Validar requisitos',exact:true}).click();await page.getByText('Validación de contenido completada. Esto no otorga aprobación comercial.',{exact:true}).first().waitFor();await confirmAction('Aprobar comercialmente');await page.getByText('Aprobación comercial registrada para esta revisión.',{exact:true}).first().waitFor();

  });

  await check('publication is synchronized and delivered by real public Worker',async()=>{

    await confirmAction('Publicar servicio');await page.getByText('Publicado y sincronizado en el catálogo local.',{exact:true}).first().waitFor();const result=await context.request.get('http://127.0.0.1:8794/v1/catalog');assert.equal(result.status(),200);const body=await result.json();assert.equal(body.services[0].id,serviceId);assert.ok(!JSON.stringify(body).includes('internalNotes'));const image=await context.request.get('http://127.0.0.1:8794'+body.services[0].media[0].url);assert.equal(image.status(),200);assert.equal(image.headers()['content-type'],'image/png');

  });

  await check('revision history and visual preview',async()=>{await page.getByRole('button',{name:'Revisiones',exact:true}).click();await page.getByRole('button',{name:'Revisar versión 1',exact:true}).click();await page.getByText('Revisión histórica · solo lectura · 1',{exact:true}).waitFor();await page.getByRole('button',{name:'Vista previa',exact:true}).click();});

  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(output,'desktop-light.png'),fullPage:true});

  await check('dark/mobile/language layout remains usable',async()=>{

    await page.getByRole('button',{name:/oscuro|dark/i}).first().click();await page.screenshot({path:resolve(output,'desktop-dark.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'mobile-dark.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'English',exact:true}).click();await page.getByRole('button',{name:'Unpublish service',exact:true}).waitFor();await page.getByRole('button',{name:'Español',exact:true}).click();await page.getByRole('button',{name:/claro|light/i}).first().click();await page.screenshot({path:resolve(output,'mobile-light.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});

  });

  await check('withdrawal removes service from public catalog',async()=>{await confirmAction('Despublicar servicio');await page.getByText('Retirada confirmada y sincronizada.',{exact:true}).first().waitFor();const result=await context.request.get('http://127.0.0.1:8794/v1/services/'+serviceId);assert.equal(result.status(),404);});

  await check('two editors conflict without losing the unsaved form',async()=>{

    await login(page,'editor');const secondContext=await browser.newContext();const second=await secondContext.newPage();await second.goto('http://127.0.0.1:5185/#services/'+serviceId+'/edit');await second.waitForLoadState('networkidle');await login(second,'editor2');await second.getByLabel('Descripción · Español').fill('Cambio guardado por segundo editor');await page.getByLabel('Descripción · Español').fill('Cambio propio sin perder');await second.getByRole('button',{name:'Guardar borrador',exact:true}).click();await second.getByText('Guardado en D1 local · pendiente de aprobación',{exact:true}).first().waitFor();await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('alert').filter({hasText:'Conflicto:'}).waitFor();assert.equal(await page.getByLabel('Descripción · Español').inputValue(),'Cambio propio sin perder');await secondContext.close();

    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Recargar desde servidor',exact:true}).first().click();await page.getByLabel('Descripción · Español').filter({visible:true}).waitFor();

  });

  await check('API outage shows error without demo fallback or lost input',async()=>{

    await page.getByLabel('Descripción · Inglés').fill('Preserved during outage');await control('api-down',{value:true});await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('alert').filter({hasText:'API no disponible'}).waitFor();assert.equal(await page.getByLabel('Descripción · Inglés').inputValue(),'Preserved during outage');assert.equal(await page.getByText('Wellness',{exact:true}).count(),0);await control('api-down',{value:false});await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByText('Guardado en D1 local · pendiente de aprobación',{exact:true}).first().waitFor();

  });

  await check('202 pending is not shown as completed, and public barrier rejects stale content',async()=>{

    await login(page,'reviewer');await confirmAction('Aprobar comercialmente');await page.getByText('Aprobación comercial registrada para esta revisión.',{exact:true}).first().waitFor();await control('r2-down',{value:true});await confirmAction('Publicar servicio');await page.getByText('Publicación pendiente · la sincronización NO ha terminado.',{exact:true}).first().waitFor();assert.equal((await context.request.get('http://127.0.0.1:8794/v1/catalog')).status(),503);await control('r2-down',{value:false});await control('reconcile');await page.getByRole('button',{name:'Reconciliar ahora',exact:true}).click();await page.getByText('Publicado y sincronizado en el catálogo local.',{exact:true}).first().waitFor();

  });

  await check('invalid JWT and expired JWT are rejected by the real verifier',async()=>{

    for(const mode of ['invalid','expired']){await control('token-mode',{value:mode});await page.getByRole('button',{name:'Recargar desde servidor',exact:true}).first().click();await page.getByRole('alert').filter({hasText:'Sesión ausente o expirada'}).first().waitFor();await control('token-mode',{value:'normal'});await login(page,'reviewer');}

  });

  await check('disabled identity is rejected at test authentication',async()=>{const disabled=await browser.newContext();const p=await disabled.newPage();await p.goto('http://127.0.0.1:5185/#services');await p.waitForLoadState('networkidle');await login(p,'disabled');await p.getByRole('alert').filter({hasText:'Acceso denegado'}).waitFor();await disabled.close();});

  await check('incomplete ES/EN cannot obtain commercial approval',async()=>{

    await page.getByRole('link',{name:'Volver a servicios',exact:true}).click();await page.getByRole('link',{name:'Nuevo servicio',exact:true}).click();await page.getByLabel('Nombre · Español',{exact:true}).fill('Incompleto');await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.waitForURL(/services\/[a-f0-9-]+\/edit/);await page.getByText('Guardado en D1 local · pendiente de aprobación',{exact:true}).first().waitFor();await page.getByRole('button',{name:'Validar requisitos',exact:true}).click();await page.getByRole('alert').filter({hasText:'no cumple los requisitos'}).waitFor();

  });

  assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));const storage=await page.evaluate(()=>Object.keys(localStorage));assert.ok(storage.every(k=>['kuwago-admin-theme','kuwago-admin-language'].includes(k)));

  const report={passed:checks.length,checks,screenshots:['desktop-light.png','desktop-dark.png','mobile-light.png','mobile-dark.png'],consoleErrors};writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

}catch(error){if(page)await page.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});console.error(JSON.stringify({currentCheck,consoleErrors,error:String(error)}));process.exitCode=1;}

finally{if(browser)await browser.close();if(vite)vite.kill();if(harness.exitCode===null){harness.stdin.end('{"action":"shutdown"}\n');await new Promise(resolve=>harness.once('exit',resolve));}}







