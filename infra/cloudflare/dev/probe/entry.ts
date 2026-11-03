import {cloudflareImagesProcessor,type ImagesBinding} from '../src/images/processor.js';
type Case={id:string;mime:string;base64:string;expectedStatus:'ok'|'rejected';output:'png'|'jpeg'|'webp';width?:number;height?:number};
declare const __PROBE_CORPUS__:Case[];
type Env={IMAGES:ImagesBinding;PROBE_MODE:'offline'|'remote';PROBE_APPROVED?:string};
let used=0,inFlight=0;
export default {
  async fetch(request:Request,env:Env){
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
    const reply=(error:string,status:number)=>Response.json({error},{status,headers});
    const url=new URL(request.url);
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return reply('loopback_required',403);
    if(url.pathname==='/health'&&request.method==='GET')return Response.json({mode:env.PROBE_MODE,used,maxRequests:32,concurrency:3},{headers});
    if(url.pathname!=='/case'||request.method!=='POST')return reply('not_found',404);
    if(request.headers.get('X-Kuwago-Probe')!=='synthetic-v1'||request.headers.get('Origin')||['cross-site','same-site'].includes(request.headers.get('Sec-Fetch-Site')??'')||request.headers.get('Content-Type')!=='application/json')return reply('probe_request_denied',403);
    if(env.PROBE_MODE!=='offline'&&!(env.PROBE_MODE==='remote'&&env.PROBE_APPROVED==='explicit-images-test'))return reply('remote_not_authorized',403);
    const length=Number(request.headers.get('Content-Length'));if(length>256)return reply('invalid_case',422);
    let input:unknown;try{const reader=request.body?.getReader();if(!reader)return reply('invalid_case',422);let size=0;const buffer=new Uint8Array(256);try{while(true){const item=await reader.read();if(item.done)break;if(size+item.value.length>256)return reply('invalid_case',422);buffer.set(item.value,size);size+=item.value.length;}input=JSON.parse(new TextDecoder().decode(buffer.subarray(0,size)));}finally{await reader.cancel().catch(()=>undefined);}}catch{return reply('invalid_case',422);}
    if(!input||typeof input!=='object'||Object.keys(input).join()!=='caseId')return reply('invalid_case',422);
    const item=__PROBE_CORPUS__.find(row=>row.id===(input as {caseId:unknown}).caseId);if(!item)return reply('unknown_case',422);
    if(used>=32||inFlight>=3)return reply('probe_budget_exhausted',429);
    used++;inFlight++;
    try{
      const binary=atob(item.base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)).buffer;
      if(item.output!=='png'){
        // Capability-only probe: these outputs never enter the administrative pipeline.
        const binding=env.IMAGES as unknown as {input(stream:ReadableStream<Uint8Array>):{output(options:{format:string;anim:false;quality?:number}):Promise<{response():Response}>}};
        const output=await binding.input(new Response(bytes).body!).output({format:'image/'+item.output,anim:false,...(item.output==='jpeg'?{quality:90}:{})});const response=output.response();
        return new Response(response.body,{status:response.status,headers:{...headers,'Content-Type':'image/'+item.output,'X-Probe-Mode':env.PROBE_MODE,...(item.output==='jpeg'?{'X-Probe-Jpeg-Quality':'90'}:{})}});
      }
      const value=await cloudflareImagesProcessor(env.IMAGES).process(bytes,item.mime);
      return new Response(value.output,{headers:{...headers,'Content-Type':'image/png','X-Probe-Mode':env.PROBE_MODE,'X-Image-Hash':value.hash,'X-Image-Width':String(value.width),'X-Image-Height':String(value.height)}});
    }catch(error){
      const row=error as {status?:number;code?:string};return reply(typeof row.code==='string'&&/^[a-z_]+$/.test(row.code)?row.code:'processor_failed',row.status&&row.status>=400&&row.status<=599?row.status:503);
    }finally{inFlight--;}
  },
};
