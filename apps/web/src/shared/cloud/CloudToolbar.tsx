import {useEffect,useState} from 'react';
import {WorkSheet} from '../ui/WorkSheet';
import {useAccount} from '../account/AccountProvider';
import {useCloud} from './CloudProvider';
import {cloudError} from './cloudTypes';
import {ShareDialog} from './ShareDialog';
import {LibraryManager} from './LibraryManager';
import styles from './CloudControls.module.css';

export function CloudToolbar({onNavigate}:{onNavigate:(path:string)=>void}){
 const cloud=useCloud(),{workspace}=cloud,{account}=useAccount();
 const [confirm,setConfirm]=useState<{title:string;message:string;action:()=>Promise<unknown>|void}|null>(null);
 const [title,setTitle]=useState(cloud.title),[error,setError]=useState('');
 useEffect(()=>{setTitle(cloud.title);},[cloud.title]);
 useEffect(()=>{setConfirm(null);setError('');},[cloud.accountId]);
 const act=async(action:()=>Promise<unknown>|void)=>{setError('');try{await action();}catch(caught){setError(cloudError(caught));}};
 if(!account)return null;
 const choose=(title:string,message:string,action:()=>Promise<unknown>|void)=>{workspace.update({dialog:null});setConfirm({title,message,action});};
 return <>
  <aside className={styles.bar} aria-label="云端创作">
   <div className={styles.row}><p role="status">{cloud.workId?`${cloud.title} · `:''}{cloud.message}</p>
    <div className={styles.actions}>
     {!cloud.workId?<button type="button" className={styles.primary} disabled={cloud.busy} onClick={()=>choose('保存到我的账号','将当前已完成的声音与编排保存为独立云端草稿；会上传原件，但不会自动加入任何素材库或发布。尚未点「做好了」的声卡不在编排里。',()=>workspace.attach())}>确认保存当前云草稿</button>:
      <button type="button" className={styles.button} disabled={cloud.busy} onClick={()=>void act(()=>workspace.flush())}>立即同步</button>}
     <button type="button" className={styles.button} disabled={cloud.busy} onClick={()=>choose('新建独立云草稿','新草稿不会删除已有云端作品。当前页面尚未完成的声卡不会自动带入，请先完成它或确认离开。',async()=>{await workspace.freshDraft();onNavigate('/create?new');})}>新建云草稿</button>
     <button type="button" className={styles.button} onClick={()=>{workspace.update({dialog:'drafts'});void act(()=>workspace.refreshDrafts());}}>选择草稿</button>
     <button type="button" className={styles.button} onClick={()=>onNavigate('/works')}>账号书架</button>
     <button type="button" className={styles.button} onClick={()=>workspace.update({dialog:'library'})}>个人／共享库</button>
     {cloud.workId&&<button type="button" className={styles.button} onClick={()=>workspace.update({dialog:'share'})}>作品分享</button>}
     {account.role==='admin'&&<button type="button" className={styles.button} onClick={()=>onNavigate('/admin')}>管理</button>}
    </div>
   </div>
   {cloud.recoverable&&<button type="button" className={styles.button} onClick={()=>choose('恢复本页暂存','将恢复这个账号上次留在本页内存的作品，替换当前编辑画面。请确认当前新内容已经保存。',()=>{workspace.recover();onNavigate('/world');})}>恢复本页暂存</button>}
   {cloud.phase==='conflict'&&<div className={styles.actions}>
    <button type="button" className={styles.button} disabled={cloud.busy} onClick={()=>choose('重新加载云端','这会丢弃本页尚未保存的修改。若要保留，请先选择另存副本。',()=>workspace.open((cloud.workId??cloud.conflictId)!))}>重新加载</button>
    <button type="button" className={styles.button} disabled={cloud.busy} onClick={()=>void act(()=>workspace.attach(true))}>另存独立副本</button>
   </div>}
   {error&&<p className={styles.error} role="alert">{error}</p>}
  </aside>
  {confirm&&<WorkSheet title={confirm.title} onClose={()=>setConfirm(null)}><p>{confirm.message}</p><div className={styles.actions}>
   <button type="button" className={styles.button} onClick={()=>setConfirm(null)}>返回继续编辑</button>
   <button type="button" className={styles.primary} disabled={cloud.busy} onClick={()=>{const action=confirm.action;setConfirm(null);void act(action);}}>确认继续</button>
  </div></WorkSheet>}
  {cloud.dialog==='drafts'&&<WorkSheet title="我的云端草稿" onClose={()=>workspace.update({dialog:null})}>
   <p className={styles.hint}>草稿按作品独立保存，不改变其他设备当前打开哪一份。</p>
   {cloud.workId&&<form className={styles.form} onSubmit={event=>{event.preventDefault();void act(()=>workspace.rename(title));}}>
    <label>当前草稿名称<input value={title} maxLength={16} onChange={event=>setTitle(event.target.value)}/></label>
    <button className={styles.button} type="submit" disabled={cloud.busy}>保存名称</button>
   </form>}
   <ul className={styles.list}>{cloud.drafts.map(work=><li key={work.id}><p>{work.title} · 修订 {work.revision}</p><small>{new Date(work.updatedAt).toLocaleString('zh-CN')}</small>
    <button type="button" className={styles.button} disabled={cloud.busy} onClick={()=>choose('打开这份云草稿','请先同步当前修改；打开后会替换当前编辑画面。保存失败或有冲突时，可以先返回另存副本。',async()=>{await workspace.open(work.id);onNavigate('/world');})}>打开草稿</button>
   </li>)}</ul>
   {!cloud.drafts.length&&<p className={styles.hint}>当前没有未完成的云端草稿；已正式保存的作品在账号书架。</p>}
  </WorkSheet>}
  {cloud.dialog==='share'&&<ShareDialog onClose={()=>workspace.update({dialog:null})}/>}
  {cloud.dialog==='library'&&<LibraryManager onClose={()=>workspace.update({dialog:null})}/>}
 </>;
}
