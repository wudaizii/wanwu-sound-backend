import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import type {WorkRecord,WorkSummary,RenderView,ShareView} from '@wanwu-v2/contracts/cloud';
import type {SavedWork} from '@wanwu-v2/contracts/work';
import {AccountError} from '../account/accountClient';
import {accountErrorText} from '../account/copy';

export type CloudState={accountId:string|null;workId:string|null;title:string;phase:'local'|'uploading'|'saving'|'saved'|'conflict'|'error';
 message:string;busy:boolean;epoch:number;conflictId:string|null;drafts:WorkSummary[];render:RenderView|null;share:ShareView|null;recoverable:boolean;dialog:'drafts'|'library'|'share'|null};
export const initialCloudState:CloudState={accountId:null,workId:null,title:'未命名草稿',phase:'local',message:'访客创作仅保留在本次页面中。',busy:false,epoch:0,conflictId:null,drafts:[],render:null,share:null,recoverable:false,dialog:null};
export function toSavedWork(record:WorkRecord,title=record.title):SavedWork{
 return {version:'work-v1',id:record.id,title,arrangement:record.arrangement,settings:record.settings,
  rendering:{background:'local-rules',prompt:null,rules:{...RULE_VERSIONS}},visibility:'private',share:null,savedAt:record.updatedAt};
}
export function cloudError(error:unknown){
 if(error instanceof AccountError){
  if(error.reason==='account-changed')return '此浏览器的账号已在另一标签页切换，正在重新确认身份；原账号内容会暂存在本页内存。';
  if(error.reason==='version-conflict')return '另一处已经更新了这份作品。本页修改仍保留，请选择重新加载或另存副本。';
  if(error.reason==='source-not-ready')return '声音尚未处理完，或已停止授权；本地修改仍保留。';
  if(error.reason==='not-found')return '资源不存在或不再授权。本页修改仍保留，请检查所用声音。';
  return accountErrorText(error);
 }
 return error instanceof Error?error.message.slice(0,180):'云端操作未完成，本地修改仍保留。';
}
