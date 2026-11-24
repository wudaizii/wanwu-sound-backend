import {homeMotion,introLayers} from '../config/scene';
import {initialIntro,transitionIntro,shouldRememberIntro} from './introState';
import type {IntroPolicy,IntroState,IntroEvent} from './introState';
import {writeSessionFlag} from '../../../shared/platform/capabilities';
import {media} from '../../../styles/breakpoints';

type StyleNames={fore:string;left:string;right:string};
// Owns only the empty curtain host. React owns the resting scene and page controls.
export class ForestOpening {
 private state:IntroState;
 private alive=true;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private animations:Animation[]=[];
 private scene:HTMLElement;
 private host:HTMLElement;
 private report:(state:IntroState)=>void;
 private styles:StyleNames;
 private get playing(){return this.state.phase==='playing';}
 constructor(scene:HTMLElement,host:HTMLElement,policy:IntroPolicy,report:(state:IntroState)=>void,styles:StyleNames){
  this.scene=scene;this.host=host;this.state=initialIntro(policy);this.report=report;this.styles=styles;
 }
 private emit(event:IntroEvent){
  if(!this.alive)return;
  this.state=transitionIntro(this.state,event,homeMotion.deadlineMs);
  if(this.state.phase==='settled'){
   clearTimeout(this.timer);this.animations.forEach(a=>a.cancel());this.animations=[];
   this.host.hidden=true;this.host.textContent='';
  }
  if(shouldRememberIntro(this.state))writeSessionFlag(homeMotion.storageKey);
  this.report({...this.state});
 }
 async start(manual=false){
  this.host.hidden=true;this.report({...this.state});
  if(this.state.phase==='settled')return;
  if(!this.scene.animate){this.emit({type:'FAILED'});return;}
  const start=performance.now();
  this.timer=setTimeout(()=>this.emit({type:'TIMEOUT'}),manual?5000:homeMotion.deadlineMs);
  const images:HTMLImageElement[]=[];
  for(const [index,asset] of introLayers.entries()){
   const layer=document.createElement('div');layer.className=`${this.styles.fore} ${index===0?this.styles.left:this.styles.right}`;
   const picture=document.createElement('picture');picture.style.opacity=String(homeMotion.foregroundOpacity);
   for(const [tier,query] of [['mobile',media.phone],['desktop','']] as const){
    const source=document.createElement('source');source.type='image/webp';source.srcset=asset.variants[tier].url;
    if(query)source.media=query;picture.append(source);
   }
   const image=document.createElement('img');image.alt='';image.decoding='async';image.fetchPriority='high';image.src=asset.variants.fallback.url;
   let retried=false;
   image.addEventListener('error',()=>{if(!retried){retried=true;picture.querySelectorAll('source').forEach(s=>s.remove());image.src=asset.variants.fallback.url;}});
   picture.append(image);layer.append(picture);this.host.append(layer);images.push(image);
  }
  // Request foreground and scene together; avoid a second network round trip after the scene decodes.
  const foregroundReady=await Promise.all([...images,...this.scene.querySelectorAll('img')].map(decodeImage));
  if(!this.alive||this.state.phase!=='waiting')return;
  if(!foregroundReady.every(Boolean)){this.emit({type:'FAILED'});return;}
  clearTimeout(this.timer);this.emit({type:'READY',elapsed:manual?0:performance.now()-start});
  if(!this.playing)return;
  this.host.hidden=false;writeSessionFlag(homeMotion.storageKey);
  const options:KeyframeAnimationOptions={duration:homeMotion.durationMs,easing:'cubic-bezier(.48,.04,.2,1)',fill:'forwards'};
  for(const [index,el] of [...this.host.children].entries()){
   const direction=index===0?-1:1;
   this.animations.push(el.animate([
    {transform:'translateX(0) scale(1.02)',opacity:1},
    {transform:`translateX(${direction*9}%) scale(1.12)`,opacity:1,offset:.36},
    {transform:`translateX(${direction*65}%) scale(1.55)`,opacity:.92,offset:.76},
    {transform:`translateX(${direction*112}%) scale(1.8)`,opacity:0},
   ],options));
  }
  this.animations.push(this.scene.animate([{transform:'scale(.975)'},{transform:'scale(1)'}],options));
  await Promise.allSettled(this.animations.map(a=>a.finished));
  if(this.alive&&this.playing)this.emit({type:'FINISH'});
 }
 stop(reason:'SKIP'|'HIDDEN'|'REDUCED'='SKIP'){this.emit({type:reason});}
 dispose(){this.alive=false;clearTimeout(this.timer);this.animations.forEach(a=>a.cancel());this.animations=[];this.host.hidden=true;this.host.textContent='';}
}
async function decodeImage(image:HTMLImageElement){try{await image.decode();return true;}catch{return false;}}
