import {useMemo} from 'react';
import {MOODS} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CHOICES,SOUND_DIMENSIONS} from '@wanwu-v2/contracts/sound';
import {computePeaks} from '../../../shared/audio/peaks';
import {dimensionCopy} from '../../../shared/creation/dimensionCopy';
import {exampleSounds} from '../../../shared/creation/exampleSounds';
import {moodLabels} from '../../../shared/creation/moodCopy';
import testSet from '../../../../../../docs/assets/test-set.json';
import {labCopy} from '../config/copy';
import type {Lab} from '../model/useLab';
import styles from '../LabPage.module.css';

const BINS=240;
const kindNames={one:'单个声音',series:'一串声音',texture:'连成一片'} as const;
const expected=new Map(testSet.sounds.map(entry=>[entry.id,entry.expectedKind]));

/** The sound being tuned: pick one (test set / library, or upload), see its 声音体检 on the waveform, and listen. */
export function SoundPanel({lab}:{lab:Lab}){
 const {sound,analysis}=lab;
 const peaks=useMemo(()=>sound?computePeaks(Array.from({length:sound.buffer.numberOfChannels},(_,i)=>sound.buffer.getChannelData(i)),BINS):[],[sound]);
 const total=sound?sound.buffer.duration*1000:1,pct=(ms:number)=>`${ms/total*100}%`;
 const want=sound&&expected.get(sound.id),kind=analysis?.silent?'silent':analysis?.kind;
 return <section className={styles.panel} aria-labelledby="lab-sound">
  <h2 id="lab-sound">{labCopy.soundTitle}</h2>
  <div className={styles.pickRow}>
   {exampleSounds.map(item=><button key={item.id} type="button" aria-pressed={sound?.id===item.id} onClick={()=>void lab.pick(item.id)}>{item.label}</button>)}
   <label className={styles.upload}>{labCopy.upload}<input type="file" accept="audio/*" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void lab.upload(file);event.target.value='';}}/></label>
  </div>
  <p className={styles.note}>{labCopy.testSetNote(testSet.sounds.length,testSet.toCollect.length)}</p>
  {lab.loading&&<p role="status">{labCopy.loading}</p>}
  {lab.error&&<p role="alert" className={styles.problem}>{lab.error}</p>}
  {sound&&analysis&&<>
   <div className={styles.wave} aria-label={labCopy.waveLabel}>
    {analysis.main&&<i className={styles.main} style={{left:pct(analysis.main.startMs),width:pct(analysis.main.endMs-analysis.main.startMs)}}/>}
    {analysis.units.map((unit,i)=><i key={i} className={styles.unit} style={{left:pct(unit.startMs),width:pct(unit.endMs-unit.startMs)}}/>)}
    <svg viewBox={`0 0 ${BINS} 100`} preserveAspectRatio="none" aria-hidden="true">
     {peaks.map((peak,i)=>{const h=Math.max(2,peak*96);return <rect key={i} x={i+.15} width={.7} y={50-h/2} height={h}/>;})}
    </svg>
   </div>
   <dl className={styles.facts}>
    <div><dt>{labCopy.kind}</dt><dd>{analysis.silent?labCopy.silent:kindNames[analysis.kind]}{want&&<em data-ok={want===kind||undefined}>{labCopy.expected(want===kind,want==='silent'?labCopy.silent:kindNames[want as keyof typeof kindNames])}</em>}</dd></div>
    <div><dt>{labCopy.units}</dt><dd>{analysis.units.length}</dd></div>
    <div><dt>{labCopy.unitMs}</dt><dd>{(analysis.unitMs/1000).toFixed(2)} 秒（{labCopy.bands[analysis.lengthBand]}）</dd></div>
    <div><dt>{labCopy.band}</dt><dd>{labCopy.pitch[analysis.band]}</dd></div>
    <div><dt>{labCopy.loudness}</dt><dd>{analysis.loudnessDb.toFixed(1)} / {analysis.peakDb.toFixed(1)} dB</dd></div>
   </dl>
   <div className={styles.dimensions}>
    {SOUND_DIMENSIONS.map(dimension=><div key={dimension} role="group" aria-label={dimensionCopy[dimension].label}>
     <b>{dimensionCopy[dimension].label}</b>
     {(SOUND_CHOICES[dimension] as readonly string[]).map(value=><button key={value} type="button" aria-pressed={lab.shape[dimension]===value}
      onClick={()=>lab.choose(dimension,value)}>{(dimensionCopy[dimension].options as Record<string,string>)[value]}</button>)}
    </div>)}
    <div role="group" aria-label={labCopy.mood}>
     <b>{labCopy.mood}</b>
     <button type="button" aria-pressed={lab.mood===null} onClick={()=>lab.setMood(null)}>{labCopy.noMood}</button>
     {MOODS.map(mood=><button key={mood} type="button" aria-pressed={lab.mood===mood} onClick={()=>lab.setMood(mood)}>{moodLabels[mood]}</button>)}
    </div>
   </div>
   <div className={styles.listen}>
    {(['original','shaped','background'] as const).map(kind=><button key={kind} type="button" aria-pressed={lab.playing===kind} disabled={!lab.valid}
     onClick={()=>lab.playing===kind?lab.stop():void lab.listen(kind)}>{lab.playing===kind?labCopy.stop:labCopy.listen[kind]}</button>)}
   </div>
  </>}
 </section>;
}
