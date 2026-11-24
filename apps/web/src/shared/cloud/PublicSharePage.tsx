import {useEffect,useRef,useState} from 'react';
import {parsePublishedWork} from '@wanwu-v2/contracts/cloud';
import type {PublishedWorkView} from '@wanwu-v2/contracts/cloud';
import styles from './CloudControls.module.css';

export function PublicSharePage({token}:{token:string}){
 const [view,setView]=useState<PublishedWorkView|null>(null),[message,setMessage]=useState('正在打开作品…'),[busy,setBusy]=useState(false);
 const audio=useRef<HTMLAudioElement>(null),sequence=useRef(0),retrying=useRef(false),automaticRetry=useRef(false);
 const load=async()=>{
  const request=++sequence.current;
  setBusy(true);try{
   const response=await fetch(`/api/v1/shares/${encodeURIComponent(token)}`,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20_000)});
   if(!response.ok)throw new Error(response.status===404?'链接不存在或已撤销。':'作品服务暂时不可用，请稍后重试。');
   const result=parsePublishedWork(await response.json());if(!result)throw new Error('作品信息返回异常。');
   if(request!==sequence.current)return null;setView(result);setMessage('这是老师确认发布的成品。无需登录即可播放。');return result;
  }catch(error){if(request===sequence.current){setView(null);setMessage(error instanceof Error?error.message:'打开失败，请稍后重试。');}return null;}
  finally{if(request===sequence.current)setBusy(false);}
 };
 useEffect(()=>{automaticRetry.current=false;setView(null);void load();return()=>{++sequence.current;};},[token]);
 const refreshPlayback=async()=>{
  if(retrying.current)return;retrying.current=true;const at=audio.current?.currentTime??0,playing=!!audio.current&&!audio.current.paused;
  try{const next=await load();if(next&&audio.current){audio.current.src=next.audio.playback.url;audio.current.currentTime=at;if(playing)await audio.current.play().catch(()=>{});}}
  finally{retrying.current=false;}
 };
 return <main className={styles.page}><section className={styles.card} aria-label="公开作品">
  <h1>{view?.title??'万物声谱 · 分享作品'}</h1><p role="status">{message}</p>
  {view&&<><p className={styles.hint}>发布时间：{new Date(view.publishedAt).toLocaleString('zh-CN')}</p>
   <audio className={styles.audio} ref={audio} controls preload="none" src={view.audio.playback.url} onError={()=>{if(!automaticRetry.current){automaticRetry.current=true;void refreshPlayback();}else setMessage('音频暂时无法播放，请稍后手动重试。');}}
    onPlay={()=>{if(Date.parse(view.audio.playback.expiresAt)<Date.now()+5000)void refreshPlayback();}}/>
   <p className={styles.hint}>播放地址短时有效。此页面不提供老师账号、采集地点、原始素材或作品编辑权限。</p>
  </>}
  <button type="button" className={styles.button} disabled={busy} onClick={()=>{automaticRetry.current=false;void load();}}>重新获取播放授权</button>
 </section></main>;
}
