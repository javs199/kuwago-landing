import { useEffect, useState } from 'react';
import { adminApi, ApiError, type PropertyDocument } from '../../api/admin-client';
import { useSession } from '../../api/session';
import { Button, Panel } from '../../components/ui';
import { usePreferences } from '../../preferences';
import { ErrorNotice, LocalTestIdentity } from '../services/api-support';
import { PropertyEditor } from './PropertyEditor';
import { usePropertyCopy } from './copy';

export function PropertiesModule({id}:{id:string|null}){
  const session=useSession(),c=usePropertyCopy();
  return <div className="services-module"><LocalTestIdentity/>
    <ErrorNotice error={session.error}/>{session.loading&&<p role="status">{c.loading}</p>}
    {!session.identity&&<Button onClick={session.refresh}>{c.retry}</Button>}
    {session.identity&&(id?<PropertyEditor key={session.generation+':'+id} id={id==='new'?null:id}/>:<PropertiesList key={session.generation}/>)}</div>;
}
function PropertiesList(){
  const c=usePropertyCopy(),{language}=usePreferences(),session=useSession();
  const [items,setItems]=useState<PropertyDocument[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState<ApiError|null>(null),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0);
  const {reject}=session;
  useEffect(()=>{const abort=new AbortController();adminApi.properties('',abort.signal).then(result=>{if(!abort.signal.aborted){setItems(result.items);setCursor(result.nextCursor);setError(null);}}).catch((reason:unknown)=>{if(!abort.signal.aborted){const e=reason instanceof ApiError?reason:new ApiError(0,'network');setError(e);reject(e);}}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[revision,reject]);
  async function more(){setBusy(true);try{const r=await adminApi.properties(cursor??'');setItems(old=>[...old,...r.items]);setCursor(r.nextCursor);setError(null);}catch(e){const reason=e instanceof ApiError?e:new ApiError(0,'network');setError(reason);reject(reason);}finally{setBusy(false);}}
  return <><div className="services-heading"><h1>{c.title}</h1>{session.identity?.permissions.includes('drafts:write')&&<a className="button button-primary" href="#properties/new">{c.new}</a>}</div>
    <Button disabled={busy} onClick={()=>{setBusy(true);setRevision(v=>v+1);}}>{c.refresh}</Button><ErrorNotice error={error}/>
    {busy&&<p role="status">{c.loading}</p>}{!busy&&!error&&!items.length&&<Panel>{c.empty}</Panel>}
    {!!items.length&&<Panel className="services-table-panel"><table className="services-table"><caption className="sr-only">{c.title}</caption><thead><tr>{[c.name,c.state,c.show,c.order,c.actions].map(v=><th scope="col" key={v}>{v}</th>)}</tr></thead><tbody>{[...items].sort((a,b)=>a.data.sortOrder-b.data.sortOrder).map(({data:p})=><tr key={p.id}>
      <td data-label={c.name}><strong>{p.translations[language].name}</strong><small>/{p.slug}</small></td><td data-label={c.state}>{p.status==='published'?c.published:p.status==='draft'?c.draft:c.archived}{p.hasUnpublishedChanges&&<small>{c.changes}</small>}</td><td data-label={c.show}>{p.showOnLanding?c.yes:c.no}</td><td data-label={c.order}>{p.sortOrder}</td><td data-label={c.actions}><a href={`#properties/${p.id}`}>{c.edit}</a></td>
    </tr>)}</tbody></table></Panel>}{cursor&&<Button disabled={busy} onClick={()=>void more()}>{c.more}</Button>}</>;
}
