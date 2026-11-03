import {cloudflareImagesProcessor,type ImagesBinding} from '../src/images/processor.js';

declare const __SINGLE_PNG__:string;
type Env={IMAGES:ImagesBinding;PROBE_MODE:'remote';PROBE_APPROVED:string};
const evidence={claimed:false,infoCalls:0,transformAttempts:0,transformCompleted:0,validated:false,error:null as string|null,upstreamCode:null as string|null};
function safeError(error:unknown){
  const row=error as {code?:unknown;message?:unknown};
  const message=typeof row?.message==='string'?row.message:'';
  const code=message.match(/\b(?:940[0-9]|941[0-9]|942[0-9]|540[0-9])\b/)?.[0];
  if(code)evidence.upstreamCode=code;
  return typeof row?.code==='string'&&/^[a-z_]{1,64}$/.test(row.code)?row.code:'images_operation_failed';
}
export default {
  async fetch(request:Request,env:Env){
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
    if(new URL(request.url).hostname!=='127.0.0.1')return json({error:'loopback_required'},403);
    if(env.PROBE_MODE!=='remote'||env.PROBE_APPROVED!=='explicit-images-test')return json({error:'unauthorized_probe'},403);
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&path==='/health')return json({mode:'remote',maxTransforms:1,...evidence});
    if(request.method!=='POST'||path!=='/case')return json({error:'not_found'},404);
    if(request.headers.get('X-Kuwago-Probe')!=='single-png-v1'||request.headers.get('Origin')||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'request_denied'},403);
    if(evidence.claimed)return json({error:'single_attempt_already_consumed'},409);
    // Consume the budget before any decoder call; failures do not restore it.
    evidence.claimed=true;
    const guarded:ImagesBinding={
      async info(stream){
        if(evidence.infoCalls>=2)throw Error('info_budget_exhausted');
        evidence.infoCalls++;
        try{return await env.IMAGES.info(stream);}catch(error){safeError(error);throw error;}
      },
      input(stream){return {async output(options){
        if(evidence.transformAttempts!==0||options.format!=='image/png'||options.anim!==false)throw Error('transform_budget_exhausted');
        evidence.transformAttempts++;
        try{const result=await env.IMAGES.input(stream).output(options);evidence.transformCompleted++;return result;}catch(error){safeError(error);throw error;}
      }};},
    };
    try{
      const bytes=Uint8Array.from(atob(__SINGLE_PNG__),c=>c.charCodeAt(0)).buffer;
      const result=await cloudflareImagesProcessor(guarded).process(bytes,'image/png');
      evidence.validated=true;
      return new Response(result.output,{headers:{...headers,'Content-Type':'image/png','X-Image-Hash':result.hash,'X-Image-Width':String(result.width),'X-Image-Height':String(result.height)}});
    }catch(error){evidence.error=safeError(error);return json({...evidence},503);}
  },
};
