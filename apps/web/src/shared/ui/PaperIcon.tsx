// Solid paper icons for 声音诞生 and the home page, from the approved page draft (万物声谱_视觉过程稿/声音诞生页草稿): solid paper cut-outs with a darker
// paper edge underneath, coloured directly in a palette tone — no backing circle. Lines inside an icon stay white.
// The small UI glyphs (play, arrow…) are solid too and take their colour from `currentColor`.
import type {ReactNode} from 'react';

const INK='#2f3b10';
/** Palette tones (spring card + marker paper) with a darker edge and a lighter second face. */
const tones={
 lime:{t:'#c0e64f',d:'#9cc42b',l:'#dcf58c'},yellow:{t:'#ffe576',d:'#e0bd3e',l:'#fff2b0'},
 sky:{t:'#9fe8ff',d:'#67c2e0',l:'#cdf3ff'},pink:{t:'#ffd4d9',d:'#f0a2ae',l:'#ffe8eb'},
 sage:{t:'#c4cebb',d:'#a0b290',l:'#dde5d6'},lilac:{t:'#d1b9da',d:'#b392c2',l:'#e6d8ec'},
} as const;
export type PaperTone=keyof typeof tones;
type Tone=(typeof tones)[PaperTone];

const face=(cx:number,cy:number,s=1)=><>
 <circle cx={cx-2.3*s} cy={cy} r={1.05*s} fill={INK}/><circle cx={cx+2.3*s} cy={cy} r={1.05*s} fill={INK}/>
 <path d={`M${cx-1.4*s} ${cy+2*s}q${1.4*s} ${1.3*s} ${2.8*s} 0`} fill="none" stroke={INK} strokeWidth={1.2*s} strokeLinecap="round"/>
</>;
/** The paper edge: the same shape in the darker tone, half a unit lower, then the shape itself. */
const paper=(tone:Tone,draw:(main:string,second:string)=>ReactNode)=><><g transform="translate(0 1.5)">{draw(tone.d,tone.d)}</g>{draw(tone.t,tone.l)}</>;

