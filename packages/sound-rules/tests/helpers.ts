// Synthetic recordings for the rule tests: silence, tone blips, noise and dips at known places, so the expected
// analysis is clear.
export const RATE=22050;
export function silence(seconds:number){return new Float32Array(Math.round(seconds*RATE));}
export function tone(seconds:number,hz:number,amplitude=.5){
 return Float32Array.from({length:Math.round(seconds*RATE)},(_,i)=>amplitude*Math.sin(2*Math.PI*hz*i/RATE));
}
/** Continuous sound whose level swells and dips `per` times a second (like chirps on a busy background). */
export function pulsing(seconds:number,hz:number,per:number){
 return Float32Array.from({length:Math.round(seconds*RATE)},(_,i)=>{const t=i/RATE;return (.06+.44*Math.max(0,Math.sin(Math.PI*per*t))**4)*Math.sin(2*Math.PI*hz*t);});
}
export function join(...parts:Float32Array[]){
 const out=new Float32Array(parts.reduce((sum,part)=>sum+part.length,0));let at=0;
 for(const part of parts){out.set(part,at);at+=part.length;}
 return out;
}
