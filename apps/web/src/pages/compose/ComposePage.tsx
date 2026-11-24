import {useState} from 'react';
import {flowSteps} from '../../app/navigation';
import {backgroundCopy} from '../../shared/background/copy';
import {longestSound,minSpan} from '../../shared/creation/arrangementTiming';
import {FlowHeader} from '../../shared/ui/FlowHeader';
import {Glyph} from '../../shared/ui/PaperIcon';
import {WorkHeaderActions} from '../../shared/ui/WorkHeaderActions';
import {useClassroom} from '../../shared/ui/classroom';
import {WorkIntro} from '../../shared/ui/WorkIntro';
import {shapeOf} from '@wanwu-v2/sound-rules/textbook-variation';
import {rhythmWords} from '../../shared/inspiration/talk';
import {composeCopy} from './config/copy';
import {composeGuide,guideLines} from './config/guide';
import {useCompose} from './model/useCompose';
import type {Compose} from './model/useCompose';
import {InspirationDialog} from '../../shared/inspiration/InspirationDialog';
import type {InspirationTab} from '../../shared/inspiration/InspirationDialog';
import {AgainDialog,SaveDialog} from './components/ComposeDialogs';
import {FooterBar} from './components/FooterBar';
import {ScoreCard} from './components/ScoreCard';
import {BackgroundCard,InspirationCard,SpanCard} from './components/SideCards';
import styles from './ComposePage.module.css';

/** What the squirrel says about the background switch, volume and instruments (the card itself holds only controls). */
function spokenBackground(compose:Compose){
 const plan=compose.backgroundPlan,{volume}=compose.state.settings.background;
 switch(compose.state.lastAction){
  case 'background-on':return plan?guideLines.backgroundOn(backgroundCopy.describe(plan,compose.entry?.title??null)):null;
  case 'background-off':return guideLines.backgroundOff;
  case 'background-volume':return guideLines.volume(volume<.3?'soft':volume>.7?'loud':'medium');
  case 'instrument':
   return compose.chosen.length?guideLines.instruments(backgroundCopy.parts(compose.parts,Object.fromEntries(compose.chosen.map(item=>[item.id,item.name])))):guideLines.instrumentsNone;
  case 'instrument-coming':return guideLines.instrumentsComing(compose.comingInstruments.join('、'));
  case 'ai-background':return compose.ai.status==='ready'?compose.usingAi?guideLines.aiOn:guideLines.aiOff:null;
  case 'ai-ready':return compose.ai.status==='ready'&&!compose.usingAi?guideLines.aiReady:null;
  default:return null;
 }
}

/** The squirrel speaks for the page: a notice (if any) first, otherwise what to do next. One voice, no repeated hints. */
function guideText(compose:Compose){
 const {arrangement,lastAction,notice}=compose.state;
 if(notice)return composeCopy.notices[notice.key];
 if(!arrangement)return guideLines.loading;
 if(compose.playing)return guideLines.playing;
 if(!arrangement.events.length)return guideLines.empty;
 if(lastAction==='saved'&&compose.shelved)return guideLines.saved;
 if(compose.ended)return guideLines.ended;
 if(lastAction==='span')return guideLines.span(arrangement.spanSeconds);
 if(lastAction==='span-blocked'){const longest=longestSound(arrangement);if(longest)return guideLines.spanBlocked(longest.unit.name,Math.ceil(longest.seconds-1e-6),minSpan(arrangement));}
 const said=spokenBackground(compose);if(said)return said;
 if(lastAction==='inspiration')return compose.entry?guideLines.inspirationSong(compose.entry.title,compose.variations):guideLines.inspirationMusic;
 if(lastAction==='inspiration-none')return guideLines.inspirationNone;
 const {inspiration}=compose.state.settings;
 if(lastAction==='variation'&&inspiration.kind==='textbook'&&compose.entry){
  const variation=inspiration.variation??'original',cell=compose.entry.rhythmCell;
  return guideLines.shapeTap(variation,rhythmWords(cell),rhythmWords(shapeOf(cell,variation).cell));
 }
 if(compose.now>0)return guideLines.paused;
 if(arrangement.origin==='example')return guideLines.example;
 return guideLines.idle;
}

type Dialog='save'|{textbook:InspirationTab}|'again'|null;

/** 万物成曲: the field's arrangement as a graphic score with one playback clock, plus length, background, inspiration and the shelf. */
export function ComposePage({onNavigate}:{onNavigate:(path:string)=>void}){
 const compose=useCompose();
 const classroom=useClassroom();
 const [dialog,setDialog]=useState<Dialog>(null);
 const text=guideText(compose);
 const savedNote=compose.state.lastAction==='saved'&&compose.shelved;
 const requestSave=()=>{if(compose.canSave())setDialog('save');};
 const startAgain=async()=>{setDialog(null);await compose.startNew();onNavigate('/create');};
 const again=()=>{
  const arrangement=compose.state.arrangement;
  // Only the child's own, unshelved piece would be lost; an example or an empty field just moves on.
  if(arrangement?.origin==='child'&&arrangement.events.length&&!compose.shelved)setDialog('again');
  else void startAgain();
 };
 return <div className={styles.shell}>
  <FlowHeader steps={flowSteps} current="compose" onNavigate={onNavigate} aside={<WorkHeaderActions onNavigate={onNavigate} classroom={classroom}/>}/>
  <main className={styles.page}>
   <WorkIntro title={composeCopy.title} subtitle={composeCopy.subtitle} guide={composeGuide} text={text} tone={compose.state.notice?.tone} fit className={styles.intro}/>
   <div className={styles.workspace}>
    <ScoreCard compose={compose} onBack={()=>onNavigate('/world')} shelfLink={savedNote?<button type="button" onClick={()=>onNavigate('/works')}><Glyph name="shelf"/>{composeCopy.goShelf}</button>:null}/>
    <div className={styles.side}>
     <SpanCard compose={compose}/>
     <InspirationCard compose={compose} onOpen={tab=>setDialog({textbook:tab})}/>
     <BackgroundCard compose={compose}/>
    </div>
   </div>
   <FooterBar compose={compose} onSave={requestSave} onBack={()=>onNavigate('/world')} onAgain={again}/>
  </main>
  {dialog==='save'&&<SaveDialog compose={compose} onClose={()=>setDialog(null)}/>}
  {typeof dialog==='object'&&dialog&&<InspirationDialog value={compose.state.settings.inspiration} entries={compose.entries} matches={compose.matches} initialTab={dialog.textbook} teachingOpen={compose.teachingOpen} onChange={compose.setInspiration} onClose={()=>setDialog(null)}/>}
  {dialog==='again'&&<AgainDialog onClose={()=>setDialog(null)} onSave={()=>setDialog(compose.canSave()?'save':null)} onDiscard={()=>void startAgain()}/>}
 </div>;
}
