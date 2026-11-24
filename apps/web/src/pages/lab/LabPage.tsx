import {labCopy} from './config/copy';
import {RuleEditor} from './components/RuleEditor';
import {SoundPanel} from './components/SoundPanel';
import {useLab} from './model/useLab';
import styles from './LabPage.module.css';

/**
 * 调音台 (/lab/sound-rules): tune the general rules against a fixed set of sounds and export the rule files. Built only
 * in development or a preview build with VITE_ENABLE_LAB=1 (app/App.tsx); the public site does not include it.
 */
export function LabPage(){
 const lab=useLab();
 return <main className={styles.page}>
  <header className={styles.header}>
   <h1>{labCopy.title}<a href="/lab/prompts">{labCopy.toPrompts}</a></h1>
   <p>{labCopy.subtitle}<br/>{labCopy.readme}</p>
  </header>
  <div className={styles.columns}>
   <SoundPanel lab={lab}/>
   <RuleEditor lab={lab}/>
  </div>
 </main>;
}
