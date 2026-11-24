export type AudioDevice = Pick<HTMLAudioElement,'src'|'volume'|'muted'|'preload'|'pause'|'play'|'addEventListener'|'removeEventListener'>;
type Hooks={loading?:(id:string)=>void;playing?:(id:string)=>void;ended?:(id:string)=>void;stopped?:(id:string)=>void;error?:(id:string)=>void};
export class SingleSoundPlayer {
 private sequence=0;
 private active:string|null=null;
 private muted=false;
 private endedListener=()=>{const last=this.active;this.active=null;if(last)this.hooks.ended?.(last);};
 private media:AudioDevice;
 private hooks:Hooks;
 constructor(media:AudioDevice,hooks:Hooks={}){this.media=media;this.hooks=hooks;media.preload='none';media.addEventListener('ended',this.endedListener);}
 async play(id:string,sound:{url:string;volume:number}){
  this.stop();if(this.muted)return 'muted';
  const token=++this.sequence;this.active=id;this.media.src=sound.url;this.media.volume=Math.max(0,Math.min(1,sound.volume));this.hooks.loading?.(id);
  try{await this.media.play();if(token!==this.sequence)return 'superseded';this.hooks.playing?.(id);return 'playing';}
  catch{if(token!==this.sequence)return 'superseded';this.active=null;this.hooks.error?.(id);return 'error';}
 }
 stop(){const last=this.active;++this.sequence;this.media.pause();this.active=null;if(last)this.hooks.stopped?.(last);}
 setMuted(value:boolean){this.muted=value;this.media.muted=value;if(value)this.stop();}
 dispose(){this.stop();this.media.removeEventListener('ended',this.endedListener);}
}
