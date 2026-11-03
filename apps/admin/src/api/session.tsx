import {createContext,useContext,useEffect,useRef,useState,useCallback,type ReactNode} from 'react';
import {adminApi,ApiError,type Identity} from './admin-client';
type Session={identity:Identity|null;error:ApiError|null;loading:boolean;refresh:()=>void;reject:(error:ApiError)=>void;dirty:boolean;setDirty:(dirty:boolean)=>void;generation:number;endLocalSession:()=>void};
const Context=createContext<Session|null>(null);
export function AdminSessionProvider({children}:{children:ReactNode}){
  const [identity,setIdentity]=useState<Identity|null>(null),[error,setError]=useState<ApiError|null>(null),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[dirty,setDirty]=useState(false);
  const controller=useRef<AbortController|null>(null);
  const previousIdentity=useRef<string|null>(null);const [generation,setGeneration]=useState(0);
  useEffect(()=>{const abort=new AbortController();controller.current=abort;
    adminApi.session(abort.signal).then(value=>{if(abort.signal.aborted)return;if(previousIdentity.current&&previousIdentity.current!==value.id){setGeneration(v=>v+1);setDirty(false);}previousIdentity.current=value.id;setIdentity(value);setError(null);}).catch((reason:unknown)=>{if(!abort.signal.aborted){setIdentity(null);setError(reason instanceof ApiError?reason:new ApiError(0,'network'));}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[revision]);
  const refresh=useCallback(()=>{setLoading(true);setRevision(v=>v+1);},[]);
  const reject=useCallback((failure:ApiError)=>{if(failure.status===401){setIdentity(null);setError(failure);}},[]);
  const endLocalSession=useCallback(()=>{controller.current?.abort();previousIdentity.current=null;setIdentity(null);setError(null);setDirty(false);setGeneration(v=>v+1);},[]);
  return <Context.Provider value={{identity,error,loading,dirty,setDirty,refresh,reject,generation,endLocalSession}}>{children}</Context.Provider>;
}
export function useOptionalSession(){return useContext(Context);}
export function useSession(){const session=useContext(Context);if(!session)throw new Error('AdminSessionProvider required');return session;}
