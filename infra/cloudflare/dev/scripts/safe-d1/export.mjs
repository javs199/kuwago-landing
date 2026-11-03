import {requireSafe} from './policy.mjs';
export const maximumExportBytes=16000000;
export const isBookmark=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{32}$/.test(value);
export function createExporter(apiRequest,downloadFetch){
 return Object.freeze({async fullExport(expectedBookmark){
  requireSafe(isBookmark(expectedBookmark),'export_bookmark_missing');let current;
  for(let poll=0;poll<12;poll++){
   const result=await apiRequest('/export',{output_format:'polling',dump_options:{no_data:false,no_schema:false,tables:[]},...(current?{current_bookmark:current}:{})});
   requireSafe(result?.success===true&&result.type==='export'&&result.status!=='error'&&result.at_bookmark===expectedBookmark,'export_failed_or_bookmark_changed');
   if(result.status==='complete'){
    let url;try{url=new URL(result.result?.signed_url);}catch{throw Error('export_download_invalid');}
    requireSafe(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&/^[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/.test(url.hostname),'export_download_origin_forbidden');
    // The signed URL is a secret capability. Never log/persist it or send API authorization to it.
    let response;try{response=await downloadFetch(url.href,{method:'GET',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(20000)});}catch{throw Error('export_download_interrupted');}
    requireSafe(response.ok&&response.body,'export_download_failed');const length=response.headers.get('content-length');if(length)requireSafe(/^\d+$/.test(length)&&Number(length)<=maximumExportBytes,'export_size_limit');
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireSafe(size<=maximumExportBytes,'export_size_limit');parts.push(Buffer.from(part.value));}}catch{throw Error('export_download_invalid');}finally{await reader.cancel().catch(()=>{});}
    requireSafe(size>0&&(!length||size===Number(length)),'export_truncated');return {bytes:Buffer.concat(parts),bookmark:expectedBookmark};
   }
   requireSafe(result.status===undefined||result.status==='active','export_status_invalid');current=result.at_bookmark;
   // Polling an existing export job is not retrying a migration. Never restart a failed job.
   if(poll<11)await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('export_poll_limit');
 }});
}
