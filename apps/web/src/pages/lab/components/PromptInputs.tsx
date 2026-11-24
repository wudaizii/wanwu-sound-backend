import {MOODS} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CHOICES,SOUND_DIMENSIONS,SOUND_KINDS} from '@wanwu-v2/contracts/sound';
import type {SoundDimension,SoundKind} from '@wanwu-v2/contracts/sound';
import {TEXTBOOK_VARIATIONS} from '@wanwu-v2/contracts/textbook';
import type {TextbookVariation} from '@wanwu-v2/contracts/textbook';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import {dimensionCopy} from '../../../shared/creation/dimensionCopy';
import {moodLabels} from '../../../shared/creation/moodCopy';
import {variationNames} from '../../../shared/inspiration/talk';
import {promptCopy} from '../config/promptCopy';
import type {PromptLab} from '../model/usePromptLab';
import styles from '../PromptLabPage.module.css';

/** What the chosen task depends on: the work's mood, the textbook song and its shape; per task a few more inputs. */
export function PromptInputs({lab}:{lab:PromptLab}){
 const {task,hint}=lab;
 const piece=task==='work-talk'||task==='textbook-talk'||task==='background-audio'||task==='background-notes';
 return <section className={styles.inputs} aria-label={promptCopy.inputs}>
  {(piece||task==='textbook-words')&&<label>{promptCopy.song}
   <select value={lab.track?.id??''} onChange={event=>lab.setTrackId(event.target.value||null)}>
    {task!=='textbook-words'&&<option value="">{promptCopy.noSong}</option>}
    {lab.tracks.map(track=><option key={track.id} value={track.id}>{track.title}</option>)}
   </select>
  </label>}
  {piece&&<>
   <label>{promptCopy.mood}
    <select value={lab.mood??''} onChange={event=>lab.setMood((event.target.value||null) as MoodId|null)}>
     <option value="">{promptCopy.noMood}</option>
     {MOODS.map(mood=><option key={mood} value={mood}>{moodLabels[mood]}</option>)}
    </select>
   </label>
   {lab.track&&<label>{promptCopy.variation}
    <select value={lab.variation} onChange={event=>lab.setVariation(event.target.value as TextbookVariation)}>
     {TEXTBOOK_VARIATIONS.map(variation=><option key={variation} value={variation}>{variationNames[variation]}</option>)}
    </select>
   </label>}
  </>}
  {task==='background-notes'&&<label>{promptCopy.attempt}
   <select value={lab.attempt} onChange={event=>lab.setAttempt(Number(event.target.value))}>
    {[0,1,2].map(attempt=><option key={attempt} value={attempt}>{attempt+1}</option>)}
   </select>
  </label>}
  {task==='sound-hint'&&<>
   <label>{promptCopy.hint}
    <select value={`${hint.dimension}:${hint.value}`} onChange={event=>{const [dimension,value]=event.target.value.split(':') as [SoundDimension,string];lab.setHint({...hint,dimension,value});}}>
     {SOUND_DIMENSIONS.flatMap(dimension=>(SOUND_CHOICES[dimension] as readonly string[]).map(value=><option key={`${dimension}:${value}`} value={`${dimension}:${value}`}>
      {dimensionCopy[dimension].label} · {(dimensionCopy[dimension].options as Record<string,string>)[value]}</option>))}
    </select>
   </label>
   <label>{promptCopy.kind}
    <select value={hint.kind??''} onChange={event=>lab.setHint({...hint,kind:(event.target.value||null) as SoundKind|null})}>
     <option value="">{promptCopy.noKind}</option>
     {SOUND_KINDS.map(kind=><option key={kind} value={kind}>{promptCopy.kinds[kind]}</option>)}
    </select>
   </label>
  </>}
  {task==='mood-words'&&<label>{promptCopy.moodText}<input type="text" value={lab.moodText} onChange={event=>lab.setMoodText(event.target.value)}/></label>}
 </section>;
}
