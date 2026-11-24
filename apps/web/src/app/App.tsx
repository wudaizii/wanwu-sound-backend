import {lazy,Suspense,useEffect,useState} from 'react';
import {HomePage} from '../pages/home/HomePage';
import type {FinishResult,FinishThen,FinishedSound} from '../pages/sound-birth/model/useSoundBirth';
import {HomeBirthDestination,HomeBirthTransition} from './transitions/home-birth/HomeBirthTransition';
import {useHomeBirthTransition} from './transitions/home-birth/useHomeBirthTransition';
import {workSession} from '../shared/creation/workSession';
import {NoticeDialog} from '../shared/ui/NoticeDialog';
import {ModelConfigDialog} from '../shared/model-config/ModelConfigDialog';
import {emptyModelConfig} from '../shared/model-config/modelConfig';
import {PageFallback} from './PageFallback';
import {prefetchWhenIdle} from './prefetch';
import type {HomeDestination} from './navigation';
import {parseRoute,useRoute} from './router';
import type {Route} from './router';

const loadSoundBirth=()=>import('../pages/sound-birth/SoundBirthPage');
const SoundBirthPage=lazy(()=>loadSoundBirth().then(module=>({default:module.SoundBirthPage})));
const loadSoundWorld=()=>import('../pages/sound-world/SoundWorldPage');
const SoundWorldPage=lazy(()=>loadSoundWorld().then(module=>({default:module.SoundWorldPage})));
const loadCompose=()=>import('../pages/compose/ComposePage');
const ComposePage=lazy(()=>loadCompose().then(module=>({default:module.ComposePage})));
const loadWorks=()=>import('../pages/works/WorksPage');
const WorksPage=lazy(()=>loadWorks().then(module=>({default:module.WorksPage})));
// 调音台: development, or a preview build with VITE_ENABLE_LAB=1. Elsewhere this is constant false and the build leaves
// the page out entirely.
const LAB_ENABLED=import.meta.env.DEV||import.meta.env.VITE_ENABLE_LAB==='1';
const LabPage=LAB_ENABLED?lazy(()=>import('../pages/lab/LabPage').then(module=>({default:module.LabPage}))):null;
const PromptLabPage=LAB_ENABLED?lazy(()=>import('../pages/lab/PromptLabPage').then(module=>({default:module.PromptLabPage}))):null;
// Prefetch 声音诞生 before the home → birth crossfade; fetch its code once the home page and its opening have had the network to themselves.
const birthPrefetchDelayMs=3000;
/** The next step's code waits a little longer than the current page's own artwork and sounds. */
const nextPagePrefetchDelayMs=1500;

/** Flow-header links carry plain paths; map them back to routes. */
const routeFor=(path:string):Route=>parseRoute(path);

