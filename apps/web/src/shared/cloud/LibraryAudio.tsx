import {useEffect,useRef,useState} from 'react';
import type {SourceView} from '@wanwu-v2/contracts/cloud';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {planCard} from '@wanwu-v2/sound-rules/shaping';
import {renderShaped} from '@wanwu-v2/audio-engine/shaping';
import {pcm16Wave} from '@wanwu-v2/audio-engine/pcm';
import type {CloudMedia} from './cloudMedia';
import {cloudError} from './cloudTypes';
import styles from './CloudControls.module.css';

/** Confirmation hears the same canonical derivative, rules and five-dimensional parameters as the editor. */
export function LibraryAudio({view,unit,media,onPlay,onReset}:{view:SourceView;unit?:SoundUnitDraft|null;media:CloudMedia;onPlay?:()=>void;onReset?:()=>void}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const reset=useRef(onReset);reset.current=onReset;
 const parameters=unit?JSON.stringify({id:unit.id,shape:unit.shape}):'';
 useEffect(()=>{
  let live=true,objectUrl:string|undefined;setUrl('');setError('');reset.current?.();
  const prepare=async()=>{
   if(!unit){const fresh=retry?await media.source(view.source.id):view;if(live)setUrl(fresh.playback?.url??'');return;}
   const {buffer,view:canonical}=await media.load(view.source.id);
   if(!canonical.analysis)throw new Error('缺少服务端声音体检，不能确认这张声卡。');
   const rendered=await renderShaped(buffer,planCard(unit.shape,canonical.analysis,unit.id));
   const channels=Array.from({length:rendered.numberOfChannels},(_,index)=>rendered.getChannelData(index));
   objectUrl=URL.createObjectURL(new Blob([pcm16Wave(channels,rendered.sampleRate)],{type:'audio/wav'}));
   if(live)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);
  };
  void prepare().catch(caught=>{if(live)setError(cloudError(caught));});
  return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[view.source.id,view.playback?.url,parameters,media,retry]);
 return <div><p className={styles.hint}>{unit?'试听当前声卡与五维选择':'试听音源原声'}</p>
  {url?<audio className={styles.audio} controls preload="none" src={url} onPlay={onPlay} onError={()=>{if(!retry)setRetry(1);else setError('试听暂时失败，请关闭后重试。');}}/>:<p role="status">{error||'正在准备试听…'}</p>}
  {url&&error&&<p role="alert" className={styles.error}>{error}</p>}
 </div>;
}
