import {useEffect,useRef} from 'react';
import type {HomeDestination} from '../../app/navigation';
import {Glyph} from '../../shared/ui/PaperIcon';
import {HomeScene} from './components/HomeScene';
import {HomeHeader} from './components/HomeHeader';
import {HomeHero} from './components/HomeHero';
import {useForestOpening} from './model/useForestOpening';
import {useHomeSound} from './model/useHomeSound';
import {readPerformanceHints} from '../../shared/platform/capabilities';
import styles from './HomePage.module.css';
export function HomePage({onNavigate,suspended=false,departing=false}:{onNavigate:(page:HomeDestination)=>void;suspended?:boolean;departing?:boolean}){
 const scene=useRef<HTMLDivElement>(null),curtain=useRef<HTMLDivElement>(null),audio=useRef<HTMLAudioElement>(null);
 const opening=useForestOpening(scene,curtain),sound=useHomeSound(audio,suspended||departing);
 useEffect(()=>{if(departing)opening.skip();},[departing,opening.skip]);
 const reduced=readPerformanceHints().reduced;
 return <>
  <main className={[styles.homepage,reduced?styles['reduced-motion']:''].join(' ')} id="homepage" inert={departing||undefined} aria-busy={departing||undefined} aria-label="万物声谱首页"
   data-intro-phase={opening.state.phase} data-intro-reason={opening.state.reason||'ready'} data-sound-state={sound.active.phase} data-sound-id={sound.active.id||''}>
   <HomeScene sceneRef={scene} waiting={opening.state.phase==='waiting'} active={sound.active} onInteract={sound.interact}/>
   <div ref={curtain} className={styles.intro} aria-hidden="true"/>
   {opening.state.phase!=='settled'&&<button type="button" className={styles['skip-intro']} onClick={opening.skip}>跳过开场</button>}
   <HomeHeader onNavigate={onNavigate}/><HomeHero onStart={()=>onNavigate('create')} feedback={sound.status} opening={opening.state} cycle={opening.cycle}/>
   <div className={styles['home-controls']} aria-label="首页声音与开场控制">
    <button type="button" aria-label="重看开场" title="重看开场" onClick={()=>{const hints=readPerformanceHints();if(hints.reduced||hints.saveData)sound.notify('当前使用轻动效模式，直接欣赏静态场景。');opening.replay();}}><Glyph name="replay"/></button>
    <button type="button" aria-label={sound.muted?'开启声音':'关闭声音'} aria-pressed={sound.muted} title={sound.muted?'开启声音':'关闭声音'} onClick={sound.toggleMute}><Glyph name={sound.muted?'muted':'sound'}/></button>
    <a href="/legal/sound-sources.html" aria-label="声音来源与许可" title="声音来源与许可">来源</a>
   </div>
   <audio ref={audio} preload="none" hidden/>
   <footer className={styles.award}>2026小有可为AI向善挑战赛·获奖作品</footer>
  </main>
 </>;
}
