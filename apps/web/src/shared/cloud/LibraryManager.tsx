import {useEffect,useState,useSyncExternalStore} from 'react';
import type {LibraryEntry,SourceView} from '@wanwu-v2/contracts/cloud';
import {CONFIRMATION_VERSION} from '@wanwu-v2/contracts/cloud';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {WorkSheet} from '../ui/WorkSheet';
import {workSession} from '../creation/workSession';
import {sessionArchive} from '../creation/sourceArchive';
import {newId} from '../creation/ids';
import {useCloud} from './CloudProvider';
import {cloudError} from './cloudTypes';
import {LibraryAudio} from './LibraryAudio';
import {libraryEntries} from './libraryEntries';
import styles from './CloudControls.module.css';

export function LibraryManager({onClose}:{onClose:()=>void}){
 const {workspace}=useCloud(),arrangement=useSyncExternalStore(workSession.subscribe,workSession.current);
 const archive=useSyncExternalStore(sessionArchive.subscribe,sessionArchive.list);
 const [entries,setEntries]=useState<LibraryEntry[]>([]),[sourceId,setSourceId]=useState(''),[scope,setScope]=useState<'private'|'teachers'>('private');
 const [kind,setKind]=useState<'source'|'sound-unit'>('source'),[ready,setReady]=useState<SourceView|null>(null),[editing,setEditing]=useState<LibraryEntry|null>(null);
 const [listened,setListened]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[removing,setRemoving]=useState<string|null>(null);
 const [preview,setPreview]=useState<string|null>(null);
 const choices=[...new Set([...(arrangement?.units.map(unit=>unit.sourceId)??[]),...archive.map(source=>source.id)])];
 const refresh=async()=>{
  const account=workspace.state.accountId;
  const results=await Promise.all((['sources','sound-units'] as const).flatMap(path=>(['mine','teachers'] as const).map(scope=>libraryEntries(workspace.api,path,scope))));
  if(account===workspace.state.accountId)setEntries([...new Map(results.flat().map(entry=>[entry.entryId,entry])).values()]);
 };
 useEffect(()=>{let live=true;void refresh().catch(caught=>{if(live)setError(cloudError(caught));});return()=>{live=false;};},[workspace]);
 const act=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setMessage('');try{await action();}catch(caught){setError(cloudError(caught));}finally{setBusy(false);}};
 const prepare=async()=>{
  if(!sourceId)throw new Error('请先选择本页的一个声音。');
  const unit:SoundUnitDraft=arrangement?.units.find(item=>item.sourceId===sourceId)??{version:'sound-v1',id:newId('unit'),sourceId,name:'声音',maker:null,markerIndex:0,shape:{},input:'manual',createdAt:new Date().toISOString()};
  const draft=arrangement??{version:'arrangement-v1',id:newId('work'),units:[],events:[],rows:3,spanSeconds:30,mood:null,origin:'child',updatedAt:new Date().toISOString()};
  const result=await workspace.media.prepare({...draft,units:[unit]},setMessage);setReady(result.get(sourceId)!);setListened(false);setConfirmed(false);
 };
 const submit=async()=>{
  if(!ready||!confirmed||!listened)throw new Error('请先准备并试听这份音频，再勾选确认。');
  const unit=editing?.unit??arrangement?.units.find(item=>item.sourceId===ready.source.id);
  if(kind==='sound-unit'&&!unit)throw new Error('声卡入库需要先在当前作品中完成这张声卡。');
  const proof={listened:true,suitableForChildren:true,statementVersion:CONFIRMATION_VERSION};
  if(editing)await workspace.api.business(`/api/v1/library/entries/${editing.entryId}`,'PATCH',{scope,...(kind==='sound-unit'?{unit}:{}),confirmation:proof});
  else await workspace.api.business('/api/v1/library/entries','POST',{sourceId:ready.source.id,kind,scope,...(kind==='sound-unit'?{unit}:{}),confirmation:proof});
  setMessage('已按本次试听确认加入选定素材库。上传本身不会自动入库。');setReady(null);setEditing(null);setConfirmed(false);setListened(false);await refresh();
 };
 return <WorkSheet title="个人与老师共享素材库" description="两种素材库都需要老师试听确认。这里没有付费机器审核，也不代表平台逐条审核。" onClose={onClose}>
  <form className={styles.form} onSubmit={event=>{event.preventDefault();void act(submit);}}>
   <label>准备入库的本页声音<select value={sourceId} disabled={busy||!!editing} onChange={event=>{setSourceId(event.target.value);setReady(null);setListened(false);setConfirmed(false);}}>
    <option value="">请选择声音</option>{choices.map(id=><option key={id} value={id}>{workSession.source(id)?.label??archive.find(source=>source.id===id)?.label??id}</option>)}
   </select></label>
   <div className={styles.actions}><button className={styles.button} type="button" disabled={busy||!sourceId||!!editing} onClick={()=>void act(prepare)}>上传／准备试听（不入库）</button></div>
   <label>保存内容<select value={kind} disabled={busy||!!editing} onChange={event=>{setKind(event.target.value as 'source'|'sound-unit');setConfirmed(false);setListened(false);}}><option value="source">音源原声</option><option value="sound-unit">当前声卡与五维选择</option></select></label>
   <label>素材范围<select value={scope} disabled={busy} onChange={event=>{setScope(event.target.value as 'private'|'teachers');setConfirmed(false);}}><option value="private">个人素材库</option><option value="teachers">受邀老师共享库</option></select></label>
   {ready?.playback&&<><p className={styles.hint}>试听：{ready.source.label} · {Math.round(ready.source.durationMs/100)/10} 秒</p>
    <LibraryAudio view={ready} unit={kind==='sound-unit'?editing?.unit??arrangement?.units.find(unit=>unit.sourceId===ready.source.id):null} media={workspace.media} onPlay={()=>setListened(true)} onReset={()=>{setListened(false);setConfirmed(false);}}/></>}
   <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>我已试听本次声音，确认适合儿童，且有权按所选范围提供该内容。声卡入库也包含本次五维参数。</label>
   <button className={styles.primary} type="submit" disabled={busy||!ready||!confirmed||!listened}>{editing?'重新确认并更新条目':'确认加入选定素材库'}</button>
   {editing&&<button type="button" className={styles.button} onClick={()=>{setEditing(null);setReady(null);}}>取消修改</button>}
  </form>
  {message&&<p className={styles.status} role="status">{message}</p>}{error&&<p className={styles.error} role="alert">{error}</p>}
  {removing&&<div className={styles.card}><p>移除后停止通过此条目新增引用；已合法保存的作品仍保留音频。</p><div className={styles.actions}>
   <button type="button" className={styles.button} onClick={()=>setRemoving(null)}>取消移除</button>
   <button type="button" className={styles.primary} disabled={busy} onClick={()=>void act(async()=>{await workspace.api.business(`/api/v1/library/entries/${removing}`,'DELETE');setRemoving(null);await refresh();})}>确认移除条目</button>
  </div></div>}
  <ul className={styles.list}>{entries.map(entry=><li key={entry.entryId}>
   <p>{entry.unit?.name??entry.source.source.label} · {entry.scope==='private'?'个人':'老师共享'} · {entry.kind==='source'?'音源':'声卡'}</p>
   <small>确认时间：{new Date(entry.confirmation.confirmedAt).toLocaleString('zh-CN')} · 音源 ID：{entry.sourceId}</small>
   {preview===entry.entryId?<LibraryAudio view={entry.source} unit={entry.unit} media={workspace.media}/>:<button type="button" className={styles.button} onClick={()=>setPreview(entry.entryId)}>试听{entry.kind==='sound-unit'?'声卡':'原声'}</button>}
   {entry.mine&&<div className={styles.actions}>
    <button type="button" className={styles.button} disabled={busy} onClick={()=>void act(async()=>{setSourceId(entry.sourceId);setKind(entry.kind);setScope(entry.scope==='private'?'teachers':'private');setEditing(entry);setReady(await workspace.media.source(entry.sourceId));setConfirmed(false);setListened(false);})}>修改范围（重新确认）</button>
    <button type="button" className={styles.button} disabled={busy} onClick={()=>setRemoving(entry.entryId)}>移除条目</button>
   </div>}
  </li>)}</ul>
  {!entries.length&&<p className={styles.hint}>没有已确认的素材条目。仅上传的声音不会列入这里。</p>}
 </WorkSheet>;
}
