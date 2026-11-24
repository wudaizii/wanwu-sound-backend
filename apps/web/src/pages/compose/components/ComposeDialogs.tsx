import {useState} from 'react';
import {VISIBILITIES,WORK_TITLE_MAX} from '@wanwu-v2/contracts/work';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {WorkSheet,sheetStyles} from '../../../shared/ui/WorkSheet';
import {composeCopy} from '../config/copy';
import type {Compose} from '../model/useCompose';
import styles from './ComposeDialogs.module.css';
import {useCloud} from '../../../shared/cloud/CloudProvider';

const save=composeCopy.saveDialog;

/** 保存这首作品: name it and put it on this visit's shelf. Visibility beyond 仅自己 and sharing need an account. */
export function SaveDialog({compose,onClose}:{compose:Compose;onClose:()=>void}){
 const {accountId}=useCloud();
 const [title,setTitle]=useState(compose.state.shelved?.title??save.defaultTitle(compose.shelfCount+1));
 const [shareNote,setShareNote]=useState(false);
 const [busy,setBusy]=useState(false);
 const submit=async()=>{setBusy(true);const ok=await compose.saveWork(title);setBusy(false);if(ok)onClose();};
 return <WorkSheet title={save.title} description={accountId?'保存到账号书架，并在后台生成成品音频。':save.description} onClose={onClose}>
  <form className={styles.saveForm} onSubmit={event=>{event.preventDefault();void submit();}}>
   <label className={styles.field}>
    <span>{save.name}</span>
    <input value={title} maxLength={WORK_TITLE_MAX} onChange={event=>setTitle(event.target.value)}/>
   </label>
   <fieldset className={styles.visibility}>
    <legend>{save.visibility}</legend>
    {VISIBILITIES.map(visibility=>{
     const open=visibility==='private';
     return <label key={visibility} data-off={!open||undefined}>
      <input type="radio" name="visibility" value={visibility} checked={open} disabled={!open} readOnly/>
      <Glyph name={open?'check':'lock'}/>
      <span>{save.visibilities[visibility]}</span>
      {!open&&<small>首版未开放</small>}
     </label>;
    })}
   </fieldset>
   <button type="button" className={styles.shareButton} onClick={()=>{if(accountId)onClose();void compose.share();setShareNote(true);}}>
    <Glyph name="share"/>{save.share}<small>{accountId?'试听确认后发布':'需要登录'}</small>
   </button>
   <p className={sheetStyles.note} role="status">{shareNote?composeCopy.notices['share-off']:accountId?'云端草稿与书架成品分开保存；正式保存不会自动公开。':save.sessionOnly}</p>
   <div className={sheetStyles.actions}>
    <button type="button" className={sheetStyles.secondary} onClick={onClose}>{save.cancel}</button>
    <button type="submit" className={sheetStyles.primary} disabled={busy||!title.trim()}><Glyph name="save"/>{compose.state.shelved?save.update:save.submit}</button>
   </div>
  </form>
 </WorkSheet>;
}

const again=composeCopy.againDialog;

/** 再来一首 when this piece is not on the shelf yet: offer to save first. */
export function AgainDialog({onSave,onDiscard,onClose}:{onSave:()=>void;onDiscard:()=>void;onClose:()=>void}){
 return <WorkSheet title={again.title} description={again.description} onClose={onClose}>
  <div className={sheetStyles.actions}>
   <button type="button" className={sheetStyles.secondary} onClick={onDiscard}>{again.discard}</button>
   <button type="button" className={sheetStyles.primary} onClick={onSave}><Glyph name="save"/>{again.saveFirst}</button>
  </div>
 </WorkSheet>;
}
