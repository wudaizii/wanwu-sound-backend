import type {IntroState} from './introState';
export type TitlePhase='waiting'|'entering'|'settled'|'fallback';
export function deriveTitlePhase({ready,failed=false,staticMode,completed,opening}:{ready:boolean;failed?:boolean;staticMode:boolean;completed:boolean;opening:IntroState}):TitlePhase{
 if(failed)return 'fallback';
 if(!ready)return 'waiting';
 if(staticMode||completed)return 'settled';
 if(opening.phase!=='settled')return 'waiting';
 return ['skip','hidden'].includes(opening.reason||'')?'settled':'entering';
}
export function canAnimateTitleDecorations(phase:TitlePhase,staticMode:boolean,paused:boolean){return phase==='settled'&&!staticMode&&!paused;}
