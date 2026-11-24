import type {LibraryEntry} from '@wanwu-v2/contracts/cloud';
import type {CookieAccountClient,ApiResult} from '../account/accountClient';
import {AccountError} from '../account/accountClient';
import {parsePage,parseLibraryEntry} from '@wanwu-v2/contracts/cloud';

export async function libraryEntries(api:CookieAccountClient,path:'sources'|'sound-units',scope:'mine'|'teachers'){
 const items:LibraryEntry[]=[];let cursor:string|null=null;
 do{
  const response:ApiResult=await api.business(`/api/v1/${path}?scope=${scope}${cursor?`&cursor=${cursor}`:''}`);
  const page:{items:LibraryEntry[];nextCursor:string|null}|null=parsePage(response.data,parseLibraryEntry);
  if(!page)throw new AccountError('bad-response');items.push(...page.items);cursor=page.nextCursor;
 }while(cursor&&items.length<1000);
 return items;
}
