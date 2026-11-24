import {createContext,useContext,useEffect,useState,useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import type {AccountClient} from './accountClient';
import {AccountSession} from './accountSession';

const Context=createContext<AccountSession|null>(null);
export function AccountProvider({client,children}:{client:AccountClient;children:ReactNode}){
 const [session]=useState(()=>new AccountSession(client));
 useEffect(()=>{
  void session.refresh();
  const refresh=()=>{if(document.visibilityState==='visible')void session.refresh();};
  const unsubscribe=client.onSessionInvalidation?.(()=>void session.refresh());
  addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{unsubscribe?.();removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[session]);
 return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useAccount(){
 const session=useContext(Context);if(!session)throw new Error('AccountProvider is required');
 const state=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
 return {session,...state};
}
