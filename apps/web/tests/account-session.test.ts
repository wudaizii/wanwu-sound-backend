import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAccountView} from '@wanwu-v2/contracts/account';
import {CookieAccountClient,AccountError} from '../src/shared/account/accountClient.ts';
import type {AccountClient} from '../src/shared/account/accountClient.ts';
import {AccountSession} from '../src/shared/account/accountSession.ts';
import {emptyAccountDraft,validateAccountForm} from '../src/shared/account/formValidation.ts';
import {resetLinkToken} from '../src/shared/account/resetLink.ts';

const account={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',username:'teacher',nickname:'老师',role:'teacher' as const,status:'active' as const};
const token='a'.repeat(43),nextToken='b'.repeat(43),password='这是一段测试密码 With spaces_123';
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const fail=(reason:string,status=400)=>json({status:'error',reason,requestId:'disposable-test'},status);
const deferred=<T>()=>{let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const fakeClient=(changes:Partial<AccountClient>={}):AccountClient=>({me:async()=>account,login:async()=>account,register:async()=>account,
 logout:async()=>{},changePassword:async()=>{},resetPassword:async()=>{},...changes});
const reason=(expected:string)=>(error:unknown)=>error instanceof AccountError&&error.reason===expected;

test('account response is an exact minimal contract, never a form-provided role',()=>{
 assert.deepEqual(parseAccountView(account),account);
 for(const invalid of [{...account,username:null},{...account,username:'Teacher'},{...account,id:'1'},
  {...account,role:'owner'},{...account,passwordHash:'not-public'},{...account,username:undefined},{...account,nickname:'x'.repeat(65)},[]])assert.equal(parseAccountView(invalid),null);
});
test('cookie adapter uses relative same-origin requests and rotates CSRF without storing auth tokens',async()=>{
 const calls:{path:string;init:RequestInit}[]=[];
 const client=new CookieAccountClient(async(path,init)=>{
  calls.push({path,init});
  if(path.endsWith('/csrf'))return json({csrfToken:token});
  if(path.endsWith('/login'))return json({account,csrfToken:nextToken});
  if(path.endsWith('/logout'))return new Response(null,{status:204});
  return json({account});
 });
 assert.deepEqual(await client.login('Teacher',password),account);await client.logout();await client.login('teacher',password);
 assert.deepEqual(calls.map(c=>c.path),['/api/v1/auth/csrf','/api/v1/auth/login','/api/v1/auth/logout','/api/v1/auth/csrf','/api/v1/auth/login']);
 assert.deepEqual(JSON.parse(calls[1]!.init.body as string),{username:'Teacher',password});
 assert.equal((calls[1]!.init.headers as Record<string,string>)['X-CSRF-Token'],token);
 assert.equal((calls[2]!.init.headers as Record<string,string>)['X-CSRF-Token'],nextToken);
 for(const {init} of calls){assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
  assert.equal(Object.keys(init.headers!).some(key=>/authorization|cookie|user-id|role/i.test(key)),false);}
});
test('registration and password maintenance submit only the agreed fields',async()=>{
 const bodies:{path:string;body:unknown}[]=[];
 const client=new CookieAccountClient(async(path,init)=>{
  if(path.endsWith('/csrf'))return json({csrfToken:token});
  bodies.push({path,body:JSON.parse(init.body as string)});
  return path.endsWith('/register')?json({account,csrfToken:nextToken},201):new Response(null,{status:204});
 });
 await client.register({username:'teacher',password,invitationCode:token});await client.changePassword(password,password+'2');await client.resetPassword(nextToken,password);
 assert.deepEqual(bodies.map(row=>row.body),[{username:'teacher',password,invitationCode:token},{oldPassword:password,password:password+'2'},{token:nextToken,password}]);
});
test('CSRF failure does not retry a write and obtains a fresh token on the next deliberate attempt',async()=>{
 let csrf=0,writes=0;
 const client=new CookieAccountClient(async path=>path.endsWith('/csrf')?(csrf++,json({csrfToken:token})):(writes++,fail('csrf-failed',403)));
 await assert.rejects(client.login('teacher',password),reason('csrf-failed'));assert.equal(writes,1);
 await assert.rejects(client.login('teacher',password),reason('csrf-failed'));assert.equal(writes,2);assert.equal(csrf,2);
});
test('missing API, malformed success and invalid error bodies never become fake login success',async()=>{
 const responses=[new Response('<!doctype html>'),json({account:{...account,role:'forged'},csrfToken:token}),json({account,csrfToken:token},202),
  json({status:500,reason:'not-open',requestId:'x'},500),json({account,csrfToken:'short'}),json({...account,password:'not-allowed'})];
 for(const response of responses){const client=new CookieAccountClient(async path=>path.endsWith('/csrf')?json({csrfToken:token}):response);
  await assert.rejects(client.login('teacher',password),reason('bad-response'));}
});
test('valid failures and bounded Retry-After survive without exposing response content',async()=>{
 const client=new CookieAccountClient(async()=>json({status:'error',reason:'rate-limited',requestId:'test-id'},429,{'Retry-After':'17'}));
 await assert.rejects(client.me(),error=>error instanceof AccountError&&error.retryAfter===17&&error.message==='rate-limited');
 await assert.rejects(new CookieAccountClient(async()=>fail('not-open',503)).me(),reason('not-open'));
});
test('timeout and network failure are explicit and never automatically resubmit a registration',async()=>{
 let calls=0;
 const client=new CookieAccountClient(async(_path,init)=>{calls++;return new Promise<Response>((_resolve,reject)=>init.signal!.addEventListener('abort',()=>reject(new Error('private transport detail')),{once:true}));},5);
 await assert.rejects(client.register({username:'teacher',password,invitationCode:token}),reason('timeout'));assert.equal(calls,1);
 await assert.rejects(new CookieAccountClient(async()=>{throw new Error('a signed URL that must not escape');}).me(),error=>
  error instanceof AccountError&&error.reason==='network'&&!error.message.includes('URL'));
});
test('a slow initial read drains before login so its stale Set-Cookie cannot undo the new session',async()=>{
 const late=deferred<typeof account>();let writes=0;
 const session=new AccountSession(fakeClient({me:()=>late.promise,login:async()=>{writes++;return account;}}));
 const loading=session.refresh(),signingIn=session.login('teacher',password);await Promise.resolve();assert.equal(writes,0);
 late.reject(new AccountError('needs-account',401));await loading;await signingIn;assert.equal(writes,1);
 assert.deepEqual(session.getSnapshot().account,account);assert.equal(session.getSnapshot().error,null);assert.equal(session.getSnapshot().checking,false);
});
test('overlapping refreshes are coalesced rather than racing rolling cookie writes',async()=>{
 const first=deferred<typeof account>();let calls=0;
 const session=new AccountSession(fakeClient({me:()=>{calls++;return first.promise;}}));
 const one=session.refresh(),two=session.refresh();assert.equal(calls,1);first.reject(new AccountError('needs-account',401));await one;await two;
 assert.equal(session.getSnapshot().account,null);assert.equal(session.getSnapshot().checking,false);
});
test('pending mutations exclude duplicate submissions and stale background refreshes',async()=>{
 const pending=deferred<typeof account>();let writes=0,reads=0;
 const session=new AccountSession(fakeClient({register:async()=>{writes++;return pending.promise;},me:async()=>{reads++;return account;}}));
 const one=session.register({username:'teacher',password,invitationCode:token});await session.refresh();
 await assert.rejects(session.register({username:'teacher',password,invitationCode:token}),reason('busy'));
 assert.equal(writes,1);assert.equal(reads,0);pending.resolve(account);await one;assert.equal(session.getSnapshot().busy,false);
});
test('logout failure retains the last known account instead of reporting false success',async()=>{
 const session=new AccountSession(fakeClient({logout:async()=>{throw new AccountError('network');}}));await session.refresh();
 await assert.rejects(session.logout(),reason('network'));assert.equal(session.getSnapshot().account?.id,account.id);assert.equal(session.getSnapshot().busy,false);
});
test('expired or disabled accounts are cleared, temporary transport failure retains a marked last-known view',async()=>{
 let error:AccountError|null=null;
 const session=new AccountSession(fakeClient({me:async()=>{if(error)throw error;return account;}}));await session.refresh();
 error=new AccountError('network');await session.refresh();assert.equal(session.getSnapshot().account?.id,account.id);assert.equal(session.getSnapshot().error,error);
 error=new AccountError('account-disabled',401);await session.refresh();assert.equal(session.getSnapshot().account,null);
});
test('successful logout, password change and reset clear the local view only after server completion',async()=>{
 for(const action of ['logout','changePassword','resetPassword'] as const){const session=new AccountSession(fakeClient());await session.refresh();
  if(action==='logout')await session.logout();else if(action==='changePassword')await session.changePassword(password,password);else await session.resetPassword(token,password);
  assert.equal(session.getSnapshot().account,null);assert.equal(session.getSnapshot().error,null);}
});
test('account forms validate username, invitation and Unicode password without trimming the password',()=>{
 const draft={...emptyAccountDraft(),username:'Teacher_1',invitationCode:` ${token} `,password,confirmation:password};
 assert.equal(validateAccountForm('register',draft),null);assert.equal(validateAccountForm('login',{...draft,password:'a'}),null);
 assert.ok(validateAccountForm('register',{...draft,password:'short',confirmation:'short'}));
 assert.ok(validateAccountForm('register',{...draft,username:'老师'}));assert.ok(validateAccountForm('register',{...draft,invitationCode:'short'}));
 assert.ok(validateAccountForm('change',draft));assert.ok(validateAccountForm('reset',{...draft,confirmation:password+' '}));
 assert.ok(validateAccountForm('reset',{...draft,password:' '.repeat(15),confirmation:' '.repeat(15)}));
 const twelve='Abcdefgh_123';
 assert.equal(validateAccountForm('register',{...draft,password:twelve,confirmation:twelve}),null);
 for(const candidate of ['Abcdefg_123','abcdefgh_123','ABCDEFGH_123','Abcdefgh____','Abcdefgh1234']){
  for(const mode of ['register','change','reset'] as const)assert.ok(validateAccountForm(mode,{...draft,oldPassword:password,password:candidate,confirmation:candidate}));
 }
});
test('reset tokens come only from one valid URL-fragment field',()=>{
 assert.equal(resetLinkToken(`#token=${token}`),token);
 for(const invalid of ['','token=short',`#token=${token}&token=${token}`,`#token=${token}&account=1`,`#access_token=${token}`,'#token=%00'])assert.equal(resetLinkToken(invalid),null);
});
