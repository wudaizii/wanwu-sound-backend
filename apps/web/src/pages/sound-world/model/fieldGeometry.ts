// Converts between the field's business coordinates (0–1 time + row) and the current layout. Only this file knows
// about pixels; the stored arrangement never does, so phone, desktop and the later score agree on order.
import {clampAt} from './soundWorldState.ts';

/** at = 0 / 1 sit this far in from the field edges, so a marker at either end stays fully visible. */
export const FIELD_INSET=.06;
/** Pointer slack around the field: a drop just outside the edge still lands on the nearest spot. */
const SLACK_PX=24;

export type Box={left:number;top:number;width:number;height:number};

/** Spot under a pointer, or null when the pointer is clearly outside the field. */
export function locateSpot(box:Box,rows:number,x:number,y:number):{at:number;row:number}|null{
 if(x<box.left-SLACK_PX||x>box.left+box.width+SLACK_PX||y<box.top-SLACK_PX||y>box.top+box.height+SLACK_PX)return null;
 const at=clampAt(((x-box.left)/box.width-FIELD_INSET)/(1-2*FIELD_INSET));
 const row=Math.min(rows-1,Math.max(0,Math.floor((y-box.top)/(box.height/rows))));
 return {at,row};
}

/** Percent position of a spot's centre inside the field. */
export function spotPosition(spot:{at:number;row:number},rows:number){
 return {left:timePosition(spot.at),top:`${(spot.row+.5)/rows*100}%`};
}
export function timePosition(at:number){return `${(FIELD_INSET+at*(1-2*FIELD_INSET))*100}%`;}
