import {MediaLibrary} from './MediaLibrary';
import {useEffect,useRef,useState} from 'react';
import {currencies,type ServiceRevision,type ServiceOption} from '@kuwago/contracts';
import {adminApi,ApiError,draftFromDocument,newDraft,type CategoryDocument,type DraftInput,type RevisionSummary,type ServiceDocument,type SyncStatus} from '../../api/admin-client';
import {useSession} from '../../api/session';
import {usePreferences} from '../../preferences';
import {Button,Panel} from '../../components/ui';
import {ConfirmDialog} from '../../components/ConfirmDialog';
import {TextField,SelectField} from './components/Fields';
import {useApiCopy} from './api-copy';
import {ErrorNotice,useUnsaved} from './api-support';
const failure=(reason:unknown)=>reason instanceof ApiError?reason:new ApiError(0,'network');
type Action='approve'|'publish'|'unpublish'|'archive'|'rearm';
export function ApiServiceEditor({id,categories,previewOnly}:{id:string|null;categories:CategoryDocument[];previewOnly:boolean}){
  const c=useApiCopy(),{language}=usePreferences(),session=useSession();const identityId=session.identity?.id;
  const [doc,setDoc]=useState<ServiceDocument|null>(null),[draft,setDraft]=useState<DraftInput>(newDraft),[owner,setOwner]=useState(identityId??''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!!id),[error,setError]=useState<ApiError|null>(null),[message,setMessage]=useState(''),[reload,setReload]=useState(0),[critical,setCritical]=useState<Action|null>(null),[preview,setPreview]=useState(previewOnly),[history,setHistory]=useState<RevisionSummary[]>([]),[historyCursor,setHistoryCursor]=useState<string|null>(null),[historical,setHistorical]=useState<ServiceRevision|null>(null),[sync,setSync]=useState<SyncStatus|null>(null);
  const operation=useRef<AbortController|null>(null);const reject=session.reject;
  useUnsaved(dirty);
  useEffect(()=>()=>operation.current?.abort(),[]);
  useEffect(()=>{
    if(!id||!identityId||(dirty&&owner===identityId))return;const abort=new AbortController();
    adminApi.get(id,abort.signal).then(value=>{setDoc(value);setDraft(draftFromDocument(value));setOwner(identityId);setDirty(false);setError(null);}).catch((reason:unknown)=>{if(!abort.signal.aborted){const e=failure(reason);setError(e);reject(e);}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[id,identityId,reload,dirty,owner,reject]);
  const can=(permission:Parameters<NonNullable<typeof session.identity>['permissions']['includes']>[0])=>!!session.identity?.permissions.includes(permission);
  const writable=can('drafts:write')&&doc?.data.service.status!=='archived'&&!previewOnly&&(!id||!loading&&!!doc);
  function change(patch:Partial<DraftInput>){setDraft(old=>({...old,...patch}));setDirty(true);setMessage('');}
  function option(index:number,patch:Partial<ServiceOption>){change({options:draft.options.map((row,i)=>i===index?{...row,...patch}:row)});}
  async function perform(task:(signal:AbortSignal)=>Promise<void>){operation.current?.abort();const abort=new AbortController();operation.current=abort;setBusy(true);setError(null);try{await task(abort.signal);}catch(reason){const e=failure(reason);if(e.code!=='cancelled'){setError(e);reject(e);}}finally{if(!abort.signal.aborted)setBusy(false);}}
  function accept(value:ServiceDocument){setDoc(value);setDraft(draftFromDocument(value));setDirty(false);}
  async function save(){await perform(async signal=>{const value=await adminApi.save(draft,id??undefined,doc?.version,signal);accept(value);setMessage(c.saved);if(!id){window.history.replaceState(null,'',`#services/${value.data.service.id}/edit`);window.dispatchEvent(new HashChangeEvent('hashchange'));}});}
  async function act(action:Action){
    if(!id||!doc||dirty)return;
    await perform(async signal=>{
      if(action==='rearm'){const value=await adminApi.sync(true,signal);setSync(value.synchronization);setMessage(value.delivery==='pending'?c.pending:c.checked);return;}
      const value=await adminApi.transition(id,action,doc.data.service.workingRevisionId,doc.version,signal,action==='approve'&&session.identity?.role==='super_admin');accept(value);
      setMessage(value.delivery==='pending'?c.pending:value.delivery==='superseded'?c.superseded:action==='approve'?c.approved:action==='publish'?c.published:action==='unpublish'?c.withdrawn:c.archived);
      if(can('audit:read'))setSync(await adminApi.status(signal));
    });
  }
  async function revisions(more=false){if(!id)return;await perform(async signal=>{const result=await adminApi.revisions(id,more?historyCursor??'':'',signal);setHistory(old=>more?[...old,...result.items]:result.items);setHistoryCursor(result.nextCursor);});}
  async function refresh(){if(dirty&&!confirm(c.discard))return;setDirty(false);setLoading(true);setReload(v=>v+1);}
  const readonly=busy||!writable;
  return <><div className="editor-heading"><a className="button button-quiet" href="#services">{c.back}</a><div className="editor-title"><div><p className="section-eyebrow">{c.editor}</p><h1>{id?draft.translations[language].title||c.editor:c.newDraft}</h1></div><span className={`publication-badge publication-${doc?.data.service.status??'draft'}`}>{doc?.data.service.status==='published'?c.publishedState:doc?.data.service.status==='archived'?c.archivedState:c.draft}</span></div></div>
    <ErrorNotice error={error}/>{(message||doc&&!dirty)&&<p className="demo-feedback" role="status">{message||(doc?.data.revisions.find(r=>r.id===doc.data.service.workingRevisionId)?.commercialApproval.status==='approved'?c.approved:c.saved)}</p>}{loading&&<p role="status">{c.loading}</p>}
    {id&&<Button disabled={busy||!session.identity} onClick={()=>void refresh()}>{c.refresh}</Button>}
    <form className="service-editor" onSubmit={event=>{event.preventDefault();void save();}} noValidate aria-busy={busy}>
      <div className="editor-fields"><Panel className="form-panel"><h2>{c.general}</h2><fieldset className="form-grid" disabled={readonly}>
        <TextField label={c.titleEs} maxLength={100} value={draft.translations.es.title} onChange={v=>change({translations:{...draft.translations,es:{...draft.translations.es,title:v}}})}/><TextField label={c.titleEn} maxLength={100} value={draft.translations.en.title} onChange={v=>change({translations:{...draft.translations,en:{...draft.translations.en,title:v}}})}/>
        <TextField label={c.descriptionEs} multiline value={draft.translations.es.description} onChange={v=>change({translations:{...draft.translations,es:{...draft.translations.es,description:v}}})}/><TextField label={c.descriptionEn} multiline value={draft.translations.en.description} onChange={v=>change({translations:{...draft.translations,en:{...draft.translations.en,description:v}}})}/>
        <SelectField label={c.category} value={draft.categoryId??''} onChange={v=>change({categoryId:v||null})}><option value="">{c.choose}</option>{categories.map(({category})=><option key={category.id} value={category.id}>{category.translations[language].name}{category.active?'':` · ${c.inactive}`}</option>)}</SelectField>
        <TextField label={c.slug} maxLength={80} value={draft.slug} onChange={v=>change({slug:v})}/>
      </fieldset></Panel>
      <Panel className="form-panel"><h2>{c.commercial}</h2><p>{c.optionNote}</p>{draft.options.map((row,index)=><fieldset className="form-grid api-option" disabled={readonly} key={row.id}><legend>{index+1}</legend>
        <TextField label={`${c.optionEs} ${index+1}`} value={row.translations.es.name} maxLength={100} onChange={v=>option(index,{translations:{...row.translations,es:{name:v}}})}/><TextField label={`${c.optionEn} ${index+1}`} value={row.translations.en.name} maxLength={100} onChange={v=>option(index,{translations:{...row.translations,en:{name:v}}})}/>
        <TextField label={`${c.duration} ${index+1}`} value={row.durationMinutes?.toString()??''} inputMode="numeric" onChange={v=>option(index,{durationMinutes:v===''?null:Number(v)})}/>
        <SelectField label={`${c.privacy} ${index+1}`} value={row.experienceType??''} onChange={v=>option(index,{experienceType:v as ServiceOption['experienceType']})}><option value="">—</option><option value="private">{c.private}</option><option value="shared">{c.shared}</option></SelectField>
        <SelectField label={`${c.venue} ${index+1}`} value={row.venue??''} onChange={v=>option(index,{venue:v as ServiceOption['venue']})}><option value="">—</option><option value="in_property">{c.in_property}</option><option value="off_property">{c.off_property}</option></SelectField>
        <SelectField label={`${c.priceMode} ${index+1}`} value={row.price?.kind??''} onChange={v=>{if((v==='fixed'||v==='from')&&!row.price?.currency){setError(new ApiError(422,'explicit_currency_required'));return;}option(index,{price:v==='quote'?{kind:'quote',currency:row.price?.currency??null,unit:row.price?.unit??'service'}:v==='fixed'||v==='from'?{kind:v,amountMinor:row.price&&row.price.kind!=='quote'?row.price.amountMinor:0,currency:row.price!.currency!,unit:row.price?.unit??'service'}:null});}}><option value="">—</option><option value="quote">{c.quote}</option><option value="fixed">{c.fixed}</option><option value="from">{c.from}</option></SelectField>
        {row.price&&row.price.kind!=='quote'&&<PriceAmountField key={`${row.id}:${doc?.version??0}:${reload}`} label={`${c.amount} ${index+1}`} initialMinor={row.price.amountMinor} onChange={amountMinor=>{if(row.price&&row.price.kind!=='quote')option(index,{price:{...row.price,amountMinor}});}}/>}
        <SelectField label={`${c.currency} ${index+1}`} value={row.price?.currency??''} onChange={v=>{if(row.price)option(index,{price:{...row.price,currency:v||null} as ServiceOption['price']});}}><option value="">—</option>{currencies.map(value=><option key={value}>{value}</option>)}</SelectField>
        <SelectField label={`${c.unit} ${index+1}`} value={row.price?.unit??'service'} onChange={v=>{if(row.price)option(index,{price:{...row.price,unit:v as NonNullable<ServiceOption['price']>['unit']}});}}>{(['service','person','group','dinner'] as const).map(value=><option key={value} value={value}>{c[value]}</option>)}</SelectField>
      </fieldset>)}</Panel>
      <MediaLibrary media={draft.media} onChange={media=>change({media})} disabled={readonly}/></div>
      <aside className="publication-sidebar"><Panel className="publication-panel"><h2>{c.publication}</h2><p>{c.readiness}</p><p>{c.publicationNote}</p><p>v{doc?.version??'—'} · {doc?.data.service.workingRevisionId??'—'}</p><div className="publication-actions">
        <Button onClick={()=>setPreview(v=>!v)} aria-expanded={preview}>{c.preview}</Button>
        <Button disabled={busy||dirty||!doc||!can('services:publish')} onClick={()=>void perform(async signal=>{if(doc&&id){await adminApi.validate(id,doc.data.service.workingRevisionId,doc.version,signal);setMessage(c.checked);}})}>{c.validate}</Button>
        <Button disabled={busy||dirty||!doc||!can('services:publish')||doc.data.service.status==='archived'} onClick={()=>setCritical('approve')}>{c.approve}</Button>
        <Button disabled={busy||dirty||!doc||!can('services:publish')||doc.data.service.status==='archived'} onClick={()=>setCritical('publish')}>{c.publish}</Button>
        <Button disabled={busy||dirty||!doc||!can('services:unpublish')||doc.data.service.status!=='published'} onClick={()=>setCritical('unpublish')}>{c.unpublish}</Button>
        <Button disabled={busy||dirty||!doc||!can('services:archive')||doc.data.service.status==='archived'} onClick={()=>setCritical('archive')}>{c.archive}</Button>
        <Button disabled={busy||!id||!can('admin:read')} onClick={()=>void revisions()}>{c.history}</Button>
      </div></Panel>
      {can('audit:read')&&<Panel className="publication-panel"><h2>{c.sync}</h2><Button disabled={busy} onClick={()=>void perform(async signal=>{setSync(await adminApi.status(signal));})}>{c.refresh}</Button><Button disabled={busy||dirty||!can('services:publish')} onClick={()=>void perform(async signal=>{const value=await adminApi.sync(false,signal);setSync(value.synchronization);setMessage(value.delivery==='pending'?c.pending:doc?.synchronization?.generation===value.synchronization.generation&&doc.synchronization.epoch===value.synchronization.epoch?(doc.data.service.status==='published'?c.published:doc.data.service.status==='archived'?c.archived:c.withdrawn):c.checked);})}>{c.reconcile}</Button>{sync&&<div aria-live="polite"><p>{sync.mode} · {c.generation} {sync.generation??'—'}</p><p>{c.pendingDeliveries}: {sync.pendingCount} · {c.escalatedDeliveries}: {sync.escalatedCount} · {c.age}: {sync.oldestPendingMs}</p>{sync.escalatedCount>0&&<Button disabled={busy||dirty||!can('services:publish')} onClick={()=>setCritical('rearm')}>{c.rearm}</Button>}</div>}</Panel>}
      </aside>
      {preview&&<Panel className="inline-preview"><h2>{c.preview}</h2><ContentPreview draft={draft}/></Panel>}
      <div className="editor-save-bar"><span>{dirty?c.unsaved:message}</span><Button type="submit" variant="primary" disabled={busy||!writable||(!dirty&&!!doc)}>{c.save}</Button></div>
    </form>
    {!!history.length&&<Panel className="form-panel"><h2>{c.history}</h2><ul>{history.map(row=><li key={row.id}><Button disabled={busy} onClick={()=>void perform(async signal=>{if(id)setHistorical(await adminApi.revision(id,row.id,signal));})}>{c.review} {row.number}</Button> {row.createdAt} {row.sealedAt?'✓':''}</li>)}</ul>{historyCursor&&<Button disabled={busy} onClick={()=>void revisions(true)}>{c.historyMore}</Button>}{historical&&<div><h3>{c.reviewNote} · {historical.number}</h3><ContentPreview draft={{...historical,internalNotes:'',media:historical.media.map(({id,sortOrder,alt})=>({id,sortOrder,alt}))}}/></div>}</Panel>}
    {critical&&<ConfirmDialog title={c.confirmTitle} description={<p>{critical==='approve'&&session.identity?.role==='super_admin'?(language==='es'?'Confirmo la aprobación de esta revisión. Si soy su autor, autorizo expresamente la autoaprobación como Super Admin; quedará registrada en auditoría.':'I confirm approval of this revision. If I am its author, I explicitly authorize self-approval as Super Admin; this will be audited.'):c.confirmText}</p>} confirm={c.confirm} cancel={c.cancel} onCancel={()=>setCritical(null)} onConfirm={()=>{const action=critical;setCritical(null);void act(action);}}/>}
  </>;
}
function ContentPreview({draft}:{draft:DraftInput}){const {language}=usePreferences();const c=useApiCopy();return <article className="service-preview-card"><div className="preview-content"><h3>{draft.translations[language].title||'—'}</h3><p>{draft.translations[language].description||'—'}</p><ul>{draft.options.map(option=><li key={option.id}>{option.translations[language].name} · {option.durationMinutes??'—'} min · {option.price?c[option.price.kind]:'—'} · {option.price?.currency??'—'}</li>)}</ul><p>{draft.media.length} · {c.media}</p></div></article>;}
export function PriceAmountField({label,initialMinor,onChange}:{label:string;initialMinor:number;onChange:(minor:number)=>void}){
  const c=useApiCopy();const [raw,setRaw]=useState(()=>Number.isSafeInteger(initialMinor)?(initialMinor/100).toString():'');
  function parse(value:string):number{if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value))return NaN;const [whole='',fraction='']=value.split('.');const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(amount)?amount:NaN;}
  return <TextField label={label} value={raw} inputMode="decimal" maxLength={18} error={Number.isNaN(parse(raw))?c.invalidAmount:undefined} onChange={value=>{setRaw(value);onChange(parse(value));}}/>;
}