const art={
 mic:(t:Tone)=><>{paper(t,c=><><rect x="11" y="3.5" width="10" height="16.5" rx="5" fill={c}/><path d="M7 15a9 9 0 0 0 18 0M16 24v4M12 28h8" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round"/></>)}{face(16,11.2,.85)}</>,
 upload:(t:Tone)=><>{paper(t,c=><path d="M9.5 25h13.5a5.4 5.4 0 0 0 .7-10.75A7.8 7.8 0 0 0 9.4 12.4 6.3 6.3 0 0 0 9.5 25z" fill={c}/>)}<path d="M16 22.6v-7.4M12.8 18.2l3.2-3.2 3.2 3.2" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></>,
 library:(t:Tone)=><>{paper(t,(c,a)=><><path d="M3.5 8.2c4-1.9 8.2-1.6 12.5 1v18c-4.3-2.6-8.5-2.9-12.5-1z" fill={c}/><path d="M28.5 8.2c-4-1.9-8.2-1.6-12.5 1v18c4.3-2.6 8.5-2.9 12.5-1z" fill={a}/></>)}<path d="M7 13.4c1.9-.5 3.8-.4 5.6.4M7 17.8c1.9-.5 3.8-.4 5.6.4M19.6 14.2c1.8-.8 3.7-.9 5.6-.4M19.6 18.6c1.8-.8 3.7-.9 5.6-.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></>,
 camera:(t:Tone)=><>{paper(t,c=><path d="M4.5 11.5a3 3 0 0 1 3-3h3.2l2-3h6.6l2 3h3.2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill={c}/>)}<circle cx="16" cy="17.6" r="5.4" fill="#fff"/><circle cx="16" cy="17.6" r="2.5" fill={INK}/><circle cx="14.6" cy="16.2" r=".9" fill="#fff"/><circle cx="24.4" cy="12.4" r="1.3" fill="#fff"/></>,
 pitch:(t:Tone)=><>{paper(t,c=><><rect x="4.5" y="18" width="6" height="9.5" rx="3" fill={c}/><rect x="13" y="12" width="6" height="15.5" rx="3" fill={c}/><rect x="21.5" y="5.5" width="6" height="22" rx="3" fill={c}/></>)}{face(24.5,11.5,.62)}</>,
 duration:(t:Tone)=><>{paper(t,c=><><circle cx="7.3" cy="19.5" r="3.3" fill={c}/><circle cx="13" cy="19.5" r="3.3" fill={c}/><circle cx="18.7" cy="19.5" r="3.3" fill={c}/><circle cx="25" cy="16.5" r="5.2" fill={c}/></>)}{face(25,16.4,.7)}</>,
 contour:(t:Tone)=><>{paper(t,c=><><path d="M3.5 21.5c2.6-7 5.6-7 8.2 0s5.6 7 8.2 0" fill="none" stroke={c} strokeWidth="4.6" strokeLinecap="round"/><circle cx="25.5" cy="17.5" r="5.2" fill={c}/></>)}{face(25.5,17.3,.7)}</>,
 intensity:(t:Tone)=><>{paper(t,c=><><path d="M5 12.4h4.4l6.8-5.6v18.4l-6.8-5.6H5a1.6 1.6 0 0 1-1.6-1.6v-4A1.6 1.6 0 0 1 5 12.4z" fill={c}/><path d="M20.6 12c1.9 2.2 1.9 5.8 0 8M24.6 8.4c3.9 4.4 3.9 10.8 0 15.2" fill="none" stroke={c} strokeWidth="2.8" strokeLinecap="round"/></>)}<path d="M7.2 14.6h1.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></>,
 pattern:(t:Tone)=><>{paper(t,c=><><circle cx="7" cy="21" r="3.1" fill={c}/><circle cx="15.5" cy="17.8" r="4.3" fill={c}/><circle cx="25" cy="13" r="5.8" fill={c}/></>)}{face(25,13,.78)}</>,
 clock:(t:Tone)=><>{paper(t,c=><circle cx="16" cy="16.5" r="12" fill={c}/>)}<path d="M16 10v6.8l4.4 2.8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="16" cy="16.8" r="1.6" fill="#fff"/></>,
 book:(t:Tone)=><>{paper(t,(c,a)=><><path d="M3.5 8.2c4-1.9 8.2-1.6 12.5 1v18c-4.3-2.6-8.5-2.9-12.5-1z" fill={c}/><path d="M28.5 8.2c-4-1.9-8.2-1.6-12.5 1v18c4.3-2.6 8.5-2.9 12.5-1z" fill={a}/></>)}<path d="M7 13.4c1.9-.5 3.8-.4 5.6.4M7 17.8c1.9-.5 3.8-.4 5.6.4M19.6 14.2c1.8-.8 3.7-.9 5.6-.4M19.6 18.6c1.8-.8 3.7-.9 5.6-.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></>,
 note:(t:Tone)=><>{paper(t,c=><><path d="M12.2 7.4 26 4.2v15.6M12.2 7.4v15.4" fill="none" stroke={c} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/><ellipse cx="8.6" cy="23.4" rx="4.8" ry="3.9" fill={c}/><ellipse cx="22.4" cy="20.4" rx="4.8" ry="3.9" fill={c}/></>)}{face(8.8,23.2,.6)}</>,
 bulb:(t:Tone)=><>{paper(t,c=><><path d="M16 3.5a9.5 9.5 0 0 0-5.6 17.2c.9.7 1.4 1.6 1.4 2.6v.7h8.4v-.7c0-1 .5-1.9 1.4-2.6A9.5 9.5 0 0 0 16 3.5z" fill={c}/><rect x="11.8" y="25.4" width="8.4" height="3.6" rx="1.8" fill={c}/></>)}<path d="M11.6 11.6a4.8 4.8 0 0 1 3.4-3.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>{face(16,14.6,.75)}</>,
};
export type PaperIconName=keyof typeof art;

/** A coloured paper icon (decorative). */
export function PaperIcon({name,tone,className}:{name:PaperIconName;tone:PaperTone;className?:string}){
 return <svg className={className} viewBox="0 0 32 32" aria-hidden="true">{art[name](tones[tone])}</svg>;
}

const glyphs={
 settings:<><path d="M6 9h20M6 23h20M6 16h20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/><circle cx="12" cy="9" r="3.2" fill="currentColor"/><circle cx="21" cy="16" r="3.2" fill="currentColor"/><circle cx="11" cy="23" r="3.2" fill="currentColor"/></>,
 play:<path d="M11 8.3c0-1.7 1.9-2.7 3.3-1.8l10.6 7.3c1.3.9 1.3 2.8 0 3.7L14.3 24.8c-1.4 1-3.3-.1-3.3-1.8z" fill="currentColor"/>,
 stop:<rect x="8" y="8" width="16" height="16" rx="4.5" fill="currentColor"/>,
 back:<path d="M26.5 16H6.5m6.5-6.5L6.5 16l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>,
 arrow:<path d="M5.5 16h20m-6.5-6.5 6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>,
 check:<path d="M7.5 16.8l5.4 5.4L24.5 10.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>,
 edit:<><path d="M20.4 5.6a3 3 0 0 1 4.2 0l1.8 1.8a3 3 0 0 1 0 4.2L13 25l-6.6 1.6L8 20z" fill="currentColor"/><path d="M18.4 8.2l5.4 5.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></>,
 replay:<><path d="M16 5.5a10.5 10.5 0 1 1-9.9 7" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><path d="M3.6 8.4l3.2 6.2 5.6-4.4z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></>,
 mic:<><rect x="11" y="3.5" width="10" height="16.5" rx="5" fill="currentColor"/><path d="M7 15a9 9 0 0 0 18 0M16 24v4M12 28h8" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/></>,
 camera:<><path d="M4.5 11.5a3 3 0 0 1 3-3h3.2l2-3h6.6l2 3h3.2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="currentColor"/><circle cx="16" cy="17.6" r="4.6" fill="#fff"/><circle cx="16" cy="17.6" r="2.2" fill="currentColor"/></>,
 bars:<path d="M6 14v4M11 10v12M16 6v20M21 10v12M26 14v4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"/>,
 shelf:<><rect x="5" y="6" width="7" height="20" rx="2.5" fill="currentColor"/><rect x="14" y="9.5" width="6.5" height="16.5" rx="2.5" fill="currentColor" fillOpacity=".7"/><path d="M22.5 11.2l3.4-1 3.3 14.6-3.4 1z" fill="currentColor" fillOpacity=".5"/></>,
 person:<><circle cx="16" cy="10.5" r="5.5" fill="currentColor"/><path d="M6 26.5c.8-5.6 4.8-8.5 10-8.5s9.2 2.9 10 8.5z" fill="currentColor"/></>,
 sound:<><path d="M5 12.4h4.4l6.8-5.6v18.4l-6.8-5.6H5a1.6 1.6 0 0 1-1.6-1.6v-4A1.6 1.6 0 0 1 5 12.4z" fill="currentColor"/><path d="M20.6 12c1.9 2.2 1.9 5.8 0 8M24.6 8.4c3.9 4.4 3.9 10.8 0 15.2" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/></>,
 muted:<><path d="M5 12.4h4.4l6.8-5.6v18.4l-6.8-5.6H5a1.6 1.6 0 0 1-1.6-1.6v-4A1.6 1.6 0 0 1 5 12.4z" fill="currentColor"/><path d="M20.5 12.5l7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/></>,
 sounds:<path d="M6 14v4M11 10v12M16 6v20M21 10v12M26 14v4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"/>,
 volume:<><path d="M5 12.4h4.4l6.8-5.6v18.4l-6.8-5.6H5a1.6 1.6 0 0 1-1.6-1.6v-4A1.6 1.6 0 0 1 5 12.4z" fill="currentColor"/><path d="M20.6 12c1.9 2.2 1.9 5.8 0 8M24.6 8.4c3.9 4.4 3.9 10.8 0 15.2" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/></>,
 plus:<path d="M16 6.5v19M6.5 16h19" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round"/>,
 pause:<><rect x="8" y="7" width="6" height="18" rx="2.6" fill="currentColor"/><rect x="18" y="7" width="6" height="18" rx="2.6" fill="currentColor"/></>,
 restart:<><path d="M16 5.5a10.5 10.5 0 1 1-9.9 7" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><path d="M3.6 8.4l3.2 6.2 5.6-4.4z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M14 12.2c0-1 1.1-1.6 1.9-1l4.4 3.1c.7.5.7 1.6 0 2.1l-4.4 3.1c-.8.6-1.9 0-1.9-1z" fill="currentColor"/></>,
 trim:<><circle cx="8.5" cy="23" r="4.2" fill="currentColor"/><circle cx="8.5" cy="9" r="4.2" fill="currentColor"/><circle cx="8.5" cy="23" r="1.6" fill="#fff"/><circle cx="8.5" cy="9" r="1.6" fill="#fff"/><path d="M11.8 11.2 27 21.5M11.8 20.8 27 10.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></>,
 copy:<><rect x="10.5" y="10.5" width="15" height="15" rx="4" fill="currentColor"/><path d="M7.5 21.5h-.5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h10.5a3 3 0 0 1 3 3v.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/></>,
 trash:<><path d="M8 10.5h16l-1.4 14.2a3 3 0 0 1-3 2.8h-7.2a3 3 0 0 1-3-2.8z" fill="currentColor"/><path d="M5.5 8h21M12.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/><path d="M13.5 14.5v8M18.5 14.5v8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></>,
 lock:<><rect x="6.5" y="14" width="19" height="13.5" rx="4" fill="currentColor"/><path d="M10.5 14.5v-3a5.5 5.5 0 0 1 11 0v3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="16" cy="20.6" r="1.9" fill="#fff"/></>,
 save:<><path d="M7.5 4.5h13.4l5.6 5.6v14.4a3 3 0 0 1-3 3h-16a3 3 0 0 1-3-3v-17a3 3 0 0 1 3-3z" fill="currentColor"/><rect x="10" y="4.5" width="10" height="7" rx="1.4" fill="#fff" fillOpacity=".85"/><rect x="9.5" y="17" width="13" height="7.5" rx="2" fill="#fff" fillOpacity=".85"/></>,
 share:<><circle cx="8.6" cy="16.2" r="4.6" fill="currentColor"/><circle cx="23.4" cy="8" r="4.6" fill="currentColor"/><circle cx="23.4" cy="24.4" r="4.6" fill="currentColor"/><path d="M10.4 15 21 9.2M10.4 17.4 21 23.2" fill="none" stroke="currentColor" strokeWidth="2.6"/></>,
 book:<><path d="M3.5 8.2c4-1.9 8.2-1.6 12.5 1v18c-4.3-2.6-8.5-2.9-12.5-1z" fill="currentColor"/><path d="M28.5 8.2c-4-1.9-8.2-1.6-12.5 1v18c4.3-2.6 8.5-2.9 12.5-1z" fill="currentColor" fillOpacity=".75"/></>,
 library:<><rect x="4" y="5" width="6" height="22" rx="2" fill="currentColor"/><rect x="12" y="8" width="6" height="19" rx="2" fill="currentColor" fillOpacity=".75"/><path d="M20.5 9.5 25 8.3l4 17.4-4.5 1.2z" fill="currentColor" fillOpacity=".55"/></>,
 upload:<><path d="M9.5 25h13.5a5.4 5.4 0 0 0 .7-10.75A7.8 7.8 0 0 0 9.4 12.4 6.3 6.3 0 0 0 9.5 25z" fill="currentColor"/><path d="M16 22.6v-7.4M12.8 18.2l3.2-3.2 3.2 3.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></>,
 note:<><path d="M12.2 7.4 26 4.2v15.6M12.2 7.4v15.4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/><ellipse cx="8.6" cy="23.4" rx="4.8" ry="3.9" fill="currentColor"/><ellipse cx="22.4" cy="20.4" rx="4.8" ry="3.9" fill="currentColor"/></>,
 bulb:<><path d="M16 3.5a9.5 9.5 0 0 0-5.6 17.2c.9.7 1.4 1.6 1.4 2.6v.7h8.4v-.7c0-1 .5-1.9 1.4-2.6A9.5 9.5 0 0 0 16 3.5z" fill="currentColor"/><rect x="11.8" y="25.4" width="8.4" height="3.6" rx="1.8" fill="currentColor"/></>,
 /** 课堂大屏: a solid screen on a stand. */
 screen:<><rect x="3.5" y="5" width="25" height="17" rx="3.5" fill="currentColor"/><path d="M12 27.5h8M16 22v5.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M9 11.5 12.5 9M9 16l7.5-5.5" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1.8" strokeLinecap="round"/></>,
};
export type GlyphName=keyof typeof glyphs;

/** Small solid UI glyph in the current text colour. */
export function Glyph({name,className}:{name:GlyphName;className?:string}){
 return <svg className={className} viewBox="0 0 32 32" aria-hidden="true">{glyphs[name]}</svg>;
}
