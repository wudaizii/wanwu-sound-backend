import {createContext,useContext,useLayoutEffect,useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import {useAccount} from '../account/AccountProvider';
import type {CloudWorkspace} from './cloudWorkspace';

const Context=createContext<CloudWorkspace|null>(null);
export function CloudProvider({workspace,children}:{workspace:CloudWorkspace;children:ReactNode}){
 const {account,checking}=useAccount();
 useLayoutEffect(()=>{if(!checking)workspace.setAccount(account);},[account,checking,workspace]);
 return <Context.Provider value={workspace}>{children}</Context.Provider>;
}
export function useCloud(){const workspace=useContext(Context);if(!workspace)throw new Error('CloudProvider is required');
 return {workspace,...useSyncExternalStore(workspace.subscribe,workspace.getSnapshot,workspace.getSnapshot)};}
