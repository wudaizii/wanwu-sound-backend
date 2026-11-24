import {useEffect,useId,useImperativeHandle,useRef} from 'react';
import {createPortal} from 'react-dom';
import type {ReactNode,Ref} from 'react';
import {ArtPicture} from '../media/ArtPicture';
import type {ArtVariants} from '../media/types';
import generated from './marker-hero-assets.generated.json';
import {markerFor} from './markers';
import {spiritArm,spiritPoses} from './spiritPoses';
import styles from './SoundSpirit.module.css';
import {media} from '../../styles/breakpoints';

type Crop={left:number;top:number;width:number;height:number};
const hero=generated.assets as Record<string,{label:string;crop:Crop;variants:ArtVariants}>;

export type SpiritHandle={wave():void;hop(strength?:number):void;cheer():void};
type SpiritProps={
 index:number;
 /** Without a sound the character is half asleep and its hands hang down. */
 awake:boolean;
 /** Small and calm (e.g. while a form takes the stage): the right hand stops pointing. */
 compact?:boolean;
 /** Overlaid on the body like SoundMarker's label (number or maker name). */
 label?:ReactNode;
 greetLabel:string;
 onGreet?:()=>void;
 /** On wide screens the right hand points toward this element. */
 reach?:()=>Element|null;
 /** Loudness of what is sounding now, 0…1 (0 when silent): the body swells with it and the left hand taps each onset. */
 level?:()=>number;
 className?:string;
 handle?:Ref<SpiritHandle>;
};

const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const ease=(x:number)=>x*x*(3-2*x);
const rad=(d:number)=>d*Math.PI/180;
const WIDE=900,STAR_COUNT=12,STAR_COLOURS=['#ffe576','#c0e64f','#ffd4d9','#9fe8ff'];
const STAR='M16 2.8l3.8 8.4 9 1-6.7 6.1 1.9 9L16 22.7l-8 4.6 1.9-9-6.7-6.1 9-1z';

