import {useEffect,useSyncExternalStore} from 'react';
import type {SavedWork} from '@wanwu-v2/contracts/work';
import {services} from '../../../app/services';
import type {ShelfRepository} from '../services/shelfRepository';

/**
 * The shelf as a live list (this visit's works, newest first) plus opening one. Opening would replace a current piece
 * that is the child's own, has sounds and is not on the shelf in its current form — the page asks first in that case.
 */
export function useWorkShelf(repository:ShelfRepository=services.shelfRepository){
 const works=useSyncExternalStore(repository.subscribe,repository.list);
 const current=useSyncExternalStore(repository.subscribe,repository.currentId);
 // Shows the shelf already on this device at once, then whatever the server has.
 useEffect(()=>{void repository.refresh();},[repository]);
 return {
  works,currentId:current,
  /** True when opening `work` would lose an unsaved current piece. */
  wouldReplace:(work:SavedWork)=>repository.hasUnsavedCurrent()&&repository.currentId()!==work.id,
  open:(work:SavedWork)=>repository.open(work),
  remove:(id:string)=>repository.remove(id),
  rename:(id:string,title:string)=>repository.rename(id,title),
 };
}
