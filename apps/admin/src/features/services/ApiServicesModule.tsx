import {useEffect,useState} from 'react';
import {adminApi,ApiError,type CategoryDocument,type ServiceSummary} from '../../api/admin-client';
import {useSession} from '../../api/session';
import {Button,Panel} from '../../components/ui';
import type {AdminRoute} from '../../routing';
import {usePreferences} from '../../preferences';
import {useApiCopy} from './api-copy';
import {ErrorNotice,LocalTestIdentity,useUnsaved} from './api-support';
import {SelectField,TextField} from './components/Fields';
import {ApiServiceEditor} from './ApiServiceEditor';
const failure=(reason:unknown)=>reason instanceof ApiError?reason:new ApiError(0,'network');
function summaryPrice(value:unknown,c:ReturnType<typeof useApiCopy>):string{
  const price=value as {kind:string;currency:string|null;amountMinor?:number}|null;
  if(!price)return '—';
  if(price.kind==='quote')return `${c.quote} · ${price.currency??'—'}`;
  return `${price.kind==='from'?c.from+' ':''}${(price.amountMinor??0)/100} ${price.currency}`;
}
export function ApiServicesModule({route}:{route:Extract<AdminRoute,{page:'services'}>}){
  const c=useApiCopy(),session=useSession();const [categories,setCategories]=useState<CategoryDocument[]>([]),[categoryError,setCategoryError]=useState<ApiError|null>(null),[revision,setRevision]=useState(0);
  const identityId=session.identity?.id;
  useEffect(()=>{if(!identityId)return;const abort=new AbortController();adminApi.categories(abort.signal).then(value=>{setCategories(value);setCategoryError(null);}).catch((reason:unknown)=>{if(!abort.signal.aborted)setCategoryError(failure(reason));});return()=>abort.abort();},[identityId,revision]);
  return <div className="services-module"><div className="demo-disclaimer" role="note"><div><strong>{c.api}</strong><p>{c.notice}</p></div></div><LocalTestIdentity/>
    <Panel className="api-session"><strong>{c.session}: {session.identity?`${session.identity.id} · ${session.identity.role}`:'—'}</strong>{session.loading?<p role="status">{c.loading}</p>:!session.identity?<p>{c.noSession}</p>:<small>{session.identity.permissions.join(' · ')}</small>}<ErrorNotice error={session.error}/>{!session.identity&&<Button onClick={session.refresh}>{c.retry}</Button>}</Panel>
    <ErrorNotice error={categoryError}/>{categoryError&&<Button onClick={()=>setRevision(v=>v+1)}>{c.retry}</Button>}
    {route.mode==='list'?<ApiList key={session.generation} categories={categories} reloadCategories={()=>setRevision(v=>v+1)}/>:<ApiServiceEditor key={session.generation+':'+('id'in route?route.id:'new')} id={'id'in route?route.id:null} categories={categories} previewOnly={route.mode==='preview'}/>}
  </div>;
}
function ApiList({categories,reloadCategories}:{categories:CategoryDocument[];reloadCategories:()=>void}){
  const c=useApiCopy(),{language}=usePreferences(),{identity,reject}=useSession();const [items,setItems]=useState<ServiceSummary[]>([]),[error,setError]=useState<ApiError|null>(null),[loading,setLoading]=useState(false),[cursor,setCursor]=useState<string|null>(null),[reload,setReload]=useState(0),[query,setQuery]=useState(''),[category,setCategory]=useState('all'),[status,setStatus]=useState('all'),[manage,setManage]=useState(false);
  const identityId=identity?.id;
  useEffect(()=>{if(!identityId)return;const abort=new AbortController();adminApi.list('',abort.signal).then(value=>{setItems(value.items);setCursor(value.nextCursor);setError(null);}).catch((reason:unknown)=>{if(!abort.signal.aborted){const e=failure(reason);setError(e);reject(e);}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[identityId,reload,reject]);
  async function more(){setLoading(true);try{const value=await adminApi.list(cursor??'');setItems(old=>[...old,...value.items]);setCursor(value.nextCursor);}catch(reason){setError(failure(reason));}finally{setLoading(false);}}
  const filtered=items.filter(row=>(category==='all'||row.categoryId===category)&&(status==='all'||row.status===status)&&`${row.titleEs} ${row.titleEn} ${row.slug}`.toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language)));
  const canWrite=!!identity?.permissions.includes('drafts:write');
  return <><div className="services-heading"><div><p className="section-eyebrow">CONCIERGE & MARKETPLACE</p><h1>{c.title}</h1></div>{canWrite&&<a href="#services/new" className="button button-primary">{c.new}</a>}</div>
    <div className="services-toolbar"><Button disabled={!identity||loading} onClick={()=>{setLoading(true);setReload(v=>v+1);}}>{c.refresh}</Button><Button disabled={!identity} aria-expanded={manage} onClick={()=>setManage(v=>!v)}>{c.categories}</Button></div>
    {manage&&<CategoryManager categories={categories} onChanged={reloadCategories}/>}
    <Panel className="service-filters"><TextField label={c.search} value={query} onChange={setQuery}/><SelectField label={c.category} value={category} onChange={setCategory}><option value="all">{c.all}</option>{categories.map(({category:row})=><option key={row.id} value={row.id}>{row.translations[language].name}</option>)}</SelectField><SelectField label={c.state} value={status} onChange={setStatus}><option value="all">{c.all}</option>{(['draft','published','archived'] as const).map(state=><option key={state} value={state}>{state==='draft'?c.draft:state==='published'?c.publishedState:c.archivedState}</option>)}</SelectField></Panel>
    <ErrorNotice error={error}/>{error&&<Button onClick={()=>{setLoading(true);setReload(v=>v+1);}}>{c.retry}</Button>}
    {loading&&<p role="status">{c.loading}</p>}{identity&&!error&&!filtered.length&&<Panel>{c.empty}</Panel>}
    {identity&&filtered.length>0&&<Panel className="services-table-panel"><table className="services-table"><caption className="sr-only">{c.title}</caption><thead><tr>{[c.name,c.category,c.state,c.price,c.modified,c.actions].map(name=><th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{filtered.map(row=><tr key={row.id}>
      <td data-label={c.name}><strong>{language==='es'?row.titleEs||'—':row.titleEn||'—'}</strong><small> /{row.slug}</small></td>
      <td data-label={c.category}>{categories.find(x=>x.category.id===row.categoryId)?.category.translations[language].name??'—'}</td>
      <td data-label={c.state}>{row.status==='draft'?c.draft:row.status==='published'?c.publishedState:c.archivedState}</td>
      <td data-label={c.price}>{row.prices.map(({optionId,price})=><div key={optionId}>{summaryPrice(price,c)}</div>)}</td>
      <td data-label={c.modified}>{new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(row.modifiedAt))}</td>
      <td data-label={c.actions}><div className="row-actions"><a href={`#services/${row.id}/edit`}>{c.editor}</a><a href={`#services/${row.id}/preview`}>{c.preview}</a></div></td>
    </tr>)}</tbody></table></Panel>}
    {cursor&&<Button disabled={loading} onClick={()=>void more()}>{c.more}</Button>}
  </>;
}
function CategoryManager({categories,onChanged}:{categories:CategoryDocument[];onChanged:()=>void}){
  const c=useApiCopy(),{language}=usePreferences(),session=useSession();const [id,setId]=useState(''),[es,setEs]=useState(''),[en,setEn]=useState(''),[slug,setSlug]=useState(''),[active,setActive]=useState(true),[version,setVersion]=useState<number|undefined>(),[dirty,setDirty]=useState(false),[error,setError]=useState<ApiError|null>(null),[busy,setBusy]=useState(false);
  useUnsaved(dirty);
  function select(value:string){if(dirty&&!confirm(c.discard))return;const row=categories.find(x=>x.category.id===value);setId(value);setEs(row?.category.translations.es.name??'');setEn(row?.category.translations.en.name??'');setSlug(row?.category.slug??'');setActive(row?.category.active??true);setVersion(row?.version);setDirty(false);}
  async function save(){setBusy(true);try{const value=await adminApi.saveCategory({slug,active,translations:{es:{name:es},en:{name:en}}},id||undefined,version);setId(value.category.id);setVersion(value.version);setDirty(false);setError(null);onChanged();}catch(reason){const e=failure(reason);setError(e);session.reject(e);}finally{setBusy(false);}}
  return <Panel className="form-panel"><h2>{c.categories}</h2><SelectField label={c.category} value={id} onChange={select}><option value="">{c.newCategory}</option>{categories.map(row=><option key={row.category.id} value={row.category.id}>{row.category.translations[language].name}</option>)}</SelectField><form onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={busy||!session.identity?.permissions.includes('drafts:write')} className="form-grid"><TextField label={c.categoryEs} value={es} onChange={v=>{setEs(v);setDirty(true);}} maxLength={100}/><TextField label={c.categoryEn} value={en} onChange={v=>{setEn(v);setDirty(true);}} maxLength={100}/><TextField label={c.slug} value={slug} onChange={v=>{setSlug(v);setDirty(true);}} maxLength={80}/><SelectField label={c.state} value={active?'active':'inactive'} onChange={v=>{setActive(v==='active');setDirty(true);}}><option value="active">{c.active}</option><option value="inactive">{c.inactive}</option></SelectField><Button type="submit">{c.saveCategory}</Button></fieldset></form><ErrorNotice error={error}/>{dirty&&<p>{c.unsaved}</p>}</Panel>;
}


