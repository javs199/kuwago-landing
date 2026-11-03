import {useEffect,useState} from 'react';
import {ApiError} from '../../api/admin-client';
import {useSession} from '../../api/session';
import {Button,Panel} from '../../components/ui';
import {useApiCopy} from './api-copy';
export function ErrorNotice({error}:{error:ApiError|null}){const c=useApiCopy();if(!error||error.code==='cancelled')return null;const message=error.code==='independent_approval_required'?c.independent:error.code==='explicit_currency_required'?c.currencyFirst:error.status===401?c.unauthorized:error.status===403?c.forbidden:error.status===404?c.missing:error.status===409?c.conflict:error.status===422?c.validation:error.code==='invalid_response'?c.invalid:c.network;return <p className="field-error api-error" role="alert">{message}</p>;}
export function useUnsaved(dirty:boolean){
  const c=useApiCopy();const {setDirty}=useSession();
  useEffect(()=>{setDirty(dirty);return()=>setDirty(false);},[dirty,setDirty]);
  useEffect(()=>{
    if(!dirty)return;let previous=location.hash;let accepted:string|null=null;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    const click=(event:MouseEvent)=>{const link=(event.target as Element|null)?.closest('a[href]');const target=link?.getAttribute('href');if(target?.startsWith('#')&&target!==location.hash){if(!window.confirm(c.discard)){event.preventDefault();event.stopPropagation();}else accepted=target;}};
    const pop=()=>{if(location.hash!==previous&&location.hash!==accepted&&!window.confirm(c.discard))history.replaceState(null,'',previous);else previous=location.hash;accepted=null;};
    window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);window.addEventListener('popstate',pop);
    return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);window.removeEventListener('popstate',pop);};
  },[dirty,c.discard]);
}
export function LocalTestIdentity(){
  const c=useApiCopy(),session=useSession();const [identity,setIdentity]=useState('editor'),[code,setCode]=useState(''),[error,setError]=useState<ApiError|null>(null),[busy,setBusy]=useState(false);
  const enabled=import.meta.env.DEV&&import.meta.env.VITE_LOCAL_TEST_LOGIN==='true';
  if(!enabled)return null;
  async function action(logout=false){
    if(session.dirty&&!window.confirm(c.discard))return;
    setBusy(true);setError(null);
    try{
      const response=await fetch('/__local-test/'+(logout?'logout':'login'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kuwago-Request':'1'},body:JSON.stringify(logout?{}:{identity,code})});
      if(!response.ok)throw new ApiError(response.status,'test_authentication_failed');setCode('');if(logout)session.endLocalSession();else session.refresh();
    }catch(reason){setError(reason instanceof ApiError?reason:new ApiError(0,'network'));}finally{setBusy(false);}
  }
  return <Panel className="api-identity"><p>{c.testNote}</p><form onSubmit={event=>{event.preventDefault();void action();}}><label>{c.testIdentity}<select aria-label={c.testIdentity} value={identity} onChange={e=>setIdentity(e.target.value)}>{['editor','editor2','reviewer','disabled'].map(value=><option key={value}>{value}</option>)}</select></label><label>{c.testCode}<input aria-label={c.testCode} type="password" value={code} autoComplete="off" onChange={e=>setCode(e.target.value)} required /></label><Button type="submit" disabled={busy}>{c.testLogin}</Button><Button disabled={busy} onClick={()=>void action(true)}>{c.testLogout}</Button></form><ErrorNotice error={error}/></Panel>;
}

