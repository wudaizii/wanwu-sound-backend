// Playful icon set for the work pages: chunky rounded strokes, a soft inner tint and a small white shine.
// The home page keeps its fine-line Icon set; these are for 声音诞生 and the steps after it.
import type {ReactNode} from 'react';

export type KidIconName='mic'|'upload'|'library'|'camera'|'pitch'|'duration'|'contour'|'intensity'|'pattern'
 |'play'|'stop'|'check'|'edit'|'back'|'arrow'|'shelf'|'sounds'|'replay'|'plus'|'trash'
 |'trim'|'copy'|'pause'|'restart'|'clock'|'book'|'note'|'volume'|'bulb'|'save'|'lock'|'star'|'share';

const tint={fill:'currentColor',fillOpacity:.24} as const;
const shine={fill:'none',stroke:'#fff',strokeOpacity:.9,strokeWidth:2} as const;
const BLUSH='#ff9fb1';
/** A tiny friendly face: two dot eyes, a smile and optional blush — the detail that makes the set feel like a children's app. */
function face(cx:number,cy:number,size=1,blush=true){
 const e=2.4*size,r=.95*size;
 return <g stroke="none">
  <circle cx={cx-e} cy={cy} r={r} fill="currentColor"/><circle cx={cx+e} cy={cy} r={r} fill="currentColor"/>
  <path d={`M${cx-1.3*size} ${cy+1.7*size}q${1.3*size} ${1.2*size} ${2.6*size} 0`} fill="none" stroke="currentColor" strokeWidth={1.3*size} strokeLinecap="round"/>
  {blush&&<><circle cx={cx-e-1.5*size} cy={cy+1.6*size} r={.95*size} fill={BLUSH}/><circle cx={cx+e+1.5*size} cy={cy+1.6*size} r={.95*size} fill={BLUSH}/></>}
 </g>;
}
/** Four-point sparkle. */
const sparkle=(x:number,y:number,s=1)=><path d={`M${x} ${y-2.6*s}q${.4*s} ${2.2*s} ${2.6*s} ${2.6*s}q${-2.2*s} ${.4*s} ${-2.6*s} ${2.6*s}q${-.4*s} ${-2.2*s} ${-2.6*s} ${-2.6*s}q${2.2*s} ${-.4*s} ${2.6*s} ${-2.6*s}z`} fill="currentColor" stroke="none"/>;

