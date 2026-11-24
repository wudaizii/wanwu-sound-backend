// One shared AudioContext per page session. Created lazily; resumed only from a user gesture (iOS / autoplay rules).
type ContextConstructor=typeof AudioContext;
let context:AudioContext|null=null;

export function audioSupported(){
 return typeof window!=='undefined'&&!!(window.AudioContext||(window as unknown as {webkitAudioContext?:ContextConstructor}).webkitAudioContext);
}
export function getAudioContext(){
 if(!context){
  const Constructor=window.AudioContext||(window as unknown as {webkitAudioContext:ContextConstructor}).webkitAudioContext;
  context=new Constructor();
 }
 return context;
}
/** Call inside a click/tap handler before starting playback. */
export async function resumeAudio(){const ctx=getAudioContext();if(ctx.state==='suspended')await ctx.resume();return ctx;}
