import {useRef,useState} from 'react';
import type {MouseEvent,PointerEvent} from 'react';
import type {FieldSpot} from './useSoundWorld';

export type DragItem={kind:'unit';unitId:string}|{kind:'event';eventId:string};
export type DragState={item:DragItem;x:number;y:number;spot:FieldSpot|null}|null;

/** Movement before a press counts as a drag; below it, the press is a tap (select). */
const DRAG_THRESHOLD_PX=8;

/**
 * Dragging is an equal alternative to tap-then-tap, never the only way. A press that moves past the threshold drags;
 * otherwise the normal click (also fired by keyboard) selects. The click right after a drag is swallowed.
 */
export function useFieldDrag(locate:(x:number,y:number)=>FieldSpot|null,onDrop:(item:DragItem,spot:FieldSpot)=>void,onTap:(item:DragItem)=>void){
 const [drag,setDrag]=useState<DragState>(null);
 const press=useRef<{item:DragItem;x:number;y:number;pointer:number;moved:boolean}|null>(null);
 const swallowClick=useRef(false);

 const bind=(item:DragItem)=>({
  onPointerDown:(event:PointerEvent<HTMLElement>)=>{
   if(event.button!==0)return;
   press.current={item,x:event.clientX,y:event.clientY,pointer:event.pointerId,moved:false};
  },
  onPointerMove:(event:PointerEvent<HTMLElement>)=>{
   const current=press.current;if(!current||current.pointer!==event.pointerId)return;
   if(!current.moved){
    if(Math.hypot(event.clientX-current.x,event.clientY-current.y)<DRAG_THRESHOLD_PX)return;
    current.moved=true;
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* pointer already gone; the drag still ends on pointerup */}
   }
   setDrag({item,x:event.clientX,y:event.clientY,spot:locate(event.clientX,event.clientY)});
  },
  onPointerUp:(event:PointerEvent<HTMLElement>)=>{
   const current=press.current;press.current=null;
   if(!current?.moved)return;
   swallowClick.current=true;setDrag(null);
   const spot=locate(event.clientX,event.clientY);
   if(spot)onDrop(item,spot);
  },
  onPointerCancel:()=>{press.current=null;setDrag(null);},
  onClick:(event:MouseEvent<HTMLElement>)=>{
   if(swallowClick.current){swallowClick.current=false;event.preventDefault();return;}
   onTap(item);
  },
 });
 return {drag,bind};
}
