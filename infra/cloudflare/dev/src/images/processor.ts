import {ApiFailure} from '../catalog/errors.js';
import {imageMime,inspectImage,sanitizePng,readImage,validatePngData,normalizationPolicy,type ImageHeader} from './policy.js';
// Narrow structural subset of the official workerd Images interface; no Node/native APIs.
export interface ImagesBinding {
  info(stream:ReadableStream<Uint8Array>):Promise<{format:string;width?:number;height?:number;fileSize?:number}>;
  input(stream:ReadableStream<Uint8Array>):{output(options:{format:'image/png';anim:false}):Promise<{response():Response}>};
}
export type ImageProcessor={process(bytes:ArrayBuffer,declared:string):Promise<{output:ArrayBuffer;width:number;height:number;hash:string;policy:typeof normalizationPolicy;processor:'cloudflare-images-v1'|'local-sharp-v1'}>};
export {inspectImage,sanitizePng,validatePngData,normalizationPolicy,crc32} from './policy.js';
export type ProcessorEnvironment={
  IMAGES?:ImagesBinding;
  IMAGE_NORMALIZER?:{fetch(request:Request):Promise<Response>};
  IMAGE_PROCESSOR?:string;
  IMAGE_POLICY_VERIFIED?:string;
  EXECUTION_MODE?:string;
};
export async function imageDigest(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
const stream=(bytes:ArrayBuffer)=>new Response(bytes).body!;
async function deadline<T>(task:Promise<T>,milliseconds=30000):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ApiFailure(503,'decoder_timeout')),milliseconds);})]);}finally{clearTimeout(timer);}
}
function matchingInfo(info:Awaited<ReturnType<ImagesBinding['info']>>,source:ImageHeader,bytes:ArrayBuffer){
  const mime=info.format.startsWith('image/')?info.format:'image/'+info.format;
  // Some backends report oriented axes. Either representation must match the parsed source.
  if(mime!==source.mime||info.fileSize!==bytes.byteLength||!(info.width===source.width&&info.height===source.height||source.orientation>=5&&info.width===source.height&&info.height===source.width))throw new ApiFailure(503,'decoder_info_mismatch');
}
async function checkedOutput(response:Response,source:ImageHeader){
  try{const bytes=await readImage(response.body);await validatePngData(bytes);return sanitizePng(bytes,source);}catch(error){
    if(error instanceof ApiFailure&&error.code==='decoder_orientation_mismatch')throw error;
    throw new ApiFailure(503,'decoder_invalid_response');
  }
}
export function cloudflareImagesProcessor(binding:ImagesBinding,timeoutMs=30000):ImageProcessor{
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new ApiFailure(503,'invalid_processor_timeout');
  return {async process(bytes,declared){
    const source=inspectImage(bytes,declared);
    return deadline((async()=>{
      try{
        if(source.mime==='image/png')await validatePngData(bytes);
        matchingInfo(await binding.info(stream(bytes)),source,bytes);
        // No URL fetch, format auto, resizing, preserve-metadata or fallback to original.
        const result=await binding.input(stream(bytes)).output({format:'image/png',anim:false}),response=result.response();
        if(!response.ok||!response.headers.get('Content-Type')?.startsWith('image/png'))throw new ApiFailure(503,'decoder_invalid_response');
        const sanitized=await checkedOutput(response,source);
        matchingInfo(await binding.info(stream(sanitized.output)),{mime:'image/png',width:sanitized.width,height:sanitized.height,orientation:1},sanitized.output);
        return {...sanitized,hash:await imageDigest(sanitized.output),policy:normalizationPolicy,processor:'cloudflare-images-v1'};
      }catch(error){if(error instanceof ApiFailure)throw error;throw new ApiFailure(503,'image_processor_unavailable');}
    })(),timeoutMs);
  }};
}
export async function processImage(env:ProcessorEnvironment,bytes:ArrayBuffer){
  const declared=imageMime(bytes);if(!declared)throw new ApiFailure(422,'mime_content_mismatch');
  const mode=env.IMAGE_PROCESSOR??(env.IMAGE_NORMALIZER?'local-sharp-v1':undefined);
  if(mode==='cloudflare-images-v1'){
    // Deployment/operator gate, never accepted from an HTTP request. Default stays quarantined.
    if(env.IMAGE_POLICY_VERIFIED!==normalizationPolicy)throw new ApiFailure(503,'image_policy_not_verified');
    if(!env.IMAGES)throw new ApiFailure(503,'image_processor_unavailable');
    return cloudflareImagesProcessor(env.IMAGES).process(bytes,declared);
  }
  if(mode!==undefined&&mode!=='local-sharp-v1')throw new ApiFailure(503,'image_processor_unavailable');
  if(!env.IMAGE_NORMALIZER)return null;
  if(env.EXECUTION_MODE!=='local-only')throw new ApiFailure(503,'local_image_processor_forbidden');
  const source=inspectImage(bytes,declared);
  return deadline((async()=>{
    if(source.mime==='image/png')await validatePngData(bytes);
    const response=await env.IMAGE_NORMALIZER!.fetch(new Request('https://image-normalizer.internal/',{method:'POST',body:bytes,signal:AbortSignal.timeout(30000)}));
    if([400,415,422].includes(response.status))throw new ApiFailure(422,'corrupt_or_unsupported_image');
    if(!response.ok)throw new ApiFailure(503,'image_processor_unavailable');
    if(response.headers.get('X-Image-Normalized')!=='1')throw new ApiFailure(503,'decoder_invalid_response');
    const sanitized=await checkedOutput(response,source);
    if(Number(response.headers.get('X-Image-Width'))!==sanitized.width||Number(response.headers.get('X-Image-Height'))!==sanitized.height)throw new ApiFailure(503,'decoder_invalid_response');
    return {...sanitized,hash:await imageDigest(sanitized.output),policy:normalizationPolicy,processor:'local-sharp-v1' as const};
  })());
}
