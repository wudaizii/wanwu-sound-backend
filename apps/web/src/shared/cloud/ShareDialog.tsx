import {useEffect,useRef,useState} from 'react';
import {WorkSheet} from '../ui/WorkSheet';
import {useCloud} from './CloudProvider';
import {cloudError} from './cloudTypes';
import styles from './CloudControls.module.css';

export function ShareDialog({onClose}:{onClose:()=>void}){
 const {workspace,render,share,busy}=useCloud(),[listened,setListened]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 const retried=useRef(false),revision=workspace.record?.savedRevision;
 useEffect(()=>{setListened(false);setConfirmed(false);retried.current=false;},[revision]);
 useEffect(()=>{
  let live=true,attempts=0,timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=async()=>{try{const next=await workspace.refreshRender();if(!live)return;await workspace.refreshShare();
    if(live&&next&&next.status!=='ready'&&next.status!=='failed'&&++attempts<60)timer=setTimeout(()=>void refresh(),3000);
   }catch(caught){if(live)setError(cloudError(caught));}};
  void refresh();return()=>{live=false;clearTimeout(timer);};
 },[workspace,revision]);
 const act=async(action:()=>Promise<unknown>)=>{setError('');try{await action();}catch(caught){setError(cloudError(caught));}};
 return <WorkSheet title="分享作品链接" description="只有再次确认发布，才会更新链接中的作品。编辑草稿不会自动发布。" onClose={onClose}>
  {!workspace.record?.savedRevision?<p className={styles.hint}>请先在「万物成曲」正式保存到书架。云端草稿保存不等于生成成品。</p>:<>
   <p className={styles.hint}>本次确认绑定书架修订 {workspace.record.savedRevision}。链接允许未登录的人打开，不会开放原始录音、地点或素材库。</p>
   {render?.status==='ready'&&render.playback?<audio className={styles.audio} controls src={render.playback.url} onPlay={()=>setListened(true)} onError={()=>{if(!retried.current){retried.current=true;void act(()=>workspace.refreshRender());}else setError('成品暂时不能播放，请稍后重新打开分享窗口。');}}/>
    :<p className={styles.status} role="status">{render?.status==='failed'?`成品生成失败：${render.failure??'请重试'}`:'成品正在后台生成，可以稍后再打开。'}</p>}
   {render?.status==='failed'&&<button className={styles.button} type="button" disabled={busy} onClick={()=>void act(()=>workspace.retryRender())}>重试成品生成</button>}
   <form className={styles.form} onSubmit={event=>{event.preventDefault();void act(()=>workspace.publish());}}>
    <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>我已试听本次成品，确认适合儿童，并同意允许任何持链接者播放。</label>
    <button className={styles.primary} type="submit" disabled={busy||!confirmed||!listened||render?.status!=='ready'}>确认发布此修订</button>
   </form>
  </>}
  {share?.status==='pending-render'&&<p role="status">等待已确认修订的成品生成，不是等待审核。</p>}
  {share?.status==='published'&&share.url&&<>
   <p className={styles.status}>已发布修订 {share.workRevision}。不会自动进入公开广场。</p>
   <a className={styles.link} href={share.url} target="_blank" rel="noopener noreferrer">{share.url}</a>
   <button className={styles.button} type="button" disabled={busy} onClick={()=>void act(()=>workspace.revoke())}>撤销分享链接</button>
  </>}
  {share?.status==='revoked'&&<p role="status">链接已撤销，不再签发新的播放地址。之前已下载或开始传输的音频不能收回。</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </WorkSheet>;
}
