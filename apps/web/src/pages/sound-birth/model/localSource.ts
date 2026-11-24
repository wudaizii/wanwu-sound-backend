import type {SoundSource,SoundSourceKind} from '@wanwu-v2/contracts/sound';
import {newId} from '../../../shared/creation/ids.ts';
import {sessionArchive} from '../../../shared/creation/sourceArchive.ts';
import type {Notice} from './soundBirthState';

/** Shows a notice where it belongs (errors by default); the character speaks it. */
export type Notify=(area:NonNullable<Notice>['area'],text:string,tone?:'info'|'error')=>void;

export const baseName=(file:string)=>file.replace(/\.[^.]+$/,'').trim();
const today=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};

/**
 * The part of a long library example the child chose. It stays an example (same credit and licence) with its own id
 * naming the range, so it never mixes up with the whole recording; the audio of the part is kept for this visit.
 */
export const describeExcerpt=(source:SoundSource,range:{startMs:number;endMs:number},part:AudioBuffer):SoundSource=>({
 ...source,id:`${source.id}#${range.startMs}-${range.endMs}`,durationMs:Math.round(part.duration*1000),
});

/** New local sources start from the last values used on this device, so a class outing is filled in once. */
export const describeLocal=(kind:Extract<SoundSourceKind,`local-${string}`>,label:string,buffer:AudioBuffer,mimeType:string):SoundSource=>({
 id:newId(kind==='local-file'?'file':'recording'),kind,label,durationMs:Math.round(buffer.duration*1000),mimeType,
 provenance:{recordedBy:sessionArchive.recent('recordedBy')[0]??null,recordedOn:today(),place:sessionArchive.recent('place')[0]??null,group:sessionArchive.recent('group')[0]??null,provenanceUrl:null},
});
