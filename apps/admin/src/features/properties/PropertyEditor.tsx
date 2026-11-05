import { useEffect, useRef, useState } from 'react';
import { PropertyInputSchema, type PropertyInput } from '@kuwago/contracts';
import { adminApi, ApiError, type PropertyDocument } from '../../api/admin-client';
import { useSession } from '../../api/session';
import { Button, Panel } from '../../components/ui';
import { TextField, SelectField } from '../services/components/Fields';
import { ErrorNotice, useUnsaved } from '../services/api-support';
import { usePropertyCopy } from './copy';
import { usePreferences } from '../../preferences';

const blank=():PropertyInput=>({slug:'',kind:'managed',sortOrder:0,showOnLanding:false,location:null,maxGuests:null,bedrooms:null,bathrooms:null,airbnbUrl:null,ownerName:null,ownerContact:null,internalNotes:null,translations:{es:{name:'',tagline:'',description:''},en:{name:'',tagline:'',description:''}}});
function editable(p:PropertyInput):PropertyInput{return Object.fromEntries(Object.keys(blank()).map(k=>[k,structuredClone(p[k as keyof PropertyInput])])) as PropertyInput;}
export function PropertyEditor({id}:{id:string|null}){
  const c=usePropertyCopy(),{identity,reject}=useSession(),{language}=usePreferences();
  const [doc,setDoc]=useState<PropertyDocument|null>(null),[form,setForm]=useState<PropertyInput>(blank),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!!id),[error,setError]=useState<ApiError|null>(null),[invalid,setInvalid]=useState(false),[revision,setRevision]=useState(0);
  const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useUnsaved(dirty);
  useEffect(()=>{if(!id)return;const abort=new AbortController();adminApi.property(id,abort.signal).then(value=>{if(!abort.signal.aborted){setDoc(value);setForm(editable(value.data));setDirty(false);setError(null);}}).catch((e:unknown)=>{if(!abort.signal.aborted){const reason=e instanceof ApiError?e:new ApiError(0,'network');setError(reason);reject(reason);}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[id,revision,reject]);
  function update<K extends keyof PropertyInput>(key:K,value:PropertyInput[K]){setForm(old=>({...old,[key]:value}));setDirty(true);setInvalid(false);}
  async function save(){
    if(!identity?.permissions.includes('drafts:write'))return;
    if(!PropertyInputSchema.safeParse(form).success){setInvalid(true);return;}
    setBusy(true);setError(null);
    try{const value=await adminApi.saveProperty(form,id??undefined,doc?.version);if(!active.current)return;setDoc(value);setForm(editable(value.data));setDirty(false);if(!id)location.hash='#properties/'+value.data.id;}
    catch(e){if(active.current){const reason=e instanceof ApiError?e:new ApiError(0,'network');setError(reason);reject(reason);}}finally{if(active.current)setBusy(false);}
  }
  async function transition(action:'publish'|'unpublish'|'archive'){
    if(!doc||dirty||!identity?.permissions.includes(`services:${action}`)||!confirm(c.confirm))return;
    setBusy(true);setError(null);try{const value=await adminApi.publishProperty(doc.data.id,action,doc.version);if(active.current)setDoc(value);}catch(e){if(active.current){const reason=e instanceof ApiError?e:new ApiError(0,'network');setError(reason);reject(reason);}}finally{if(active.current)setBusy(false);}
  }
  if(loading)return <p role="status">{c.loading}</p>;
  if(id&&!doc)return <><ErrorNotice error={error}/><Button onClick={()=>{setLoading(true);setRevision(v=>v+1);}}>{c.retry}</Button></>;
  const writable=!!identity?.permissions.includes('drafts:write');
  return <><a className="button button-quiet" href="#properties">{c.back}</a><h1>{doc?.data.translations[language].name??c.new}</h1>
    <ErrorNotice error={error}/>{error?.status===409&&<p role="alert">{c.conflict}</p>}{invalid&&<p role="alert" className="field-error">{c.invalid}</p>}
    <form className="editor-fields" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy||!writable} className="editor-fields">
      <Panel className="form-panel"><h2>{c.general}</h2><fieldset disabled={!!doc?.data.slugLocked}><TextField label={c.slug} value={form.slug} onChange={v=>update('slug',v)} maxLength={60} help={c.locked}/></fieldset>
        {(['es','en'] as const).map(locale=><fieldset key={locale} className="form-grid"><legend>{locale.toUpperCase()}</legend>{(['name','tagline','description'] as const).map(key=><TextField key={key} label={`${c[key]} · ${locale.toUpperCase()}`} value={form.translations[locale][key]} multiline={key==='description'} maxLength={key==='name'?80:key==='tagline'?120:2000} onChange={v=>update('translations',{...form.translations,[locale]:{...form.translations[locale],[key]:v}})}/>)}</fieldset>)}
      </Panel>
      <Panel className="form-panel"><h2>{c.data}</h2><div className="form-grid"><SelectField label={c.kind} value={form.kind} onChange={v=>update('kind',v as PropertyInput['kind'])}><option value="managed">{c.managed}</option><option value="rental">{c.rental}</option></SelectField>
        {(['location','airbnbUrl'] as const).map(key=><TextField key={key} label={c[key]} value={form[key]??''} onChange={v=>update(key,v||null)} maxLength={key==='location'?120:2000}/>)}
        {(['maxGuests','bedrooms','bathrooms'] as const).map(key=><label key={key} className="service-field">{c[key]}<input type="number" min="0" step={key==='bathrooms'?'0.5':'1'} value={form[key]??''} onChange={e=>update(key,e.target.value===''?null:Number(e.target.value))}/></label>)}
      </div></Panel>
      <Panel className="form-panel"><h2>{c.internal}</h2><p>{c.private}</p><div className="editor-fields">{(['ownerName','ownerContact','internalNotes'] as const).map(key=><TextField key={key} label={c[key]} value={form[key]??''} onChange={v=>update(key,v||null)} multiline={key==='internalNotes'} maxLength={key==='internalNotes'?10000:250}/>)}</div></Panel>
      <Panel className="form-panel"><h2>{c.publication}</h2><label className="service-field">{c.order}<input type="number" min="0" step="1" value={form.sortOrder} onChange={e=>update('sortOrder',e.target.value===''?NaN:Number(e.target.value))}/></label><label><input type="checkbox" checked={form.showOnLanding} onChange={e=>update('showOnLanding',e.target.checked)}/>{c.show}</label><p>{c.notice}</p></Panel>
      <Button type="submit" variant="primary">{c.save}</Button>
    </fieldset></form>
    <Panel className="form-panel"><p role="status">{dirty?c.unsaved:doc?.data.hasUnpublishedChanges?c.changes:c.saved}</p>{doc&&<p>{doc.data.status==='published'?c.published:doc.data.status==='draft'?c.draft:c.archived}</p>}<div className="row-actions">{(['publish','unpublish','archive'] as const).map(action=><Button key={action} disabled={busy||dirty||!doc||!identity?.permissions.includes(`services:${action}`)} onClick={()=>void transition(action)}>{c[action]}</Button>)}
      {id&&error?.status===409&&<Button onClick={()=>{if(!dirty||confirm(c.confirm)){setLoading(true);setRevision(v=>v+1);}}}>{c.refresh}</Button>}</div></Panel>
  </>;
}
