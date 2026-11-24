// 作品书架 for this visit: works the child put on the shelf from 万物成曲. In memory only — a refresh empties it, and
// nothing is uploaded or saved to an account. A server adapter replaces this behind 万物成曲's repository port and the
// shelf page's port; pages never treat this as saved.
import {cleanWorkTitle,parseSavedWork} from '@wanwu-v2/contracts/work';
import type {SavedWork} from '@wanwu-v2/contracts/work';
import type {ShelfSnapshot} from '../pages/works/services/shelfRepository';

export class WorkShelf{
 private works:SavedWork[]=[];
 private listeners=new Set<()=>void>();
 /** Newest first. */
 list=():ShelfSnapshot=>this.works;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 get(id:string){return this.works.find(work=>work.id===id)??null;}
 /** Puts a validated work on the shelf; saving the same work again replaces it and moves it to the front. */
 put(work:SavedWork){
  if(!parseSavedWork(work))return false;
  this.works=[work,...this.works.filter(item=>item.id!==work.id)];
  this.emit();
  return true;
 }
 /** Takes a work off the shelf (the piece being made now, if it is this one, stays as it is). */
 remove(id:string){
  if(!this.get(id))return false;
  this.works=this.works.filter(work=>work.id!==id);this.emit();
  return true;
 }
 /** A new name (same rules as saving); its place on the shelf and its saved time stay. Null when the name is empty. */
 rename(id:string,title:string){
  const clean=cleanWorkTitle(title),work=this.get(id);
  if(!clean||!work)return null;
  const renamed={...work,title:clean};
  this.works=this.works.map(item=>item.id===id?renamed:item);this.emit();
  return renamed;
 }
 private emit(){for(const listener of this.listeners)listener();}
}
export const workShelf=new WorkShelf();
