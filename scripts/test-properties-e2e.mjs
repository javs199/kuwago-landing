/* global document, window, localStorage */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.KUWAGO_PLAYWRIGHT_MODULE)throw Error('Set KUWAGO_PLAYWRIGHT_MODULE to an existing Playwright index.mjs.');
const {chromium}=await import(pathToFileURL(resolve(process.env.KUWAGO_PLAYWRIGHT_MODULE)).href);
const output=resolve(root,'infra/cloudflare/dev/.wrangler/properties-e2e');mkdirSync(output,{recursive:true});
const processes=[];
function start(args,cwd,extra={}){const child=spawn(process.execPath,args,{cwd,env:{...process.env,...extra},stdio:['pipe','pipe','pipe']});processes.push(child);return child;}
const harness=start(['test/admin-harness.mjs','--provision-test-identities','--allow-test-reviewer'],resolve(root,'infra/cloudflare/dev'));
let diagnostics='';harness.stderr.on('data',b=>{diagnostics+=b;});
const messages=[],waiters=[];
createInterface({input:harness.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(!['ready','control','stopped'].includes(m.event))return;const w=waiters.shift();if(w)w(m);else messages.push(m);}catch{/* Only consume harness protocol. */}});
async function next(){if(messages.length)return messages.shift();let timer;try{return await Promise.race([new Promise(r=>waiters.push(r)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Harness timeout: '+diagnostics.slice(-500))),20000);})]);}finally{clearTimeout(timer);}}
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{/* listener not ready */}await new Promise(r=>setTimeout(r,100));}throw Error('Server not ready: '+url);}
let browser;
const checks=[];
try{
  const credentials=(await next()).credentials;
  start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5175','--strictPort'],resolve(root,'apps/admin'),{VITE_LOCAL_TEST_LOGIN:'true'});
  start(['scripts/serve.mjs'],root);
  await Promise.all([ready('http://127.0.0.1:5175'),ready('http://127.0.0.1:4173')]);
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5175/#properties');await page.waitForLoadState('networkidle');
  await page.getByLabel('Identidad local de prueba',{exact:true}).selectOption('reviewer');
  await page.getByLabel('Credencial de prueba de un solo uso').fill(credentials.reviewer.shift());
  await page.getByRole('button',{name:'Autenticar identidad de prueba',exact:true}).click();
  await page.getByText('Villa Maya',{exact:true}).waitFor();
  const row=page.getByRole('row').filter({hasText:'Villa Maya'});await row.getByRole('link',{name:'Abrir',exact:true}).click();
  await page.getByLabel('Orden',{exact:true}).fill('0');
  // Initial Carabao order is also 0; move it below Maya after publishing Maya.
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Cambios sin publicar',{exact:true}).waitFor();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Publicar',exact:true}).click();await page.getByText('Guardado',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Volver a propiedades'}).click();await page.getByRole('row').filter({hasText:'Carabao Villa'}).getByRole('link',{name:'Abrir',exact:true}).click();
  await page.getByLabel('Orden',{exact:true}).fill('1');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Cambios sin publicar',{exact:true}).waitFor();await page.getByRole('button',{name:'Publicar',exact:true}).click();await page.getByText('Guardado',{exact:true}).waitFor();
  checks.push('Admin 390 px: guardar y publicar orden de Villa Maya primero con JWT y D1 locales');
  for(const language of ['es','en'])for(const theme of ['light','dark']){
    await page.evaluate(({language,theme})=>{localStorage.setItem('kuwago-admin-language',language);localStorage.setItem('kuwago-admin-theme',theme);},{language,theme});await page.reload();await page.getByLabel('Slug',{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),language+' '+theme+' editor overflow');
    await page.screenshot({path:resolve(output,`admin-${language}-${theme}-390.png`),fullPage:true});
    await page.getByRole('link',{name:language==='es'?'Volver a propiedades':'Back to properties'}).click();await page.getByText('Villa Maya',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),language+' '+theme+' list overflow');
    await page.screenshot({path:resolve(output,`list-${language}-${theme}-390.png`),fullPage:true});
    await page.getByRole('row').filter({hasText:'Carabao Villa'}).getByRole('link',{name:language==='es'?'Abrir':'Open',exact:true}).click();await page.getByLabel('Slug',{exact:true}).waitFor();
  }
  checks.push('Lista y editor: ES/EN y claro/oscuro a 390 px sin desbordamiento horizontal');
  const landing=await context.newPage();
  await landing.route('**/assets/js/config.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('https://kuwago-catalog-public-development.ch-jesus-99.workers.dev','http://127.0.0.1:8794')});});
  await landing.goto('http://127.0.0.1:4173');await landing.waitForLoadState('networkidle');
  const visible=()=>landing.locator('#properties-grid [data-property-card]:visible');
  await landing.waitForFunction(()=>document.querySelector('#properties-grid [data-property-card]')?.getAttribute('data-property-card')==='villa-maya');
  assert.equal(await visible().first().getAttribute('data-property-card'),'villa-maya');checks.push('Landing real: Villa Maya primera tras publicar, usando API local y CORS');
  await landing.locator('#properties-grid').screenshot({path:resolve(output,'landing-published.png')});
  await page.getByLabel('Show on landing',{exact:true}).uncheck();await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Unpublished changes',{exact:true}).waitFor();await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByText('Saved',{exact:true}).waitFor();
  await landing.reload();await landing.waitForLoadState('networkidle');assert.equal(await visible().count(),3);assert.equal(await landing.locator('[data-property-card="carabao-villa"]').isVisible(),false);checks.push('show_on_landing=0 publicado oculta la tarjeta');
  harness.stdin.write(JSON.stringify({action:'api-down',value:true})+'\n');assert.equal((await next()).ok,true);
  await landing.reload();await landing.waitForLoadState('networkidle');assert.equal(await visible().count(),4);assert.equal(await visible().first().getAttribute('data-property-card'),'carabao-villa');checks.push('API caída: reaparecen las cuatro tarjetas estáticas en el orden original');
  await landing.locator('#properties-grid').screenshot({path:resolve(output,'landing-offline.png')});
  assert.deepEqual(errors,[]);
  const result={checks,consoleErrors:errors,localOnly:true};writeFileSync(resolve(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{
  await browser?.close();
  harness.stdin.write('{"action":"shutdown"}\n');
  for(const p of processes)if(p.exitCode===null)p.kill();
}
