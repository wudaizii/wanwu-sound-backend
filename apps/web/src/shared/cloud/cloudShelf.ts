import type {SavedWork} from '@wanwu-v2/contracts/work';
import type {WorkSummary} from '@wanwu-v2/contracts/cloud';
import {workEtag,parsePage,parseWorkSummary} from '@wanwu-v2/contracts/cloud';
import {AccountError} from '../account/accountClient';
import type {ApiResult} from '../account/accountClient';
import type {ShelfRepository} from '../../pages/works/services/shelfRepository';
import {workSession} from '../creation/workSession';
import type {CloudWorkspace} from './cloudWorkspace';
import {checkedWork} from './workspacePersistence';
import {toSavedWork,cloudError} from './cloudTypes';

export class CloudShelf implements ShelfRepository{
 private readonly workspace:CloudWorkspace;private readonly local:ShelfRepository;
 private items:readonly SavedWork[]=[];private listeners=new Set<()=>void>();private account:string|null=null;
 constructor(workspace:CloudWorkspace,local:ShelfRepository){this.workspace=workspace;this.local=local;
  const emit=()=>{const account=workspace.state.accountId;if(account!==this.account){this.account=account;this.items=[];}for(const listener of this.listeners)listener();};
  workspace.subscribe(emit);local.subscribe(emit);
 }
 list=()=>this.workspace.state.accountId?this.items:this.local.list();
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 currentId=()=>workSession.current()?.id??null;
 hasUnsavedCurrent=()=>{const current=workSession.current();if(!current||current.origin!=='child')return false;const saved=this.list().find(work=>work.id===current.id);
  return !saved||saved.arrangement.updatedAt!==current.updatedAt||JSON.stringify(saved.settings)!==JSON.stringify(workSession.settings());};
 async refresh(){
  if(!this.workspace.state.accountId){await this.local.refresh();return;}
  const account=this.workspace.state.accountId,items:SavedWork[]=[];let cursor:string|null=null;
  try{
   do{
    const response:ApiResult=await this.workspace.api.business(`/api/v1/works?owner=me&state=saved${cursor?`&cursor=${cursor}`:''}`);
    const page:{items:WorkSummary[];nextCursor:string|null}|null=parsePage(response.data,parseWorkSummary);if(!page)throw new AccountError('bad-response');
    for(const summary of page.items){if(!summary.savedRevision)throw new AccountError('bad-response');
     const result=await this.workspace.api.business(`/api/v1/works/${encodeURIComponent(summary.id)}?revision=${summary.savedRevision}`);
     items.push(toSavedWork(checkedWork(result.data),summary.title));
    }cursor=page.nextCursor;
   }while(cursor&&items.length<1000);
   if(this.workspace.state.accountId!==account)return;this.items=items;for(const listener of this.listeners)listener();
  }catch(error){if(this.workspace.state.accountId===account)this.workspace.update({phase:'error',message:cloudError(error)});}
 }
 async open(work:SavedWork){if(this.workspace.state.accountId)await this.workspace.open(work.id);else await this.local.open(work);}
 async remove(id:string){if(!this.workspace.state.accountId)return this.local.remove(id);
  try{const current=checkedWork((await this.workspace.api.business(`/api/v1/works/${encodeURIComponent(id)}`)).data);
   await this.workspace.api.business(`/api/v1/works/${encodeURIComponent(id)}`,'DELETE',undefined,workEtag(id,current.revision));
   if(this.workspace.record?.id===id){this.workspace.record=null;this.workspace.update({workId:null,phase:'local',message:'云端作品已删除，分享已撤销；当前本地修改仍保留。'});}
   await this.refresh();return true;
  }catch(error){this.workspace.update({phase:'error',message:cloudError(error)});return false;}
 }
 async rename(id:string,title:string){if(!this.workspace.state.accountId)return this.local.rename(id,title);
  const account=this.workspace.state.accountId,active=this.workspace.record?.id===id&&workSession.current()?.id===id;
  try{
   // Never adopt another device's revision underneath unsaved local content just to rename a shelf item.
   if(active)await this.workspace.rename(title);
   else{const current=checkedWork((await this.workspace.api.business(`/api/v1/works/${encodeURIComponent(id)}`)).data);
    await this.workspace.api.business(`/api/v1/works/${encodeURIComponent(id)}`,'PATCH',{title},workEtag(id,current.revision));}
   if(this.workspace.state.accountId!==account)return null;
   await this.refresh();return this.items.find(work=>work.id===id)??null;
  }catch(error){if(!active&&this.workspace.state.accountId===account)this.workspace.update({phase:'error',message:cloudError(error)});return null;}
 }
}
