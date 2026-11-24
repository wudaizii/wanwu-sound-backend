export type HomeBirthPhase='idle'|'preparing'|'fading';
export type HomeBirthEvent='START'|'READY'|'TIMEOUT'|'FINISHED'|'CANCEL';
export function transitionHomeBirth(phase:HomeBirthPhase,event:HomeBirthEvent):HomeBirthPhase{
 if(event==='CANCEL')return 'idle';
 if(phase==='idle'&&event==='START')return 'preparing';
 if(phase==='preparing'&&(event==='READY'||event==='TIMEOUT'))return 'fading';
 if(phase==='fading'&&event==='FINISHED')return 'idle';
 return phase;
}
