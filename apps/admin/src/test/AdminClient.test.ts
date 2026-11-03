import {describe,it,expect,vi} from 'vitest';
import {AdminClient,ApiError,newDraft} from '../api/admin-client';
const identity={administrator:{id:'test-editor',role:'editor',permissions:['admin:read','drafts:write']}};
const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
function doc(){const draft=newDraft();return {version:1,data:{service:{id:'test-service',provenance:'demo',status:'draft',workingRevisionId:'test-revision',publishedRevisionId:null,modifiedAt:'2026-01-01T00:00:00.000Z'},internalNotes:'',revisions:[{...draft,id:'test-revision',serviceId:'test-service',number:1,createdAt:'2026-01-01T00:00:00.000Z',commercialApproval:{status:'pending',revisionId:null},internalNotes:undefined}]}};}
// Build an exact contract without presentation-only fields.
function document(){return doc();} // JSON serialization removes the undefined presentation-only property.
describe('typed administrative HTTP boundary',()=>{
  it('sends self-approval consent only when explicitly requested, for services and images',async()=>{
    const mock=vi.fn().mockImplementation(async()=>json(document(),200,{ETag:'"1"'}));const client=new AdminClient(mock as typeof fetch);
    await client.transition('test-service','approve','test-revision',1);
    expect(JSON.parse((mock.mock.calls[0]![1] as RequestInit).body as string)).not.toHaveProperty('confirmSelfApproval');
    await client.transition('test-service','approve','test-revision',1,undefined,true);
    expect(JSON.parse((mock.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({confirmCommercialApproval:true,confirmSelfApproval:true});
    const media={id:'test-media',state:'approved',version:2,validationCode:'approved',mimeType:'image/png',width:1,height:1,byteSize:80,usageApproval:'approved',uploadedBy:'test-super'};
    mock.mockImplementation(async()=>json({media},200,{ETag:'"2"'}));
    await client.mediaAction('test-media','approve',1);
    expect(JSON.parse((mock.mock.calls[2]![1] as RequestInit).body as string)).not.toHaveProperty('confirmSelfApproval');
    await client.mediaAction('test-media','approve',1,undefined,true);
    expect(JSON.parse((mock.mock.calls[3]![1] as RequestInit).body as string)).toMatchObject({confirmUsageRights:true,confirmSelfApproval:true});
  });
  it('uploads binary files without embedding credentials and never retries an ambiguous upload',async()=>{
    const file=new File(['test bytes'],'test.png',{type:'image/png'}),mock=vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(new AdminClient(mock as typeof fetch).uploadMedia(file)).rejects.toMatchObject({code:'network'});
    expect(mock).toHaveBeenCalledTimes(1);const init=mock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(file);expect(init.headers).toMatchObject({'Content-Type':'image/png','X-Kuwago-Request':'1'});expect(init.credentials).toBe('same-origin');expect(JSON.stringify(init.headers)).not.toMatch(/Authorization|Jwt|Bearer/);
  });
  it('validates media states and versions rather than treating upload as usage approval',async()=>{
    const media={id:'test-media',state:'validated',version:2,validationCode:'decoded_metadata_stripped',mimeType:'image/png',width:1,height:1,byteSize:100,usageApproval:'pending',uploadedBy:'test-editor'};
    const mock=vi.fn().mockResolvedValueOnce(json({media},201,{ETag:'"2"'})).mockResolvedValueOnce(json({items:[{...media,state:'public'}],nextCursor:null}));const client=new AdminClient(mock as typeof fetch);
    expect((await client.uploadMedia(new File(['test'],'image.png',{type:'image/png'}))).usageApproval).toBe('pending');await expect(client.mediaList()).rejects.toMatchObject({code:'invalid_response'});
  });
  it('approval sends explicit usage confirmation and optimistic concurrency version',async()=>{
    const mock=vi.fn().mockResolvedValue(json({error:'forbidden'},403));await expect(new AdminClient(mock as typeof fetch).mediaAction('test-media','approve',2)).rejects.toMatchObject({status:403});const init=mock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({confirmUsageRights:true});expect(init.headers).toMatchObject({'If-Match':'"2"'});expect(mock).toHaveBeenCalledTimes(1);
  });
  it('calls the default browser fetch with the correct global receiver',async()=>{
    const mocked=vi.spyOn(globalThis,'fetch').mockImplementation(function(this:unknown){expect(this).toBe(globalThis);return Promise.resolve(json(identity));});
    try{expect((await new AdminClient().session()).role).toBe('editor');}finally{mocked.mockRestore();}
  });
  it('validates session roles/permissions instead of trusting arbitrary responses',async()=>{
    const mock=vi.fn().mockResolvedValueOnce(json(identity)).mockResolvedValueOnce(json({administrator:{...identity.administrator,role:'owner'}}));const client=new AdminClient(mock as typeof fetch);
    expect((await client.session()).role).toBe('editor');await expect(client.session()).rejects.toMatchObject({status:502,code:'invalid_response'});
  });
  it('requires a shared valid contract and matching version/ETag',async()=>{
    const mock=vi.fn().mockResolvedValueOnce(json(document(),200,{ETag:'"1"'})).mockResolvedValueOnce(json(document(),200,{ETag:'"9"'}));const client=new AdminClient(mock as typeof fetch);
    expect((await client.get('test-service')).version).toBe(1);await expect(client.get('test-service')).rejects.toMatchObject({code:'invalid_response'});
  });
  it('accepts pending 202 but rejects a falsely completed 202',async()=>{
    const mock=vi.fn().mockResolvedValueOnce(json({...document(),delivery:'pending'},202,{ETag:'"1"'})).mockResolvedValueOnce(json({...document(),delivery:'visible'},202,{ETag:'"1"'}));const client=new AdminClient(mock as typeof fetch);
    expect((await client.transition('test-service','publish','test-revision',1)).delivery).toBe('pending');await expect(client.transition('test-service','publish','test-revision',1)).rejects.toMatchObject({code:'invalid_response'});
  });
  it('never retries a mutation after network failure or conflict and forwards If-Match',async()=>{
    const mock=vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(json({error:'version_or_state_conflict'},409));const client=new AdminClient(mock as typeof fetch);
    await expect(client.save(newDraft(),'test-service',3)).rejects.toMatchObject({code:'network'});expect(mock).toHaveBeenCalledTimes(1);
    await expect(client.save(newDraft(),'test-service',3)).rejects.toMatchObject({status:409});expect(mock).toHaveBeenCalledTimes(2);
    const init=mock.mock.calls[1]![1] as RequestInit;expect(init.headers).toMatchObject({'If-Match':'"3"','X-Kuwago-Request':'1'});expect(init.credentials).toBe('same-origin');expect(JSON.stringify(init.headers)).not.toMatch(/Authorization|Jwt|Bearer/);
  });
  it('only retries safe GET transient failures once',async()=>{
    const mock=vi.fn().mockResolvedValueOnce(json({error:'unavailable'},503)).mockResolvedValueOnce(json(identity));expect((await new AdminClient(mock as typeof fetch).session()).id).toBe('test-editor');expect(mock).toHaveBeenCalledTimes(2);
  });
  it('preserves 401/403/422 errors without unsafe retries or raw diagnostics',async()=>{
    for(const status of [401,403,422]){const mock=vi.fn().mockResolvedValue(json({error:'request_rejected',private:'never exposed'},status));await expect(new AdminClient(mock as typeof fetch).session()).rejects.toMatchObject({status,code:'request_rejected'});expect(mock).toHaveBeenCalledTimes(1);}
  });
  it('cancels reads without retrying after caller abort',async()=>{
    const abort=new AbortController();const mock=vi.fn().mockImplementation(async()=>{abort.abort();throw new DOMException('Aborted','AbortError');});await expect(new AdminClient(mock as typeof fetch).session(abort.signal)).rejects.toMatchObject({code:'cancelled'});expect(mock).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed JSON, HTML and invalid category data without a demo fallback',async()=>{
    const mock=vi.fn().mockResolvedValueOnce(new Response('bad',{headers:{'Content-Type':'application/json'}})).mockResolvedValueOnce(new Response('<html>Access</html>')).mockResolvedValueOnce(json({items:[{category:{id:'x'},version:1}]}));const client=new AdminClient(mock as typeof fetch);
    await expect(client.session()).rejects.toBeInstanceOf(ApiError);await expect(client.session()).rejects.toMatchObject({code:'invalid_response'});await expect(client.categories()).rejects.toMatchObject({code:'invalid_response'});expect(mock).toHaveBeenCalledTimes(3);
  });
});
