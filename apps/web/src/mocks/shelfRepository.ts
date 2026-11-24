// Mock 作品书架 repository: the in-memory shelf of this visit (mocks/workShelf) and the current work. Replaced by a server
// adapter in app/services.ts.
import type {ShelfRepository} from '../pages/works/services/shelfRepository';
import {workSession} from '../shared/creation/workSession';
import {workShelf} from './workShelf';

const subscribeBoth=(listener:()=>void)=>{
 const offShelf=workShelf.subscribe(listener),offSession=workSession.subscribe(listener);
 return()=>{offShelf();offSession();};
};

export const mockShelfRepository:ShelfRepository={
 list:workShelf.list,
 subscribe:subscribeBoth,
 // Nothing to fetch: the shelf of this visit is already here.
 async refresh(){},
 currentId:()=>workSession.current()?.id??null,
 hasUnsavedCurrent(){
  const current=workSession.current();
  if(current?.origin!=='child'||!current.events.length)return false;
  const shelved=workShelf.get(current.id);
  return !shelved||shelved.arrangement.updatedAt!==current.updatedAt||JSON.stringify(shelved.settings)!==JSON.stringify(workSession.settings());
 },
 async open(work){workSession.open(work);},
 async remove(id){return workShelf.remove(id);},
 async rename(id,title){return workShelf.rename(id,title);},
};
