import type {AccountView} from '@wanwu-v2/contracts/account';
import {AccountError} from './accountClient.ts';
import type {AccountClient,Registration} from './accountClient.ts';

export type AccountState={account:AccountView|null;checking:boolean;busy:boolean;error:AccountError|null};
/** Tab-local view of a server session. Deliberately has no work-session or storage dependencies. */
export class AccountSession{
 private state:AccountState={account:null,checking:true,busy:false,error:null};
 private listeners=new Set<()=>void>();
 private generation=0;
 private pendingRefresh:Promise<void>|null=null;
 private readonly client:AccountClient;
 constructor(client:AccountClient){this.client=client;}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(change:Partial<AccountState>){this.state={...this.state,...change};for(const listener of this.listeners)listener();}
 clearError(){if(!this.state.busy)this.update({error:null});}
 refresh():Promise<void>{
  if(this.state.busy)return Promise.resolve();
  if(this.pendingRefresh)return this.pendingRefresh;
  const generation=++this.generation;this.update({checking:true});
  this.pendingRefresh=(async()=>{
   try{const account=await this.client.me();if(generation===this.generation)this.update({account,checking:false,error:null});}
   catch(error){
    if(generation!==this.generation)return;
    const known=error instanceof AccountError?error:new AccountError('network');
    this.update({checking:false,error:known.reason==='needs-account'?null:known,
     ...(['needs-account','account-disabled'].includes(known.reason)?{account:null}:{})});
   }
  })().finally(()=>{this.pendingRefresh=null;});
  return this.pendingRefresh;
 }
 private async change(action:()=>Promise<AccountView|null>){
  if(this.state.busy)throw new AccountError('busy');
  ++this.generation;this.update({busy:true,checking:false,error:null});
  try{
   // Drain the one existing read before a cookie-changing request. Ignoring
   // stale JSON alone cannot stop an older HTTP response's Set-Cookie header.
   await this.pendingRefresh;
   const account=await action();this.update({account,busy:false,error:null});
  }
  catch(error){
   const known=error instanceof AccountError?error:new AccountError('network');
   this.update({busy:false,error:known,...(known.reason==='needs-account'||known.reason==='account-disabled'?{account:null}:{})});throw known;
  }
 }
 login(username:string,password:string){return this.change(()=>this.client.login(username,password));}
 register(input:Registration){return this.change(()=>this.client.register(input));}
 logout(){return this.change(async()=>{await this.client.logout();return null;});}
 changePassword(oldPassword:string,password:string){return this.change(async()=>{await this.client.changePassword(oldPassword,password);return null;});}
 resetPassword(token:string,password:string){return this.change(async()=>{await this.client.resetPassword(token,password);return null;});}
}