const shapes:Record<KidIconName,ReactNode>={
 mic:<>
  <rect x="11" y="3.5" width="10" height="16.5" rx="5" {...tint}/><rect x="11" y="3.5" width="10" height="16.5" rx="5" fill="none"/>
  <path d="M13.8 7v2.5" {...shine}/>{face(16,12.2,.8)}
  <path d="M7 15a9 9 0 0 0 18 0M16 24v4M12 28h8" fill="none"/>
 </>,
 upload:<>
  <path d="M9.5 24h13.5a5.2 5.2 0 0 0 .7-10.35A7.6 7.6 0 0 0 9.4 12a6 6 0 0 0 .1 12z" {...tint}/>
  <path d="M9.5 24h13.5a5.2 5.2 0 0 0 .7-10.35A7.6 7.6 0 0 0 9.4 12a6 6 0 0 0 .1 12z" fill="none"/>
  {face(15.5,18.2,.9)}<path d="M25.5 3.5v6m-2.5-2.5 2.5-2.5 2.5 2.5" fill="none" strokeWidth={2}/>
 </>,
 library:<>
  <path d="M4.5 8.5c3.8-1.6 7.6-1.4 11.5 1 3.9-2.4 7.7-2.6 11.5-1v17c-3.8-1.6-7.6-1.4-11.5 1-3.9-2.4-7.7-2.6-11.5-1z" {...tint}/>
  <path d="M4.5 8.5c3.8-1.6 7.6-1.4 11.5 1 3.9-2.4 7.7-2.6 11.5-1v17c-3.8-1.6-7.6-1.4-11.5 1-3.9-2.4-7.7-2.6-11.5-1zM16 9.5v17" fill="none"/>
  <circle cx="21" cy="19.5" r="1.9" fill="currentColor" stroke="none"/><path d="M22.8 19.5v-6.2l2.4-.9" fill="none"/>
  <path d="M8 13h4" {...shine}/>{sparkle(27.5,4.5,.9)}
 </>,
 camera:<>
  <path d="M4.5 11.5a3 3 0 0 1 3-3h3.2l2-3h6.6l2 3h3.2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" {...tint}/>
  <path d="M4.5 11.5a3 3 0 0 1 3-3h3.2l2-3h6.6l2 3h3.2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="none"/>
  <circle cx="16" cy="17.5" r="5" fill="#fff"/><circle cx="16" cy="17.5" r="2.2" fill="currentColor" stroke="none"/>
  <circle cx="13.6" cy="15.6" r="1" fill="#fff" stroke="none"/>{sparkle(25,12,.75)}
  <circle cx="8.6" cy="21" r="1.1" fill={BLUSH} stroke="none"/><circle cx="23.4" cy="21" r="1.1" fill={BLUSH} stroke="none"/>
 </>,
 pitch:<>
  <rect x="4.5" y="18" width="6" height="9.5" rx="3" {...tint}/><rect x="13" y="12" width="6" height="15.5" rx="3" {...tint}/><rect x="21.5" y="5.5" width="6" height="22" rx="3" {...tint}/>
  <rect x="4.5" y="18" width="6" height="9.5" rx="3" fill="none"/><rect x="13" y="12" width="6" height="15.5" rx="3" fill="none"/><rect x="21.5" y="5.5" width="6" height="22" rx="3" fill="none"/>
  {face(24.5,10.5,.62,false)}{sparkle(9,9,.8)}
 </>,
 duration:<>
  <circle cx="7.5" cy="18" r="3.6" {...tint}/><circle cx="13" cy="18" r="3.6" {...tint}/><circle cx="18.5" cy="18" r="3.6" {...tint}/><circle cx="24.5" cy="16" r="4.6" {...tint}/>
  <circle cx="7.5" cy="18" r="3.6" fill="none"/><circle cx="13" cy="18" r="3.6" fill="none"/><circle cx="18.5" cy="18" r="3.6" fill="none"/><circle cx="24.5" cy="16" r="4.6" fill="#fff"/>
  {face(24.6,16,.62)}<path d="M22.5 11.6l-1.2-3M26.5 11.6l1.2-3" fill="none" strokeWidth={1.6}/>
 </>,
 contour:<>
  <path d="M3.5 20.5c2.6-6.5 5.6-6.5 8.2 0s5.6 6.5 8.2 0" fill="none" strokeWidth={2.8}/>
  <circle cx="24.5" cy="16.5" r="5" {...tint}/><circle cx="24.5" cy="16.5" r="5" fill="none"/>{face(24.6,16.2,.7)}
 </>,
 intensity:<>
  <path d="M5.5 12h4l6.5-5.5v19L9.5 20h-4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5.5 12z" {...tint}/>
  <path d="M5.5 12h4l6.5-5.5v19L9.5 20h-4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5.5 12z" fill="none"/>
  <path d="M20.5 12.5c1.8 2 1.8 5 0 7M24 9c3.8 4 3.8 10 0 14" fill="none"/>{sparkle(28.5,5.5,.7)}
 </>,
 pattern:<>
  <circle cx="7" cy="19.5" r="3" {...tint}/><circle cx="15.5" cy="16.5" r="4" {...tint}/><circle cx="25" cy="12.5" r="5" {...tint}/>
  <circle cx="7" cy="19.5" r="3" fill="none"/><circle cx="15.5" cy="16.5" r="4" fill="none"/><circle cx="25" cy="12.5" r="5" fill="none"/>
  {face(25,12.6,.75)}{sparkle(9,9.5,.75)}
 </>,
 play:<path d="M11 8.3c0-1.7 1.9-2.7 3.3-1.8l10.6 7.3c1.3.9 1.3 2.8 0 3.7L14.3 24.8c-1.4 1-3.3-.1-3.3-1.8z" fill="currentColor" stroke="none"/>,
 stop:<rect x="8" y="8" width="16" height="16" rx="4.5" fill="currentColor" stroke="none"/>,
 check:<path d="M7.5 16.5l5.2 5.2L24.5 10" fill="none" strokeWidth={3.2}/>,
 edit:<>
  <path d="M7 25.5l1.6-6.3L20.4 7.4a2.6 2.6 0 0 1 3.7 0l.9.9a2.6 2.6 0 0 1 0 3.7L13.2 23.8z" {...tint}/>
  <path d="M7 25.5l1.6-6.3L20.4 7.4a2.6 2.6 0 0 1 3.7 0l.9.9a2.6 2.6 0 0 1 0 3.7L13.2 23.8zM18.2 9.6l4.6 4.6" fill="none"/>
 </>,
 back:<path d="M26.5 16H6.5m6.5-6.5L6.5 16l6.5 6.5" fill="none" strokeWidth={2.6}/>,
 arrow:<path d="M5.5 16h20m-6.5-6.5 6.5 6.5-6.5 6.5" fill="none" strokeWidth={2.6}/>,
 shelf:<>
  <rect x="5" y="6" width="7" height="20" rx="2.5" {...tint}/><rect x="14" y="9.5" width="6.5" height="16.5" rx="2.5" {...tint}/>
  <rect x="5" y="6" width="7" height="20" rx="2.5" fill="none"/><rect x="14" y="9.5" width="6.5" height="16.5" rx="2.5" fill="none"/>
  <path d="M22.5 11.2l3.4-1 3.3 14.6-3.4 1z" fill="none"/><path d="M7.5 10v3" {...shine}/>{face(8.5,16.5,.6,false)}
 </>,
 sounds:<path d="M6 14v4M11 10v12M16 6v20M21 10v12M26 14v4" fill="none" strokeWidth={2.8}/>,
 replay:<path d="M7.5 12.5A9.5 9.5 0 1 1 7 19.5M7.5 5.5v7h7" fill="none" strokeWidth={2.4}/>,
 plus:<path d="M16 7v18M7 16h18" fill="none" strokeWidth={2.8}/>,
 trim:<>
  <path d="M12.2 19.6 23.6 4.8M19.8 19.6 8.4 4.8" fill="none" strokeWidth={3}/>
  <circle cx="9" cy="23.4" r="4.6" fill="currentColor" stroke="none"/><circle cx="23" cy="23.4" r="4.6" fill="currentColor" stroke="none"/>
  <circle cx="9" cy="23.4" r="1.7" fill="#fff" stroke="none"/><circle cx="23" cy="23.4" r="1.7" fill="#fff" stroke="none"/>
 </>, // Solid tool icons (万物声场): filled shapes with white details — no hollow outlines.
 trash:<>
  <rect x="6" y="7.2" width="20" height="3.6" rx="1.8" fill="currentColor" stroke="none"/><path d="M13 7.2V6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 19 6v1.2z" fill="currentColor" stroke="none"/>
  <path d="M8.4 12.4h15.2l-1.3 13.2a2.6 2.6 0 0 1-2.6 2.4h-7.4a2.6 2.6 0 0 1-2.6-2.4z" fill="currentColor" stroke="none"/>
  <path d="M13.2 16v7.6M18.8 16v7.6" fill="none" stroke="#fff" strokeWidth={2}/>
 </>,
 copy:<>
  <rect x="5" y="4.5" width="15.5" height="18" rx="4" fill="currentColor" fillOpacity={.42} stroke="none"/>
  <rect x="11.5" y="9.5" width="15.5" height="18" rx="4" fill="currentColor" stroke="none"/>
  <path d="M19.25 14.6v7.8M15.35 18.5h7.8" fill="none" stroke="#fff" strokeWidth={2.4}/>
 </>,
 pause:<><rect x="8.5" y="7" width="5.6" height="18" rx="2.6" fill="currentColor" stroke="none"/><rect x="17.9" y="7" width="5.6" height="18" rx="2.6" fill="currentColor" stroke="none"/></>,
 // Solid icons for 万物成曲 and 作品书架: filled shapes with white details, never a hollow outline.
 restart:<>
  <circle cx="16" cy="16" r="12.5" fill="currentColor" stroke="none"/>
  <path d="M10.6 17.4a5.6 5.6 0 1 0 1.9-5.3" fill="none" stroke="#fff" strokeWidth={2.4}/>
  <path d="M10.2 8.6v4.6h4.6" fill="none" stroke="#fff" strokeWidth={2.4}/>
 </>,
 clock:<>
  <circle cx="16" cy="16.5" r="12" fill="currentColor" stroke="none"/>
  <path d="M16 10v6.8l4.2 2.6" fill="none" stroke="#fff" strokeWidth={2.6}/>
  <path d="M9.6 7.2 6.8 4.6M22.4 7.2l2.8-2.6" fill="none" strokeWidth={2.6}/>
 </>,
 book:<>
  <path d="M3.5 8.2c4-1.9 8.2-1.6 12.5 1v18c-4.3-2.6-8.5-2.9-12.5-1z" fill="currentColor" stroke="none"/>
  <path d="M28.5 8.2c-4-1.9-8.2-1.6-12.5 1v18c4.3-2.6 8.5-2.9 12.5-1z" fill="currentColor" fillOpacity={.62} stroke="none"/>
  <path d="M7 13.2c1.9-.5 3.8-.4 5.6.4M7 17.6c1.9-.5 3.8-.4 5.6.4" fill="none" stroke="#fff" strokeWidth={1.8}/>
 </>,
 note:<>
  <path d="M12.2 7.4 26 4.2v15.6" fill="none" strokeWidth={3.2}/><path d="M12.2 7.4v15.4" fill="none" strokeWidth={3.2}/>
  <ellipse cx="8.6" cy="23.4" rx="4.8" ry="3.9" fill="currentColor" stroke="none"/><ellipse cx="22.4" cy="20.4" rx="4.8" ry="3.9" fill="currentColor" stroke="none"/>
  <circle cx="7" cy="22.2" r="1.2" fill="#fff" stroke="none"/>
 </>,
 volume:<>
  <path d="M5 12.4h4.4l6.8-5.6v18.4l-6.8-5.6H5a1.6 1.6 0 0 1-1.6-1.6v-4a1.6 1.6 0 0 1 1.6-1.6z" fill="currentColor" stroke="none"/>
  <path d="M20.6 12c1.9 2.2 1.9 5.8 0 8M24.6 8.4c3.9 4.4 3.9 10.8 0 15.2" fill="none" strokeWidth={2.6}/>
 </>,
 bulb:<>
  <path d="M16 3.6a9.4 9.4 0 0 0-5.4 17.1c.8.6 1.2 1.4 1.2 2.3v.6h8.4V23c0-.9.4-1.7 1.2-2.3A9.4 9.4 0 0 0 16 3.6z" fill="currentColor" stroke="none"/>
  <rect x="11.8" y="25.2" width="8.4" height="3.6" rx="1.8" fill="currentColor" fillOpacity={.62} stroke="none"/>
  <path d="M12.4 10.6a4.6 4.6 0 0 1 3.4-2.4" fill="none" stroke="#fff" strokeWidth={2}/>
 </>,
 save:<>
  <path d="M5 8a3 3 0 0 1 3-3h13.4l5.6 5.6V24a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="currentColor" stroke="none"/>
  <rect x="9.6" y="5" width="10" height="7" rx="1.4" fill="#fff" fillOpacity={.85} stroke="none"/>
  <rect x="9.6" y="17.4" width="12.8" height="9.6" rx="1.6" fill="#fff" stroke="none"/>
  <path d="M12.6 21h6.8M12.6 24h4.4" fill="none" stroke="currentColor" strokeWidth={1.6}/>
 </>,
 lock:<>
  <path d="M10.6 14.6v-3.4a5.4 5.4 0 0 1 10.8 0v3.4" fill="none" strokeWidth={3}/>
  <rect x="6.6" y="13.6" width="18.8" height="14" rx="4" fill="currentColor" stroke="none"/>
  <circle cx="16" cy="19.6" r="2" fill="#fff" stroke="none"/><path d="M16 21v2.8" fill="none" stroke="#fff" strokeWidth={2}/>
 </>,
 star:<>
  <path d="M16 3.8l3.6 7.5 8.2 1.1-6 5.7 1.5 8.1L16 22.3l-7.3 3.9 1.5-8.1-6-5.7 8.2-1.1z" fill="currentColor" stroke="none" strokeLinejoin="round"/>
  <path d="M12.4 13.6l1.4-2.6" fill="none" stroke="#fff" strokeWidth={1.8}/>
 </>,
 share:<>
  <path d="M10.4 15 21 9.2M10.4 17.4 21 23.2" fill="none" strokeWidth={2.6}/>
  <circle cx="8.6" cy="16.2" r="4.6" fill="currentColor" stroke="none"/><circle cx="23.4" cy="8" r="4.6" fill="currentColor" stroke="none"/><circle cx="23.4" cy="24.4" r="4.6" fill="currentColor" stroke="none"/>
 </>,
};

/** Chunky, friendly icon; colour comes from `currentColor`, the tint is the same colour at low opacity. */
export function KidIcon({name,className}:{name:KidIconName;className?:string}){
 return <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
  <g stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</g>
 </svg>;
}
