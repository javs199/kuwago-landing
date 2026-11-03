// Phase 2B.7C only. Never invokes the multi-case remote runner.
import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {build} from 'esbuild';
import sharp from 'sharp';
import {probeConfig,assertProbeConfig} from './images-probe.mjs';
const directory=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(directory,'.wrangler/images-single-probe');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepareSingle(){
  mkdirSync(output,{recursive:true});
  const raw=Buffer.alloc(24*16*3);
  for(let y=0;y<16;y++)for(let x=0;x<24;x++)for(let c=0;c<3;c++)raw[(y*24+x)*3+c]=(y<8?(x<12?[220,20,20]:[20,220,20]):(x<12?[20,20,220]:[220,220,20]))[c];
  const png=await sharp(raw,{raw:{width:24,height:16,channels:3}}).png().toBuffer();
  writeFileSync(resolve(output,'input.png'),png);
  await build({entryPoints:[resolve(directory,'probe/single-entry.ts')],outfile:resolve(output,'entry.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',define:{__SINGLE_PNG__:JSON.stringify(png.toString('base64'))},logLevel:'silent'});
  const metadata={synthetic:true,format:'png',width:24,height:16,bytes:png.length,sha256:hash(png)};
  writeFileSync(resolve(output,'input.json'),JSON.stringify(metadata,null,2));return metadata;
}
async function portAvailable(){const server=createServer();await new Promise((ok,fail)=>{server.once('error',fail);server.listen(8798,'127.0.0.1',ok);});await new Promise(ok=>server.close(ok));}
async function executeSingle(){
  if(existsSync(resolve(output,'attempt.lock')))throw Error('phase_2b7c_already_attempted_no_retry');
  const input=await prepareSingle();
  const cli=resolve(directory,'node_modules/wrangler/bin/wrangler.js');
  const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'};
  const who=spawnSync(process.execPath,[cli,'whoami','--json','--cwd',output],{env,encoding:'utf8',timeout:30000,maxBuffer:1048576});
  let identity;try{identity=JSON.parse(who.stdout);}catch{/* Fail closed. */}
  if(who.status!==0||identity?.loggedIn!==true||identity?.accounts?.length!==1)throw Error('single_existing_authenticated_account_required');
  const account=identity.accounts[0];
  const config=probeConfig('remote',account.id);assertProbeConfig(config);
  await portAvailable();
  writeFileSync(resolve(output,'wrangler.json'),JSON.stringify(config,null,2));
  // Exclusive journal survives coordinator/Worker restarts. Never delete to retry this phase.
  writeFileSync(resolve(output,'attempt.lock'),JSON.stringify({phase:'2B.7C',at:new Date().toISOString(),maxTransforms:1,maxUsd:1}),{flag:'wx'});
  const report={phase:'2B.7C',started:new Date().toISOString(),input,account:{existingSession:true,accessibleAccounts:1},maxUsd:1,postRequests:0,remoteEvidence:null,classification:'BLOQUEADO POR CONFIGURACIÓN',observedUsd:null,invoiceVerified:false};
  let child;
  try{
    child=spawn(process.execPath,[cli,'dev','--config',resolve(output,'wrangler.json')],{cwd:output,env,stdio:['ignore','pipe','pipe']});
    const diagnostics=new Set();
    const observe=chunk=>{
      const text=String(chunk);
      for(const [pattern,flag] of [[/authentication|unauthorized|permission|forbidden/i,'authentication_or_permission'],[/subscription|subscribe|upgrade|entitlement/i,'subscription_or_entitlement'],[/remote bindings.*ready|ready on http/i,'server_ready'],[/\bERROR\b/,'wrangler_error']])if(pattern.test(text))diagnostics.add(flag);
      for(const code of text.matchAll(/\bcode:\s*(\d{3,6})\b/g))diagnostics.add('cloudflare_code_'+code[1]);
    };
    child.stdout.on('data',observe);child.stderr.on('data',observe);
    report.startupSignals=[];
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)break;
      try{const r=await fetch('http://127.0.0.1:8798/health',{signal:AbortSignal.timeout(500)});const data=await r.json();if(data.mode==='remote'&&data.maxTransforms===1&&!data.claimed){ready=true;break;}}catch{/* Read-only readiness, never calls Images. */}
      await new Promise(ok=>setTimeout(ok,250));
    }
    report.startupSignals=[...diagnostics];
    if(!ready)throw Error('remote_binding_start_failed_no_transform_requested');
    report.postRequests=1;const start=performance.now();
    // Exactly one HTTP attempt. No redirects, retries, fallback or parallel calls.
    const response=await fetch('http://127.0.0.1:8798/case',{method:'POST',redirect:'error',headers:{'X-Kuwago-Probe':'single-png-v1'},signal:AbortSignal.timeout(45000)});
    report.status=response.status;report.latencyMs=Math.round(performance.now()-start);
    if(response.ok){
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>2097152)throw Error('output_limit');
      writeFileSync(resolve(output,'output.png'),bytes);
      const meta=await sharp(bytes).metadata();
      const a=await sharp(bytes).removeAlpha().raw().toBuffer(),b=await sharp(resolve(output,'input.png')).removeAlpha().raw().toBuffer();
      const valid=meta.format==='png'&&meta.width===24&&meta.height===16&&!meta.exif&&!meta.icc&&!meta.xmp&&a.equals(b)&&hash(bytes)===response.headers.get('X-Image-Hash');
      report.result={bytes:bytes.length,sha256:hash(bytes),format:meta.format,width:meta.width,height:meta.height,noMetadata:!meta.exif&&!meta.icc&&!meta.xmp,pixelsIdentical:a.equals(b),validation:valid};
      report.classification=valid?'APROBADO':'FALLA DE COMPATIBILIDAD';
    }else{
      try{const value=await response.json();report.remoteEvidence=value;}catch{/* Never log raw upstream content. */}
      report.classification=['9422'].includes(report.remoteEvidence?.upstreamCode)?'BLOQUEADO POR ENTITLEMENT':'BLOQUEADO POR CONFIGURACIÓN';
    }
    try{const r=await fetch('http://127.0.0.1:8798/health',{signal:AbortSignal.timeout(1000)});report.remoteEvidence=await r.json();}catch{report.evidenceReadFailed=true;}
    if(report.classification==='APROBADO'&&!(report.remoteEvidence?.transformAttempts===1&&report.remoteEvidence?.transformCompleted===1&&report.remoteEvidence?.validated===true))report.classification='BLOQUEADO POR CONFIGURACIÓN';
  }catch(error){report.error=/^[a-z_]+$/.test(error.message)?error.message:'single_request_or_connection_failed';}
  finally{
    if(child&&child.exitCode===null){
      if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',timeout:5000});
      else child.kill();
      await Promise.race([new Promise(ok=>child.once('exit',ok)),new Promise(ok=>setTimeout(ok,1000))]);
    }
    report.finished=new Date().toISOString();
    writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify(report));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='prepare')console.log(JSON.stringify(await prepareSingle()));
  else if(args.join(' ')==='remote-once --authorize-one-png --max-usd=1')await executeSingle();
  else throw Error('only_prepare_or_explicit_authorized_single_png_allowed');
}
