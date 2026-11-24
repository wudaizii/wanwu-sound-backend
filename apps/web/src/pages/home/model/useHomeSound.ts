import {useCallback,useEffect,useRef,useState} from 'react';
import type {RefObject} from 'react';
import type {SceneLayer} from '../../../shared/media/types';
import {SingleSoundPlayer} from '../../../shared/audio/SingleSoundPlayer';
import {readPerformanceHints,subscribeReducedMotion} from '../../../shared/platform/capabilities';
import {homeAssets} from '../config/scene';
import {animateSticker} from '../config/motions';
export function useHomeSound(audioRef:RefObject<HTMLAudioElement|null>,suspended=false){
 const player=useRef<SingleSoundPlayer|null>(null),animation=useRef<Animation|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [active,setActive]=useState<{id:string|null;phase:'idle'|'loading'|'playing'|'error'}>({id:null,phase:'idle'});
 const [muted,setMuted]=useState(false);
 const mutedRef=useRef(false);
 const [status,setStatus]=useState({message:'',visible:false});
 const notify=useCallback((message:string,duration=3400)=>{
  clearTimeout(timer.current);setStatus({message,visible:true});
  if(duration)timer.current=setTimeout(()=>setStatus(s=>({...s,visible:false})),duration);
 },[]);
 useEffect(()=>{
  if(!audioRef.current)return;
  let alive=true;
  const update=(id:string|null,phase:typeof active.phase)=>{if(alive)setActive({id,phase});};
  const sound=new SingleSoundPlayer(audioRef.current,{
   loading:id=>{update(id,'loading');notify('正在等声音传过来…',0);},
   playing:id=>{update(id,'playing');const asset=homeAssets.layers.find(a=>a.id===id);notify(id==='squirrel'?'沙沙——是风吹树叶的声音。':`听，是${asset?.sound?homeAssets.sounds[asset.sound].label:'自然的声音'}。`);},
   stopped:()=>update(null,'idle'),ended:()=>update(null,'idle'),
   error:id=>{update(id,'error');notify('这次没听清，再点一下试试。');},
  });
  sound.setMuted(mutedRef.current);player.current=sound;
  const hidden=()=>{if(document.hidden){sound.stop();animation.current?.cancel();}};
  const reduce=()=>{if(readPerformanceHints().reduced)animation.current?.cancel();};
  document.addEventListener('visibilitychange',hidden);const unsubscribe=subscribeReducedMotion(reduce);
  return()=>{alive=false;sound.dispose();player.current=null;animation.current?.cancel();clearTimeout(timer.current);document.removeEventListener('visibilitychange',hidden);unsubscribe();};
 },[audioRef,notify]);
 useEffect(()=>{if(suspended){player.current?.stop();animation.current?.cancel();clearTimeout(timer.current);setStatus({message:'',visible:false});}},[suspended]);
 const interact=(asset:SceneLayer,el:HTMLElement)=>{
  const reduced=readPerformanceHints().reduced;
  animation.current?.cancel();if(asset.motion)animation.current=animateSticker(el,asset.motion,reduced);
  if(!asset.sound){player.current?.stop();notify('小蜗牛慢慢挪动了一点。');return;}
  // Keep play() in the click call stack, including on iOS/WeChat browsers.
  void player.current?.play(asset.id,homeAssets.sounds[asset.sound]);
  if(muted)notify('现在是静音模式，也可以看它动起来。');
 };
 const toggleMute=()=>{const next=!muted;mutedRef.current=next;setMuted(next);player.current?.setMuted(next);notify(next?'声音已关闭。':'声音已开启，点击小伙伴试听。');};
 return {active,muted,status,notify,interact,toggleMute};
}