export function App(){
 const [opened,navigate]=useRoute();
 // Without the lab in this build, its address is just the home page.
 const route:Route=(opened.page==='lab'||opened.page==='lab-prompts')&&!LAB_ENABLED?{page:'home'}:opened;
 const transition=useHomeBirthTransition(route.page,()=>navigate({page:'sound-birth'}));
 const [pending,setPending]=useState<HomeDestination|null>(null);
 /** 返回声音诞生 from a work page goes on editing the last sound; from home, or 做一个新声音 (`/create?new`), starts fresh. */
 const [birthEditing,setBirthEditing]=useState(false);
 const go=(path:string)=>{
  const [pathname,query]=path.split('?');
  if(pathname==='/create')setBirthEditing(query!=='new'&&route.page!=='home');
  navigate(routeFor(pathname!));
 };
 // Keys exist only in React memory for this page session; never write them to browser storage.
 const [modelConfig,setModelConfig]=useState(emptyModelConfig);
 useEffect(()=>{if(route.page==='home')return prefetchWhenIdle(loadSoundBirth,birthPrefetchDelayMs);},[route.page]);
 // 万物声场 follows 声音诞生, so warm its code while the child shapes a sound.
 useEffect(()=>{if(route.page==='sound-birth')return prefetchWhenIdle(loadSoundWorld,nextPagePrefetchDelayMs);},[route.page]);
 // 万物成曲 follows 万物声场; the shelf is one tap from 万物成曲.
 useEffect(()=>{
  if(route.page==='sound-world')return prefetchWhenIdle(loadCompose,nextPagePrefetchDelayMs);
  if(route.page==='compose')return prefetchWhenIdle(loadWorks,nextPagePrefetchDelayMs);
 },[route.page]);
 // 声音诞生 → 万物声场: the finished unit joins the current work (this visit only), or updates the sound it was made
 // from, then the field opens. 再做一个 keeps it the same way and stays on 声音诞生 for the next sound; 做好了 with no new
 // sound goes on with the sounds already kept.
 const finishSound=(sound:FinishedSound,then:FinishThen):FinishResult=>{
  if(sound){
   const {draft,source}=sound;
   if(workSession.hasUnit(draft.id))workSession.updateUnit(draft,source);
   else if(workSession.addUnit(draft,source).status==='full')return {status:'full'};
  }else if(!workSession.unitCount())return {status:'empty'};
  if(then==='another')return {status:'kept',nextMarkerIndex:workSession.nextMarkerIndex(),count:workSession.unitCount()};
  navigate({page:'sound-world'});
  return {status:'opened'};
 };
 const renderPage=()=>{
  if(route.page==='sound-birth')return <Suspense fallback={<PageFallback current="birth"/>}>
   <HomeBirthDestination onReady={transition.ready}><SoundBirthPage entryMotion={transition.phase==='idle'} markerIndex={workSession.nextMarkerIndex()} editing={birthEditing?workSession.lastMade():null} onNavigate={go} onFinish={finishSound}/></HomeBirthDestination>
  </Suspense>;
  // 万物声场 → 万物成曲: the arrangement is already kept in the current work by the field's repository.
  if(route.page==='sound-world')return <Suspense fallback={<PageFallback current="world"/>}>
   <SoundWorldPage onNavigate={go} onFinish={()=>{navigate({page:'compose'});return {status:'opened'};}}/>
  </Suspense>;
  if(route.page==='compose')return <Suspense fallback={<PageFallback current="compose"/>}>
   <ComposePage onNavigate={go}/>
  </Suspense>;
  if(route.page==='lab'&&LabPage)return <Suspense fallback={<PageFallback current={null}/>}><LabPage/></Suspense>;
  if(route.page==='lab-prompts'&&PromptLabPage)return <Suspense fallback={<PageFallback current={null}/>}><PromptLabPage/></Suspense>;
  if(route.page==='works')return <Suspense fallback={<PageFallback current={null}/>}>
   <WorksPage onNavigate={go}/>
  </Suspense>;
  return null;
 };
 const crossfading=transition.phase!=='idle';
 const showHome=route.page==='home'||(route.page==='sound-birth'&&crossfading);
 return <>
  <HomeBirthTransition phase={transition.phase} overlay={route.page!=='home'} scrollOffset={transition.scrollOffset}
   home={showHome&&<HomePage onNavigate={page=>{
    if(page==='create'){setBirthEditing(false);void loadSoundBirth().catch(()=>{});transition.start();}
    else if(page==='shelf')navigate({page:'works'});
    else setPending(page);
   }} suspended={pending!==null} departing={crossfading}/>}
  >{renderPage()}</HomeBirthTransition>
  {route.page==='home'&&(pending==='api'?<ModelConfigDialog config={modelConfig} onApply={setModelConfig} onClose={()=>setPending(null)}/>:pending&&<NoticeDialog title="这里还在准备中" onClose={()=>setPending(null)}>
   <p>先点点小鸟、青蛙，听听森林里的声音吧。</p>
  </NoticeDialog>)}
 </>;
}
