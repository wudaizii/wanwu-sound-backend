import {exactObject,parseAccountView} from '@wanwu-v2/contracts/account';
import type {AccountView} from '@wanwu-v2/contracts/account';
import {parseApiFailure} from '@wanwu-v2/contracts/api';
import type {ApiErrorReason} from '@wanwu-v2/contracts/api';

type ClientReason=ApiErrorReason|'network'|'timeout'|'bad-response';
export class AccountError extends Error{
 readonly reason:ClientReason;readonly status:number;readonly retryAfter:number|null;
 constructor(reason:ClientReason,status=0,retryAfter:number|null=null){super(reason);this.name='AccountError';this.reason=reason;this.status=status;this.retryAfter=retryAfter;}
}
export type Registration={invitationCode:string;username:string;password:string};
export interface AccountClient{
 onSessionInvalidation?(listener:()=>void):()=>void;
 me():Promise<AccountView>;
 login(username:string,password:string):Promise<AccountView>;
 register(input:Registration):Promise<AccountView>;
 logout():Promise<void>;
 changePassword(oldPassword:string,password:string):Promise<void>;
 resetPassword(token:string,password:string):Promise<void>;
}
type Fetcher=(input:string,init:RequestInit)=>Promise<Response>;
export type ApiMethod='GET'|'POST'|'PUT'|'PATCH'|'DELETE';
export type ApiResult<T=unknown>={data:T;status:number;etag:string|null};
const validToken=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);

/** Same-origin cookies only. No browser storage, cross-origin endpoint override or identity headers. */
export class CookieAccountClient implements AccountClient{
 private csrf:string|null=null;
 private pendingCsrf:Promise<string>|null=null;
 private lane:Promise<void>=Promise.resolve();
 private businessAccount:string|null=null;
 private invalidation=new Set<()=>void>();
 private readonly fetcher:Fetcher;private readonly timeoutMs:number;
 constructor(fetcher:Fetcher=(input,init)=>fetch(input,init),timeoutMs=20_000){this.fetcher=fetcher;this.timeoutMs=timeoutMs;}
 setBusinessAccount(id:string|null){this.businessAccount=id;}
 onSessionInvalidation(listener:()=>void){this.invalidation.add(listener);return()=>{this.invalidation.delete(listener);};}
 private async wire(path:string,method:ApiMethod,body:unknown,csrf?:string,etag?:string,expectedAccount?:string):Promise<ApiResult>{
  const previous=this.lane;let release!:()=>void;this.lane=new Promise<void>(done=>{release=done;});await previous;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),this.timeoutMs);
  try{
   if(expectedAccount&&this.businessAccount!==expectedAccount)throw new AccountError('needs-account');
   const response=await this.fetcher(path,{method,credentials:'same-origin',
    cache:'no-store',redirect:'error',signal:abort.signal,headers:{Accept:'application/json',
     ...(method==='GET'?{}:{'X-CSRF-Token':csrf??''}),...(expectedAccount?{'If-Account-Match':expectedAccount}:{}),...(etag?{'If-Match':etag}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
   let data:unknown;
   if(response.status!==204){try{data=await response.json();}catch{throw new AccountError('bad-response',response.status);}}
   if(!response.ok){
    const failure=parseApiFailure(data);
    if(failure?.reason==='csrf-failed'||response.status===401)this.csrf=null;
    const wait=Number(response.headers.get('Retry-After'));
    throw new AccountError(failure?.reason??'bad-response',response.status,Number.isFinite(wait)&&wait>0?Math.min(3600,Math.ceil(wait)):null);
   }
   if(![200,201,202,204].includes(response.status))throw new AccountError('bad-response',response.status);
   return {data,status:response.status,etag:response.headers.get('ETag')};
  }catch(error){
   if(error instanceof AccountError)throw error;
   throw new AccountError(abort.signal.aborted?'timeout':'network');
  }finally{clearTimeout(timer);release();}
 }
 private async request(path:string,body?:Record<string,unknown>,csrf?:string,empty=false):Promise<unknown>{
  const result=await this.wire(`/api/v1/auth/${path}`,body===undefined?'GET':'POST',body,csrf);
  if(result.status!==(empty?204:path==='register'?201:200))throw new AccountError('bad-response',result.status);return result.data;
 }
 /** Business calls share the same serialized Cookie lane with login/logout and refresh. */
 async business<T=unknown>(path:string,method:ApiMethod='GET',body?:unknown,etag?:string):Promise<ApiResult<T>>{
  if(!path.startsWith('/api/v1/')||path.includes('..')||path.includes('#')||path.startsWith('/api/v1/auth/'))throw new AccountError('invalid-request');
  const account=this.businessAccount;if(!account)throw new AccountError('needs-account');
  const csrf=method==='GET'?undefined:await this.csrfToken();
  try{return await this.wire(path,method,body,csrf,etag,account) as ApiResult<T>;}
  catch(error){if(error instanceof AccountError&&['needs-account','account-disabled','account-changed'].includes(error.reason))for(const listener of this.invalidation)queueMicrotask(listener);throw error;}
 }
 private csrfToken():Promise<string>{
  if(this.csrf)return Promise.resolve(this.csrf);
  if(this.pendingCsrf)return this.pendingCsrf;
  this.pendingCsrf=this.request('csrf').then(value=>{
   if(!exactObject(value,['csrfToken'])||!validToken(value.csrfToken))throw new AccountError('bad-response');
   return this.csrf=value.csrfToken;
  }).finally(()=>{this.pendingCsrf=null;});
  return this.pendingCsrf;
 }
 private async establish(path:'login'|'register',body:Record<string,unknown>){
  const value=await this.request(path,body,await this.csrfToken());
  if(!exactObject(value,['account','csrfToken'])||!validToken(value.csrfToken))throw new AccountError('bad-response');
  const account=parseAccountView(value.account);if(!account||account.status!=='active')throw new AccountError('bad-response');
  this.csrf=value.csrfToken;return account;
 }
 async me(){
  const value=await this.request('me');
  if(!exactObject(value,['account']))throw new AccountError('bad-response');
  const account=parseAccountView(value.account);if(!account||account.status!=='active')throw new AccountError('bad-response');return account;
 }
 login(username:string,password:string){return this.establish('login',{username,password});}
 register(input:Registration){return this.establish('register',input);}
 private async clearSession(path:string,body:Record<string,unknown>){
  await this.request(path,body,await this.csrfToken(),true);this.csrf=null;
 }
 logout(){return this.clearSession('logout',{});}
 changePassword(oldPassword:string,password:string){return this.clearSession('change-password',{oldPassword,password});}
 resetPassword(token:string,password:string){return this.clearSession('reset-password',{token,password});}
}
