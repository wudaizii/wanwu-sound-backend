import {promptCopy} from '../config/promptCopy';
import type {PromptLab} from '../model/usePromptLab';
import styles from '../PromptLabPage.module.css';

/** Three columns (brief → corpus → request), then a pasted reply and what the page would show from it. */
export function PromptPanels({lab}:{lab:PromptLab}){
 const {view,check}=lab;
 return <>
  {view.note&&<p className={styles.note} role="note">{view.note}</p>}
  <div className={styles.columns}>
   <section className={styles.panel} aria-labelledby="pl-brief">
    <h2 id="pl-brief">{promptCopy.brief}</h2>
    {view.brief?<pre>{JSON.stringify(view.brief,null,1)}</pre>:<p className={styles.muted}>{promptCopy.noPrompt}</p>}
   </section>
   <section className={styles.panel} aria-labelledby="pl-local">
    <h2 id="pl-local">{promptCopy.local}</h2>
    {view.local.length?<ol>{view.local.map((line,i)=><li key={i}>{line}</li>)}</ol>:<p className={styles.muted}>{promptCopy.noPrompt}</p>}
   </section>
   <section className={styles.panel} aria-labelledby="pl-prompt">
    <h2 id="pl-prompt">{promptCopy.prompt}</h2>
    {view.built?<>
     {view.built.system&&<details><summary>{promptCopy.system}</summary><pre>{view.built.system}</pre></details>}
     <pre>{view.built.prompt}</pre>
     <p className={styles.muted}>temperature {view.built.temperature}</p>
    </>:<p className={styles.muted}>{promptCopy.noPrompt}</p>}
   </section>
  </div>
  {view.check&&<section className={`${styles.panel} ${styles.reply}`} aria-labelledby="pl-reply">
   <h2 id="pl-reply">{promptCopy.reply}</h2>
   <p className={styles.muted}>{promptCopy.replyNote}</p>
   <div className={styles.replyActions}>
    <button type="button" onClick={lab.fillExample}>{promptCopy.fillExample}</button>
    <button type="button" onClick={()=>lab.setReply('')} disabled={!lab.reply}>{promptCopy.clear}</button>
   </div>
   <textarea value={lab.reply} rows={6} spellCheck={false} aria-label={promptCopy.reply} onChange={event=>lab.setReply(event.target.value)}/>
   {check&&<div className={styles.check} data-status={check.status} role="status">
    <b>{promptCopy.verdict[check.status]}</b>
    {check.repairs.length>0&&<p>{promptCopy.repairs}：{check.repairs.join('；')}</p>}
    {check.notes.length>0&&<ul>{check.notes.map((note,i)=><li key={i}>{note}</li>)}</ul>}
    {check.shown.length>0&&<><h3>{promptCopy.shown}</h3><ol>{check.shown.map((line,i)=><li key={i}>{line}</li>)}</ol></>}
   </div>}
  </section>}
 </>;
}
