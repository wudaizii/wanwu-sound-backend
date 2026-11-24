// What the local background is made from, derived from the work only — the same arrangement data the field, the score
// and the playback read, so the melody's gaps line up with the child's sounds on both pages.
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import {BACKGROUND_REQUEST_VERSION} from '@wanwu-v2/contracts/background';
import type {BackgroundBrief,TextbookFeatures} from '@wanwu-v2/contracts/background';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {backgroundPlan} from '@wanwu-v2/sound-rules/background';
import type {BackgroundInput} from '@wanwu-v2/sound-rules/background';
import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {workSummary} from '@wanwu-v2/sound-rules/textbook-match';
import {pieceSeconds,timedEvents} from '../creation/arrangementTiming.ts';
import {presetMood} from '../creation/moodCopy.ts';

/** The textbook card an inspiration points to (teaching music is not analysed yet, so it lends nothing). */
export function inspirationTrack(inspiration:Inspiration,tracks:readonly TextbookTrack[]){
 return inspiration.kind==='textbook'?tracks.find(track=>track.id===inspiration.entryId)??null:null;
}

/** The chosen song with the shape of its feature the child picked (换几种样子). */
function textbookWithVariation(inspiration:Inspiration,tracks:readonly TextbookTrack[]){
 const track=inspirationTrack(inspiration,tracks);
 return track&&inspiration.kind==='textbook'?{...track,variation:inspiration.variation??'original'}:null;
}

/** Plan input: the piece's real length, when the child's sounds are heard, the mood and the chosen textbook song. */
export function backgroundInput(arrangement:Arrangement,inspiration:Inspiration,tracks:readonly TextbookTrack[]):BackgroundInput{
 return {
  seconds:pieceSeconds(arrangement),
  sounding:timedEvents(arrangement).map(({start,end})=>({start,end})),
  mood:presetMood(arrangement.mood),
  textbook:textbookWithVariation(inspiration,tracks),
  seed:arrangement.id,
 };
}

/** Only the features of a textbook song (never its title, audio or melody) go into an AI request. */
export function textbookFeatures(track:TextbookTrack):TextbookFeatures{
 const {id,tempoBpm,meter,rhythmCell,onsetDensity,pitchRange,brightness,mode,repetition,mood}=track;
 return {id,tempoBpm,meter,rhythmCell:[...rhythmCell],onsetDensity,pitchRange:{...pitchRange},brightness,mode,repetition,mood};
}

/**
 * The anonymous brief an AI background request carries: the same frame the local background uses (length, when the
 * child's sounds play, tempo, metre, mode, mood), the arrangement in the textbook's words, the textbook song's features,
 * the teaching music's upload id (not its file name), the chosen instruments and the rule versions. No recordings,
 * sound names, makers, places or source ids.
 */
export function backgroundBrief(arrangement:Arrangement,inspiration:Inspiration,tracks:readonly TextbookTrack[],instruments:readonly string[]):BackgroundBrief|null{
 const summary=workSummary(arrangement);
 if(!summary)return null;
 const input=backgroundInput(arrangement,inspiration,tracks),plan=backgroundPlan(input),track=inspirationTrack(inspiration,tracks);
 return {
  version:BACKGROUND_REQUEST_VERSION,workId:arrangement.id,seconds:input.seconds,sounding:input.sounding.map(span=>({...span})),
  tempo:plan.tempo,metre:plan.metre,mode:plan.mode,mood:input.mood,
  arrangement:{density:summary.density,repetition:summary.repetition,register:summary.register},
  textbook:track?textbookFeatures(track):null,
  variation:input.textbook?.variation??null,
  teachingMusic:inspiration.kind==='teaching-music'?{musicId:inspiration.musicId}:null,
  instruments:[...instruments],rules:{...RULE_VERSIONS},
 };
}