type Spring={x:number;v:number};
type Limb={a:Spring;l:Spring;b:Spring;init:boolean;hx:number;hy:number};
/** Critically damped spring: settles without overshoot, so arms never wobble. */
function spring(s:Spring,target:number,w:number,dt:number){
 const x=s.x-target,c=s.v+w*x,e=Math.exp(-w*dt);
 s.x=target+(x+c*dt)*e;s.v=(s.v-c*w*dt)*e;
}
/** One arm from angle / length / bend, each chasing its target; returns the SVG path in viewport pixels. */
function limbPath(lb:Limb,S:readonly [number,number],ta:number,tl:number,tb:number,wA:number,dt:number,wL:number=spiritArm.stretch){
 if(!lb.init){lb.a.x=ta;lb.l.x=tl;lb.b.x=tb;lb.a.v=lb.l.v=lb.b.v=0;lb.init=true;}
 const turn=((ta-lb.a.x+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
 spring(lb.a,lb.a.x+turn,wA,dt);spring(lb.l,tl,wL,dt);
 // A quick turn leaves the hand trailing a little, so the arm curves.
 spring(lb.b,tb+clamp(-lb.a.v*.035,-.2,.2),spiritArm.bend,dt);
 const L=lb.l.x,a=lb.a.x,bd=lb.b.x,dx=Math.cos(a),dy=Math.sin(a),nx=Math.sin(a),ny=-Math.cos(a);
 const hx=S[0]+dx*L,hy=S[1]+dy*L;lb.hx=hx;lb.hy=hy;
 const c1x=S[0]+dx*L*.3+nx*bd*L,c1y=S[1]+dy*L*.3+ny*bd*L,c2x=S[0]+dx*L*.72+nx*bd*L*.7,c2y=S[1]+dy*L*.72+ny*bd*L*.7;
 return `M${S[0].toFixed(1)} ${S[1].toFixed(1)}C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
}

/**
 * The marker as a little sound character: the unchanged paper body with live eyes and soft arms. Eyes follow the
 * pointer and blink; a tap waves. The arms are drawn in a fixed layer so the right hand can reach across panels.
 */
export function SoundSpirit({index,awake,compact=false,label,greetLabel,onGreet,reach,level,className='',handle}:SpiritProps){
 const marker=markerFor(index),asset=hero[marker.id]!,pose=spiritPoses[marker.id]!,crop=asset.crop;
 const clipId='spirit'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const root=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),effects=useRef<HTMLDivElement>(null);
 /** The cheer's stars fly far: they get a layer over the whole page so speech bubbles and panels never cover them. */
 const burst=useRef<HTMLDivElement>(null);
 const armL=useRef<SVGPathElement>(null),armR=useRef<SVGPathElement>(null);
 const eyes=useRef<(SVGGElement|null)[]>([]),pupils=useRef<(SVGGElement|null)[]>([]);
 const live=useRef({awake,compact,reach,level});live.current={awake,compact,reach,level};
 const fx=useRef({hop:0,hopV:0,poke:0,waveUntil:0,cheerUntil:0,blinkStart:0,nextBlink:0,eyeOpen:.4,gx:0,gy:0,amp:0,bob:0,tapStart:0,prevLevel:0,lastTap:0});
 const calm=()=>matchMedia(media['reduced-motion']).matches;

 const effect=(className:string,x:number,y:number,vars:Record<string,string>,ms:number,html='',layer=effects.current)=>{
  if(!layer||calm())return;
  const node=document.createElement('span');node.className=className;node.style.left=`${x}px`;node.style.top=`${y}px`;
  for(const [key,value] of Object.entries(vars))node.style.setProperty(key,value);
  node.innerHTML=html;layer.appendChild(node);setTimeout(()=>node.remove(),ms);
 };
 const hop=(strength=1)=>{fx.current.poke=1;if(!calm())fx.current.hopV=-260*strength;};
 const wave=()=>{fx.current.waveUntil=performance.now()+1700;hop(.6);};
 const cheer=()=>{
  fx.current.cheerUntil=performance.now()+2400;
  const r=root.current?.getBoundingClientRect();if(!r)return;
  // Viewport pixels: the burst layer covers the whole page.
  const scale=r.width/crop.width,cx=r.left+(313-crop.left)*scale,cy=r.top+(200-crop.top)*scale;
  for(let i=0;i<STAR_COUNT;i++){
   const a=i/STAR_COUNT*Math.PI*2+Math.random()*.4,d=(110+Math.random()*90)*Math.min(1,scale*1.6);
   effect(styles.spark!,cx,cy,{'--dx':`${Math.cos(a)*d}px`,'--dy':`${Math.sin(a)*d*.8-20}px`},1400,
    `<svg viewBox="0 0 32 32"><path d="${STAR}" fill="${STAR_COLOURS[i%4]}"/></svg>`,burst.current);
  }
 };
 useImperativeHandle(handle,()=>({wave,hop,cheer}));

 useEffect(()=>{
  const f=fx.current;f.nextBlink=performance.now()+2500;
  const limbs:Limb[]=[0,1].map(()=>({a:{x:0,v:0},l:{x:0,v:0},b:{x:0,v:0},init:false,hx:0,hy:0}));
  const pointer={x:0,y:0,valid:false};
  const move=(event:PointerEvent)=>{if(event.pointerType==='touch')return;pointer.x=event.clientX;pointer.y=event.clientY;pointer.valid=true;};
  const leave=()=>{pointer.valid=false;};
  addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerleave',leave);addEventListener('blur',leave);
  let frame=0,last=0;
  const tick=(now:number)=>{
   frame=requestAnimationFrame(tick);
   const dt=last?Math.min(40,now-last):16;last=now;
   const node=root.current,bodyNode=body.current,L=armL.current,R=armR.current;
   if(!node||!bodyNode||!L||!R)return;
   const r=node.getBoundingClientRect();
   if(!r.width||r.bottom<-200||r.top>innerHeight+200){L.removeAttribute('d');R.removeAttribute('d');limbs.forEach(limb=>{limb.init=false;});return;}
   const {awake,compact,reach,level}=live.current,still=calm(),t=now/1000,sec=Math.min(dt,40)/1000;
   const sc=r.width/crop.width;
   const P=(x:number,y:number)=>[r.left+(x-crop.left)*sc,r.top+(y-crop.top)*sc] as const;
   const [ccx,ccy]=P(313,290);

   // Gaze: the pointer when it is near, otherwise where the right hand points.
   let tx=0,ty=0;
   if(pointer.valid&&Math.hypot(pointer.x-ccx,pointer.y-ccy)<900){tx=pointer.x-ccx;ty=pointer.y-ccy;}
   else if(limbs[1]!.init&&awake){tx=(limbs[1]!.hx-ccx)*.5;ty=(limbs[1]!.hy-ccy)*.5;}
   const sm=still?1:1-Math.exp(-dt/110);
   f.gx=mix(f.gx,tx,sm);f.gy=mix(f.gy,ty,sm);
   // Eyelids: half asleep until there is a sound; an occasional blink.
   f.eyeOpen=mix(f.eyeOpen,awake?1:.42,still?1:.08);
   if(!still&&now>f.nextBlink&&!f.blinkStart)f.blinkStart=now;
   let open=f.eyeOpen*(pose.openness??1);
   if(f.blinkStart){const p=(now-f.blinkStart)/260;if(p>=1){f.blinkStart=0;f.nextBlink=now+2600+Math.random()*4200;}else open*=1-.96*Math.pow(Math.sin(Math.PI*p),2);}
   pose.eyes.forEach(([, ,angle],i)=>{
    const a=rad(angle),gx=f.gx*Math.cos(a)+f.gy*Math.sin(a),gy=-f.gx*Math.sin(a)+f.gy*Math.cos(a);
    const norm=Math.hypot(gx,gy),k=Math.tanh(norm/160),nx=norm?gx/norm:0,ny=norm?gy/norm:0;
    pupils.current[i]?.setAttribute('transform',`translate(${(nx*13*k).toFixed(2)} ${(ny*19*k).toFixed(2)})`);
    eyes.current[i]?.setAttribute('transform',`scale(1 ${open.toFixed(3)})`);
   });

   // Body: breathing, swelling with the sound, a hop after each choice, bouncing while cheering.
   const loud=clamp(level?.()??0,0,1);
   f.amp=mix(f.amp,still?0:loud,.25);
   let bob=0,tilt=0,sy=1,sx=1;
   if(!still)sy+=Math.sin(t*1.7)*.008;
   sy+=f.amp*.05;sx-=f.amp*.025;bob-=f.amp*16;
   const step=Math.min(dt,24)/1000;
   f.hopV+=(-f.hop*420-f.hopV*11)*step;f.hop+=f.hopV*step;bob+=f.hop*.5;
   if(now<f.cheerUntil&&!still){bob-=Math.abs(Math.sin(now*.0085))*30;tilt+=Math.sin(now*.017)*2.4;}
   f.bob=bob;
   bodyNode.style.transform=`translateY(${(bob*sc).toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;

   // Arms. Shoulders ride with the body.
   const wide=innerWidth>WIDE;
   const S=pose.shoulders.map(([x,y])=>P(x,y+bob*.9));
   const sway=(i:number)=>still?0:Math.sin(t*1.2+i*1.9)*rad(2);
   const wag=Math.sin(now*.011);
   const rest=[0,1].map(i=>{const [hx,hy]=P(pose.hands[i]![0],pose.hands[i]![1]);const dx=hx-S[i]![0],dy=hy-S[i]![1];return {a:Math.atan2(dy,dx),l:Math.hypot(dx,dy)};});
   // Right hand: points toward the row being looked at, without touching it.
   let aR=rest[1]!.a+sway(1),lR=rest[1]!.l,bR=.1,wR:number=spiritArm.follow;
   const target=wide&&awake&&!compact?reach?.():null;
   if(target){
    const tr=target.getBoundingClientRect(),dx=tr.left-12-S[1]![0],dy=tr.top+tr.height*.5-S[1]![1];
    aR=clamp(Math.atan2(dy,dx),rad(-80),rad(50))+sway(1);
    lR=clamp(Math.hypot(dx,dy)*.72,spiritArm.reachMin*sc,spiritArm.reachMax*sc)*(1+.1*f.poke);bR=.2;
   }
   if(now<f.waveUntil){
    const k=ease(clamp((f.waveUntil-now)/260,0,1))*ease(clamp((now-(f.waveUntil-1700))/240,0,1));
    aR=mix(aR,rad(-52)+wag*rad(13),k);lR=mix(lR,spiritArm.base*.95*sc,k);bR=mix(bR,.16,k);wR=mix(wR,15,k);
   }
   // Left hand: rests above the floor beside the body and taps it at every onset of the sound.
   const floorY=P(0,pose.bottom+26)[1],restY=floorY-spiritArm.tapLift*sc,handX=S[0]![0]-55*sc;
   if(!still&&loud>.2&&loud-f.prevLevel>.08&&now-f.lastTap>140){
    f.tapStart=now;f.lastTap=now;
    effect(styles.ripple!,(limbs[0]!.init?limbs[0]!.hx:handX)-r.left,floorY-r.top,{'--s':(.55+loud*.75).toFixed(2)},700);
   }
   f.prevLevel=mix(f.prevLevel,loud,.5);
   const tap=f.tapStart&&now-f.tapStart<spiritArm.tapMs?Math.sin(Math.PI*(now-f.tapStart)/spiritArm.tapMs):0;
   const pL=[handX+(still?0:Math.sin(t*1.1)*3*sc),mix(restY,floorY,tap)];
   let aL=Math.atan2(pL[1]!-S[0]![1],pL[0]!-S[0]![0]),lL=Math.hypot(pL[0]!-S[0]![0],pL[1]!-S[0]![1])*1.06,bL=-.2;
   if(!awake){aL=rest[0]!.a+sway(0);lL=rest[0]!.l;bL=-.1;}
   if(now<f.cheerUntil){
    aR=rad(-62)+wag*rad(12);lR=spiritArm.base*sc;bR=.16;wR=14;
    aL=rad(242)-wag*rad(12);lL=spiritArm.base*sc*.85;bL=-.12;
   }
   const playing=loud>0||f.amp>.02,wl=now<f.cheerUntil?14:playing?32:spiritArm.follow;
   const dts=still?1:sec;
   L.style.strokeWidth=R.style.strokeWidth=(spiritArm.stroke*sc).toFixed(2);
   L.setAttribute('d',limbPath(limbs[0]!,S[0]!,aL,lL,bL,still?60:wl,dts,playing?30:spiritArm.stretch));
   R.setAttribute('d',limbPath(limbs[1]!,S[1]!,aR,lR,bR,still?60:wR,dts));
   f.poke*=Math.pow(.001,sec);
  };
  frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);removeEventListener('pointermove',move);document.removeEventListener('pointerleave',leave);removeEventListener('blur',leave);};
 },[pose,crop]);

 const pct=(value:number,total:number)=>`${value/total*100}%`;
 return <div ref={root} className={`${styles.spirit} ${className}`} data-marker={marker.id} data-compact={compact||undefined}
  style={{aspectRatio:`${crop.width} / ${crop.height}`}}>
  <svg className={styles.arms} aria-hidden="true"><path ref={armL}/><path ref={armR}/></svg>
  <span className={styles.floor} aria-hidden="true"/>
  <button type="button" className={styles.hit} aria-label={greetLabel} onClick={()=>{wave();onGreet?.();}}/>
  <div ref={body} className={styles.body} style={{transformOrigin:`${pct(313-crop.left,crop.width)} ${pct(570-crop.top,crop.height)}`}}>
   <ArtPicture variants={asset.variants} className={styles.art} priority="high" fallback={<span className={styles.shape}/>}/>
   <svg className={styles.eyes} viewBox={`${crop.left} ${crop.top} ${crop.width} ${crop.height}`} aria-hidden="true">
    {pose.eyes.map(([x,y,angle,rx,ry],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
     <g ref={node=>{eyes.current[i]=node;}}>
      <ellipse cx="9" cy="1" rx={rx} ry={ry} fill="#777a72" opacity=".55"/>
      <ellipse rx={rx} ry={ry} fill="#fffefa"/>
      <clipPath id={`${clipId}-eye-${i}`}><ellipse rx={rx-4} ry={ry-5}/></clipPath>
      <g clipPath={`url(#${clipId}-eye-${i})`}><g ref={node=>{pupils.current[i]=node;}}><ellipse cx="-1" cy="3" rx={rx*.46} ry={ry*.48} fill="#111510"/></g></g>
     </g>
    </g>)}
   </svg>
   {label!==undefined&&<span className={styles.label}>{label}</span>}
  </div>
  <div ref={effects} className={styles.effects} aria-hidden="true"/>
  {createPortal(<div ref={burst} className={styles.burst} aria-hidden="true"/>,document.body)}
 </div>;
}
