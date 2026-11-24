// A short listen to an example textbook rhythm (the catalogue's real songs are not connected): a few bars made in the
// browser at the entry's tempo and metre — a brighter bell on each downbeat, soft wood ticks on the other beats and a
// quiet chord per bar — so a child hears "two beats", "three beats" or "four beats" and the speed before choosing.
import type {Rhythm} from './catalog.ts';

export type PreviewNote={at:number;length:number;freq:number;voice:'bell'|'tick'|'pad'};
const hz=(midi:number)=>440*2**((midi-69)/12);
const CHORDS=[[60,64,67],[53,57,60],[55,59,62],[60,64,67]] as const;
const SAMPLE_RATE=22050;
/** Long enough to hear the pulse, short enough to compare a few. */
export const PREVIEW_MAX_SECONDS=8;

/** Pure: whole bars that fit in the preview length (at least two). */
export function previewNotes({tempo,metre}:Rhythm):PreviewNote[]{
 const beat=60/tempo,bar=beat*metre,bars=Math.max(2,Math.floor(PREVIEW_MAX_SECONDS/bar)),notes:PreviewNote[]=[];
 for(let b=0;b<bars;b++){
  for(const midi of CHORDS[b%CHORDS.length]!)notes.push({at:b*bar,length:bar,freq:hz(midi-12),voice:'pad'});
  for(let i=0;i<metre;i++)notes.push({at:b*bar+i*beat,length:Math.min(.5,beat*.8),freq:i===0?hz(84):hz(79),voice:i===0?'bell':'tick'});
 }
 return notes;
}

type OfflineConstructor=typeof OfflineAudioContext;
export const renderRhythmPreview=(rhythm:Rhythm)=>renderNotes(previewNotes(rhythm));

async function renderNotes(notes:readonly PreviewNote[]):Promise<AudioBuffer>{
 const seconds=Math.max(...notes.map(note=>note.at+note.length))+.3;
 const Offline=window.OfflineAudioContext||(window as unknown as {webkitOfflineAudioContext:OfflineConstructor}).webkitOfflineAudioContext;
 const ctx=new Offline(1,Math.ceil(seconds*SAMPLE_RATE),SAMPLE_RATE);
 const master=ctx.createGain();master.gain.value=.8;master.connect(ctx.destination);
 for(const note of notes){
  const end=note.at+note.length,env=ctx.createGain(),osc=ctx.createOscillator();
  osc.connect(env).connect(master);osc.frequency.value=note.freq;
  if(note.voice==='pad'){
   osc.type='triangle';
   env.gain.setValueAtTime(0,note.at);env.gain.linearRampToValueAtTime(.06,note.at+.2);
   env.gain.setValueAtTime(.06,Math.max(note.at,end-.2));env.gain.linearRampToValueAtTime(0,end);
  }else{
   osc.type=note.voice==='bell'?'sine':'triangle';
   env.gain.setValueAtTime(0,note.at);env.gain.linearRampToValueAtTime(note.voice==='bell'?.32:.14,note.at+.006);
   env.gain.exponentialRampToValueAtTime(.001,end);
  }
  osc.start(note.at);osc.stop(end+.02);
 }
 return ctx.startRendering();
}
