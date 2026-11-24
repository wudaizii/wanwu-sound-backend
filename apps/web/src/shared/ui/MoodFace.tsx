// Cute, solid mood faces for the work pages. Every face is a filled paper ball with its own expression — never an
// outline with an empty middle — and each mood differs by expression, not colour alone. Colours follow the sound
// markers' matte paper family (sage · ochre · slate · lilac and their neighbours), not bright candy tones.
import {useId} from 'react';
import type {ReactNode} from 'react';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';

export type MoodFaceName=MoodId|'unset'|'custom';

const INK='#3d3a33',BLUSH='#e8a9a4',TONGUE='#e39a96';
/** [light, deep] paper tones, matching the markers (ochre, slate, sage, lilac) plus a few muted neighbours. */
const tones:Record<MoodFaceName,[string,string]>={
 happy:['#f8ebc8','#ebcf92'],calm:['#e6edf4','#c3d1e1'],lively:['#e9f0e0','#c6d7bc'],sad:['#e0e6ee','#b5c4d8'],
 angry:['#f3e0d6','#e1bba8'],scared:['#ede5f2','#d2c2e0'],curious:['#e1ece6','#bad3c6'],unset:['#f4f3ee','#dcdad0'],custom:['#f5e6e4','#e3c5c2'],
};
const line={fill:'none',stroke:INK,strokeWidth:2.2,strokeLinecap:'round',strokeLinejoin:'round'} as const;
const dot=(cx:number,cy:number,r=1.9)=><circle cx={cx} cy={cy} r={r} fill={INK}/>;
const cheeks=(opacity=.75)=><><ellipse cx="11" cy="25" rx="2.6" ry="1.7" fill={BLUSH} opacity={opacity}/><ellipse cx="29" cy="25" rx="2.6" ry="1.7" fill={BLUSH} opacity={opacity}/></>;

