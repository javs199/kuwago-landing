// Phase 2C.4: fixed-account, fixed-database metadata + SELECT only. No Wrangler/OAuth fallback.
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const expectedAccount='7a8bcd7992a3de359d2aff87df2fb693';
export const expectedDatabase='c5cfbe44-4fd0-4c2a-83c1-b833935534ba';
export const schemaSql="SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name";
const directory=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(directory,'.wrangler/phase2c4');
function codes(value){return Array.isArray(value?.errors)?value.errors.map(e=>e?.code).filter(c=>Number.isSafeInteger(c)).slice(0,8):[];}
async function boundedJson(response){
  if(!response.body)throw Error('invalid_response');const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)throw Error('response_limit');chunks.push(part.value);}}
  finally{await reader.cancel().catch(()=>undefined);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function diagnoseReadOnly(environment,fetcher=fetch,beforeRequest=()=>{}){
  const report={phase:'2C.4',started:new Date().toISOString(),status:'preflight_failed',requests:[],metadata:null,schema:null,credentialCleared:false};
  let token=environment.CLOUDFLARE_API_TOKEN;const headers=new Headers();
  try{
    if(environment.CLOUDFLARE_ACCOUNT_ID!==expectedAccount||environment.KUWAGO_D1_DATABASE_ID!==expectedDatabase||typeof token!=='string'||!/^[-_A-Za-z0-9]{20,256}$/.test(token))return report;
    // Remove the environment copy before I/O; the authorization value stays only in request memory.
    delete environment.CLOUDFLARE_API_TOKEN;headers.set('Authorization','Bearer '+token);headers.set('Accept','application/json');
    const base=`https://api.cloudflare.com/client/v4/accounts/${expectedAccount}/d1/database/${expectedDatabase}`;
    const read=async(kind,method,url,body)=>{
      beforeRequest();const item={kind,method,httpStatus:null,codes:[],description:'No response'};report.requests.push(item);
      let response;
      try{response=await fetcher(url,{method,headers:new Headers(headers),redirect:'manual',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});item.httpStatus=response.status;}
      catch{item.description='Network or timeout failure; no retry';return null;}
      let data;try{data=await boundedJson(response);}catch{item.description='Invalid or oversized response; no retry';return null;}
      item.codes=codes(data);
      if(!response.ok||data?.success!==true){item.description=item.codes.includes(10000)?'Authentication error: credential or authorization rejected':'Cloudflare request rejected; details omitted';return null;}
      item.description='Read request accepted';return data.result;
    };
    report.status='metadata_failed';const metadata=await read('metadata','GET',base);
    if(!metadata)return report;
    if(metadata.uuid!==expectedDatabase||metadata.name!=='kuwago-admin-db-development'){report.status='target_mismatch';return report;}
    report.metadata={name:metadata.name,uuid:metadata.uuid,...(Number.isSafeInteger(metadata.file_size)&&metadata.file_size>=0?{fileSizeBytes:metadata.file_size}:{})};
    headers.set('Content-Type','application/json');report.status='schema_failed';
    const result=await read('schema','POST',base+'/query',{sql:schemaSql,params:[]});
    if(!Array.isArray(result)||result.length!==1||result[0]?.success!==true||!Array.isArray(result[0]?.results))return report;
    const rows=result[0].results;
    if(rows.some(row=>!row||!['table','index','trigger','view'].includes(row.type)||typeof row.name!=='string'))return report;
    // Retain schema names/counts only, never SQL definitions, table contents, keys or response headers.
    const safe=rows.filter(row=>/^[A-Za-z0-9_]{1,128}$/.test(row.name));
    const tables=safe.filter(row=>row.type==='table').map(row=>row.name);
    const applicationTables=tables.filter(name=>!name.startsWith('_')&&!name.startsWith('sqlite_')&&name!=='d1_migrations');
    // Empty DEV baseline: only recognized Cloudflare internal tables may exist.
    // Unknown underscored names or filtered names must not hide application data.
    const unexpectedDefinitionCount=rows.filter(row=>row.type!=='table'||!['_cf_KV','_cf_METADATA'].includes(row.name)).length;
    report.schema={definitionCount:rows.length,unretainedNames:rows.length-safe.length,tableNames:tables,applicationTableCount:applicationTables.length,hasMigrationLedger:tables.includes('d1_migrations'),hasPrincipals:tables.includes('principals'),hasServices:tables.includes('services'),unexpectedDefinitionCount};
    report.status=unexpectedDefinitionCount===0?'passed':'unexpected_schema';return report;
  }catch{report.status='local_or_response_failure';return report;}
  finally{
    delete environment.CLOUDFLARE_API_TOKEN;headers.delete('Authorization');token=undefined;
    report.credentialCleared=token===undefined&&!Object.hasOwn(environment,'CLOUDFLARE_API_TOKEN');report.finished=new Date().toISOString();
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(existsSync(resolve(output,'attempt.lock'))){delete process.env.CLOUDFLARE_API_TOKEN;console.log('Existing attempt; evidence preserved; no network request');process.exit(2);}
  mkdirSync(output,{recursive:true});let report;
  try{
    if(process.argv.length!==2)throw Error('arguments_forbidden');let reserved=false;
    report=await diagnoseReadOnly(process.env,fetch,()=>{
      if(!reserved){writeFileSync(resolve(output,'attempt.lock'),JSON.stringify({phase:'2C.4',started:new Date().toISOString(),maxRequests:2}),{flag:'wx'});reserved=true;}
    });
  }catch{report={phase:'2C.4',status:'local_preflight_or_existing_attempt',requests:[]};}
  finally{delete process.env.CLOUDFLARE_API_TOKEN;}
  report.credentialCleared=!Object.hasOwn(process.env,'CLOUDFLARE_API_TOKEN');
  writeFileSync(resolve(output,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({phase:'2C.4',status:report.status,credentialCleared:report.credentialCleared,requestCount:report.requests.length}));
  process.exitCode=report.status==='passed'?0:2;
}
