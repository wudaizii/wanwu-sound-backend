export type IntroState = {phase:'waiting'|'playing'|'settled';reason:string|null};
export type IntroPolicy = {reduced?:boolean;saveData?:boolean;seen?:boolean;weak?:boolean;lowDevice?:boolean};
export type IntroEvent = {type:'READY';elapsed:number}|{type:'SKIP'|'TIMEOUT'|'HIDDEN'|'REDUCED'|'FINISH'|'FAILED'};
export function shouldRememberIntro(state:IntroState){return state.phase==='playing'||(state.phase==='settled'&&['finish','skip'].includes(state.reason||''));}
export function initialIntro(policy:IntroPolicy = {}):IntroState {
 const reason=policy.reduced?'reduced':policy.saveData?'save-data':policy.lowDevice?'low-device':policy.seen?'seen':policy.weak?'weak':null;
 return reason?{phase:'settled',reason}:{phase:'waiting',reason:null};
}
export function transitionIntro(state:IntroState,event:IntroEvent,deadline=650):IntroState {
 if(state.phase==='settled') return state;
 if(event.type==='READY') return state.phase==='waiting'?(event.elapsed<=deadline?{phase:'playing',reason:null}:{phase:'settled',reason:'late'}):state;
 return {phase:'settled',reason:event.type.toLowerCase()};
}