const faces:Record<MoodFaceName,ReactNode>={
 happy:<>
  <path d="M11.5 19.5q2.6-3.4 5.2 0M23.3 19.5q2.6-3.4 5.2 0" {...line}/>
  <path d="M13.5 23.5q6.5 8.6 13 0z" fill={INK}/><path d="M16.8 27.2q3.2 2.1 6.4 0q-3.2-2.2-6.4 0z" fill={TONGUE}/>
  {cheeks()}
 </>,
 calm:<>
  <path d="M11.8 19.6q2.5 2.4 5 0M23.2 19.6q2.5 2.4 5 0" {...line}/>
  <path d="M16.4 25.8q3.6 2.4 7.2 0" {...line}/>
  {cheeks(.55)}
 </>,
 lively:<>
  <path d="M11.6 19.8q2.6-2.8 5.2 0" {...line}/>{dot(25.8,19,2.4)}<circle cx="26.6" cy="18.2" r=".8" fill="#fff"/>
  <path d="M14.5 23.6h11q-.6 6.4-5.5 6.4t-5.5-6.4z" fill={INK}/><path d="M17.2 27.6q2.8 1.7 5.6 0q-2.8-1.8-5.6 0z" fill={TONGUE}/>
  <path d="M33.6 5.4q.5 2.6 3 3q-2.5.5-3 3q-.5-2.5-3-3q2.5-.4 3-3z" fill="#d9b45e"/>
  {cheeks()}
 </>,
 sad:<>
  <path d="M11.4 15.6l4.6-1.8M28.6 15.6l-4.6-1.8" {...line} strokeWidth={1.8}/>
  {dot(14.2,20.2)}{dot(25.8,20.2)}
  <path d="M15.6 28.4q4.4-3.8 8.8 0" {...line}/>
  <path d="M27.4 23.2q1.7 2.6 1.7 3.6a1.7 1.7 0 0 1-3.4 0q0-1 1.7-3.6z" fill="#8fb0d6"/>
  {cheeks(.4)}
 </>,
 angry:<>
  <path d="M10.8 15.2l5.8 2.6M29.2 15.2l-5.8 2.6" {...line} strokeWidth={2.4}/>
  {dot(14.6,20.6)}{dot(25.4,20.6)}
  <path d="M15 28.2q2.5-2.4 5 0t5 0" {...line}/>
  <path d="M30.5 6.5l1.4 2.4M34.6 7.8l-2 1.9M33.6 11.6l-2.6-.6" {...line} stroke="#c27a62" strokeWidth={1.8}/>
  {cheeks(.95)}
 </>,
 scared:<>
  <circle cx="14.4" cy="19.6" r="3.6" fill="#fff"/><circle cx="25.6" cy="19.6" r="3.6" fill="#fff"/>
  {dot(14.6,20.2,1.6)}{dot(25.4,20.2,1.6)}
  <path d="M13.6 27.4q1.6-1.8 3.2 0t3.2 0t3.2 0t3.2 0" {...line} strokeWidth={1.9}/>
  <path d="M8.2 9.4q1.6 2.4 1.6 3.4a1.6 1.6 0 0 1-3.2 0q0-1 1.6-3.4z" fill="#9bb8d8"/>
  {cheeks(.45)}
 </>,
 curious:<>
  <path d="M22.6 13.6q3.2-2.4 6.2-.6" {...line} strokeWidth={1.9}/>
  {dot(14.4,19.8)}{dot(25.6,19.4,2.5)}<circle cx="26.4" cy="18.6" r=".8" fill="#fff"/>
  <ellipse cx="20.4" cy="27" rx="2.4" ry="2.8" fill={INK}/>
  <path d="M31.4 4.8a2.8 2.8 0 1 1 3.6 2.7q-1 .4-1 1.6" {...line} stroke="#6f9a85" strokeWidth={1.9}/><circle cx="34" cy="11.6" r="1.1" fill="#6f9a85"/>
  {cheeks(.6)}
 </>,
 unset:<>
  {dot(14.4,20,1.7)}{dot(25.6,20,1.7)}
  <path d="M16.6 26.6h6.8" {...line} stroke="#8a8f80"/>
 </>,
 custom:<>
  {dot(14.2,19.6)}{dot(24.6,19.6)}
  <path d="M15.4 25.6q3.6 3 7.2 0" {...line}/>
  {cheeks()}
  <g transform="rotate(40 31 13)"><rect x="28.6" y="2.6" width="4.8" height="15" rx="1.4" fill="#dfb86e"/><path d="M28.6 17.6h4.8l-2.4 4z" fill="#f3e2c2"/><path d="M30.2 20.4h1.6L31 22z" fill={INK}/><rect x="28.6" y="2.6" width="4.8" height="3.2" rx="1.4" fill="#d9a5a5"/></g>
 </>,
};

/** A filled mood face (decorative; the label next to it names the mood). */
export function MoodFace({name,className}:{name:MoodFaceName;className?:string}){
 const id=useId(),[light,deep]=tones[name];
 return <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
  {/* Matte paper: a soft light-to-deep wash and a faint folded edge, no glossy shine. */}
  <defs><linearGradient id={id} x1="0" y1="0" x2=".85" y2="1"><stop offset="0" stopColor={light}/><stop offset="1" stopColor={deep}/></linearGradient></defs>
  <ellipse cx="20" cy="37.2" rx="11" ry="1.8" fill="#26301a" opacity=".08"/>
  <circle cx="20" cy="21" r="16" fill={`url(#${id})`}/>
  <path d="M8.6 12.4a16 16 0 0 1 13-7.3q-6.8 2.6-10.6 9.6z" fill="#fff" opacity=".38"/>
  <circle cx="20" cy="21" r="15.4" fill="none" stroke={deep} strokeOpacity=".55" strokeWidth="1.2"/>
  {faces[name]}
 </svg>;
}
