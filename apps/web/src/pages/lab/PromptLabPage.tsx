import {TASKS,TASK_IDS} from '@wanwu-v2/prompts/tasks';
import {promptCopy} from './config/promptCopy';
import {PromptInputs} from './components/PromptInputs';
import {PromptPanels} from './components/PromptPanels';
import {usePromptLab} from './model/usePromptLab';
import styles from './PromptLabPage.module.css';

/**
 * 提示词台 (/lab/prompts): each AI task seen whole — facts the program counted, the corpus that speaks without a model,
 * the request the server would send, and how a reply is checked. Built only in development or a preview build with
 * VITE_ENABLE_LAB=1 (app/App.tsx); the public site does not include it, and nothing here is sent anywhere.
 */
export function PromptLabPage(){
 const lab=usePromptLab(),info=TASKS[lab.task];
 return <main className={styles.page}>
  <header className={styles.header}>
   <h1>{promptCopy.title}<a href="/lab/sound-rules">{promptCopy.toRules}</a></h1>
   <p>{promptCopy.subtitle}<br/>{promptCopy.readme}</p>
  </header>
  <nav className={styles.tasks} role="tablist" aria-label={promptCopy.title}>
   {TASK_IDS.map(id=><button key={id} type="button" role="tab" aria-selected={lab.task===id} data-closed={TASKS[id].file.status==='closed'||undefined}
    onClick={()=>lab.pickTask(id)}>{promptCopy.tasks[id]}</button>)}
  </nav>
  <p className={styles.meta}>
   <b>{promptCopy.status[info.file.status]}</b>
   {promptCopy.meta(info.model,info.file.version,promptCopy.when[info.when],info.fallback)}
  </p>
  <PromptInputs lab={lab}/>
  <PromptPanels lab={lab}/>
 </main>;
}
