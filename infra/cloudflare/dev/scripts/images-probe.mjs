import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import sharp from 'sharp';
import {syntheticCorpus} from './images-probe-corpus.mjs';
import {rasterMetrics} from './image-fidelity.mjs';
const directory=fileURLToPath(new URL('../',import.meta.url)),output=resolve(directory,'.wrangler/images-probe');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function probeConfig(mode='offline',accountId){
  if(!['offline','remote'].includes(mode)||mode==='remote'&&!/^[a-f0-9]{32}$/.test(accountId??''))throw Error('invalid_probe_mode_or_account');
  return {name:'kuwago-images-isolated-probe',main:'entry.js',compatibility_date:'2026-07-30',workers_dev:false,preview_urls:false,routes:[],send_metrics:false,observability:{enabled:false},dev:{ip:'127.0.0.1',port:8798,local_protocol:'http'},images:{binding:'IMAGES',remote:mode==='remote'},vars:{PROBE_MODE:mode,...(mode==='remote'?{PROBE_APPROVED:'explicit-images-test'}:{})},...(mode==='remote'?{account_id:accountId}:{})};
}
export function assertProbeConfig(config){
  const expected=probeConfig(config?.vars?.PROBE_MODE,config?.account_id);
  if(JSON.stringify(config)!==JSON.stringify(expected))throw Error('probe_configuration_not_isolated');
}
export function commandMode(args){
  if(args.length===1&&['prepare','offline'].includes(args[0]))return {mode:args[0]};
  if(args.length===4&&args[0]==='remote'&&args[1]==='--authorize-images-usage'&&args[2]==='--confirm-account-plan'&&/^--account-id=[a-f0-9]{32}$/.test(args[3]))return {mode:'remote',accountId:args[3].slice(13)};
  throw Error('Explicit human authorization and verified account plan required; only prepare/offline allowed by default');
}
export async function prepareProbe(){
  mkdirSync(output,{recursive:true});const corpus=await syntheticCorpus();
  await build({entryPoints:[resolve(directory,'probe/entry.ts')],outfile:resolve(output,'entry.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',define:{__PROBE_CORPUS__:JSON.stringify(corpus)},logLevel:'silent'});
  const config=probeConfig();assertProbeConfig(config);writeFileSync(resolve(output,'wrangler.offline.json'),JSON.stringify(config,null,2));
  const manifest={phase:'2B.7',state:'prepared_only',remoteExecuted:false,maxRequests:32,maxConcurrency:3,cases:corpus.map(({base64,...row})=>({...row,inputBytes:Buffer.from(base64,'base64').length,inputSha256:digest(Buffer.from(base64,'base64'))}))};
  writeFileSync(resolve(output,'preparation.json'),JSON.stringify(manifest,null,2));return corpus;
}
export async function exerciseProbe(fetcher,corpus,mode){
  const results=[];let abortReason=null;
  async function run(item,parallel=false){
    const start=performance.now();let result={caseId:item.id,parallel,evidence:mode,scope:item.output==='png'?'png_contract':'exploratory_codec_only_not_production_approval'};
    try{
      const response=await fetcher(new Request('http://127.0.0.1:8798/case',{method:'POST',headers:{'Content-Type':'application/json','X-Kuwago-Probe':'synthetic-v1'},body:JSON.stringify({caseId:item.id}),signal:AbortSignal.timeout(45000)}));
      result.status=response.status;result.ms=Math.round((performance.now()-start)*100)/100;
      if(item.expectedStatus==='rejected'){
        result.pass=response.status>=400&&response.status!==429;result.expected='rejected';
        if(response.status>=400){try{const value=await response.json();if(typeof value.error==='string'&&/^[a-z_]+$/.test(value.error))result.errorCode=value.error;}catch{/* Do not retain upstream diagnostics. */}}
        result.conclusion=response.status===503?'refused_retryable_not_proof_of_strict_decoder':result.pass?'refused':'unexpected_acceptance';
      }
      else if(response.ok){
        const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2097152)throw Error('output_limit');const metadata=await sharp(bytes).metadata();
        const source=Buffer.from(item.base64,'base64'),reference=await sharp(source).rotate().removeAlpha().raw().toBuffer({resolveWithObject:true}),actual=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
        const dimensions=metadata.width===item.width&&metadata.height===item.height&&actual.info.width===reference.info.width&&actual.info.height===reference.info.height;
        const rawMetrics=dimensions?rasterMetrics(actual,reference):null,pixelDelta=rawMetrics?.cornerMaxDelta??null;
        const noMetadata=!metadata.exif&&!metadata.icc&&!metadata.xmp&&!bytes.includes(Buffer.from('SYNTHETIC_PRIVATE_METADATA'));
        result={...result,outputFormat:metadata.format,width:metadata.width,height:metadata.height,outputBytes:bytes.length,outputSha256:digest(bytes),noMetadata,pixelCornerMaxDelta:pixelDelta,rawSourceMetrics:rawMetrics,legacyRawPixelPass:pixelDelta!==null&&pixelDelta<=20};
        let fidelityPass=result.legacyRawPixelPass;
        if(item.output==='jpeg'){
          const quality=mode==='offline'?80:90;
          const expectedJpeg=await sharp(source).rotate().jpeg({quality,chromaSubsampling:'4:2:0'}).toBuffer(),encodedReference=await sharp(expectedJpeg).removeAlpha().raw().toBuffer({resolveWithObject:true});
          const profileMetrics=rasterMetrics(actual,encodedReference);
          result={...result,scope:'exploratory_codec_only_not_production_approval',fidelityProfile:`jpeg-q${quality}-420/${mode}`,requestedQuality:90,qualityHonoredBySimulator:mode==='offline'?false:null,encodedReferenceMetrics:profileMetrics};
          // Tighter, full-raster comparison against an equivalent lossy encoding;
          // preserve the original raw-source failure in legacyRawPixelPass above.
          fidelityPass=profileMetrics!==null&&profileMetrics.maxDelta<=3;
        }
        result.pass=dimensions&&metadata.format===item.output&&noMetadata&&fidelityPass&&(item.output!=='png'||response.headers.get('X-Image-Hash')===digest(bytes));
      }else result.pass=false;
    }catch{result={...result,pass:false,error:'request_or_validation_failed',ms:Math.round((performance.now()-start)*100)/100};}
    results.push(result);
  }
  for(const item of corpus){await run(item);if(mode==='remote'&&!results.at(-1).pass){abortReason='first_conformance_or_service_failure';break;}}
  if(!abortReason)await Promise.all(corpus.filter(c=>c.id.startsWith('valid-')).map(item=>run(item,true)));
  const elapsed=results.map(r=>r.ms).sort((a,b)=>a-b),percentile=p=>elapsed[Math.min(elapsed.length-1,Math.ceil(elapsed.length*p)-1)]??null;
  const transformed=results.filter(r=>r.status===200&&r.expected!=='rejected').map(r=>r.ms).sort((a,b)=>a-b),transformPercentile=p=>transformed[Math.min(transformed.length-1,Math.ceil(transformed.length*p)-1)]??null;
  const summarize=rows=>({requests:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length});
  return {phase:'2B.7A',conformanceProfile:'png-v2/jpeg-equivalent-encoding-v1',mode,remoteExecuted:mode==='remote',abortReason,requests:results.length,maxConcurrency:3,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,contract:summarize(results.filter(r=>r.scope==='png_contract')),exploratory:{...summarize(results.filter(r=>r.scope!=='png_contract')),productionApproved:false},legacyRawProfileFailures:results.filter(r=>r.legacyRawPixelPass===false).length,latencyMs:{p50:percentile(.5),p95:percentile(.95),note:'time to response headers at local coordinator; includes preflight refusals; not Worker CPU or provider-only latency'},transformResponseLatencyMs:{samples:transformed.length,p50:transformPercentile(.5),p95:transformPercentile(.95)},billing:{observedAmount:null,invoiceVerified:false,transformationUpperBound:results.length,note:'requests are not invoice units; info, preflight rejections and monthly deduplication differ'},results};
}
async function portAvailable(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8798,'127.0.0.1',resolve);});await new Promise(resolve=>server.close(resolve));}
async function remoteFetcher(config){
  // Called only AFTER commandMode's explicit authorization and account-plan attestations.
  assertProbeConfig(config);
  const identity=spawnSync(process.execPath,[resolve(directory,'node_modules/wrangler/bin/wrangler.js'),'whoami','--json','--cwd',output],{env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},encoding:'utf8',timeout:30000,maxBuffer:1048576});
  let account;try{account=JSON.parse(identity.stdout);}catch{/* Existing authentication could not be verified. */}
  if(identity.status!==0||account?.loggedIn!==true||!account?.accounts?.some(row=>row.id===config.account_id))throw Error('existing_session_for_verified_account_required');
  await portAvailable();const path=resolve(output,'wrangler.authorized-remote.json');writeFileSync(path,JSON.stringify(config,null,2));
  const child=spawn(process.execPath,[resolve(directory,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',path],{cwd:output,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},stdio:'ignore'});
  try{
    for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('remote_binding_start_failed');try{const response=await fetch('http://127.0.0.1:8798/health');const data=await response.json();if(data.mode==='remote'&&data.used===0)return {fetcher:request=>fetch(request),close:()=>{child.kill();}};}catch{/* Health check never calls Images. */}await new Promise(resolve=>setTimeout(resolve,250));}
    throw Error('remote_binding_start_timeout');
  }catch(error){child.kill();throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const selected=commandMode(process.argv.slice(2));const corpus=await prepareProbe();
  if(selected.mode==='prepare'){console.log(JSON.stringify({state:'prepared_only',remoteExecuted:false,cases:corpus.length,maxRequests:32,report:'.wrangler/images-probe/preparation.json'}));}
  else{
    let mf,session;
    try{
      let fetcher;
      if(selected.mode==='offline'){
        mf=new Miniflare(convertV4MiniflareOptions({name:'kuwago-images-isolated-probe',script:readFileSync(resolve(output,'entry.js'),'utf8'),modules:true,compatibilityDate:'2026-07-30',host:'127.0.0.1',cf:false,telemetry:{enabled:false},images:{binding:'IMAGES'},bindings:{PROBE_MODE:'offline'},outboundService:async()=>{throw Error('external_network_forbidden');}}));
        const worker=await mf.getWorker();fetcher=request=>worker.fetch(request);
      }else{session=await remoteFetcher(probeConfig('remote',selected.accountId));fetcher=session.fetcher;}
      const report=await exerciseProbe(fetcher,corpus,selected.mode);writeFileSync(resolve(output,selected.mode+'-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({mode:report.mode,remoteExecuted:report.remoteExecuted,requests:report.requests,passed:report.passed,failed:report.failed,latencyMs:report.latencyMs}));if(report.failed)process.exitCode=1;
    }finally{session?.close();await mf?.dispose();}
  }
}
