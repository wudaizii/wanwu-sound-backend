import {SOUND_CHOICES,SOUND_CONTRACT_VERSION,SOUND_DIMENSIONS,missingProvenance,normalizeMakerName,normalizeSoundName} from '@wanwu-v2/contracts/sound';
import type {ChosenShape,SoundAnalysis,SoundDimension,SoundShape,SoundSource,SoundUnitDraft} from '@wanwu-v2/contracts/sound';

/** `trim`: an upload longer than the source limit, waiting for the child to pick the part to keep. */
export type CaptureDialog='record'|'library'|'trim'|null;
/** `area` puts a message next to what it is about: the current-sound bar, the five rows or the card info. `done` reports
 *  something that went through (再做一个), so it is never read as "pick a sound first". */
export type Notice={tone:'info'|'error'|'done';area:'bar'|'editor'|'info';text:string}|null;
export type SoundBirthState={
 source:SoundSource|null;
 /** The sound card's own name (child's words); the source keeps its provenance label separately. */
 name:string;
 /** Who made this sound card (nickname), shown on the marker. */
 maker:string|null;
 /** The card's info has been checked and confirmed; the card then shows as the finished big card. */
 cardConfirmed:boolean;
 /** Only what the child chose; an unchosen dimension keeps the original sound. */
 shape:ChosenShape;
 cardPhoto:string|null;
 dialog:CaptureDialog;
 reading:boolean;
 notice:Notice;
 markerIndex:number;
};
export type SoundBirthAction=
 |{type:'dialog';dialog:CaptureDialog}
 |{type:'reading';reading:boolean}
 /** `markerIndex`: the number the sound gets (a new sound while editing another takes the next free one). */
 |{type:'source-ready';source:SoundSource;markerIndex?:number}
 |{type:'source-update';source:SoundSource}
 |{type:'rename';name:string}
 |{type:'maker';name:string}
 |{type:'card';confirmed:boolean}
 |{type:'choose';dimension:SoundDimension;value:string}
 /** Tapping the chosen option again takes the choice back (that dimension returns to the original). */
 |{type:'clear';dimension:SoundDimension}
 |{type:'card-photo';url:string|null}
 |{type:'notice';notice:Notice}
 /** 再做一个: the sound just made went into the work; the page starts empty for the next one, with its own number. */
 |{type:'next';markerIndex:number;notice:Notice};

/** Going on editing a sound already in the work: its source, name, maker, five choices and number; the card stays checked. */
export function editingSoundBirth(unit:SoundUnitDraft,source:SoundSource):SoundBirthState{
 return {...initialSoundBirth(unit.markerIndex),source,name:unit.name,maker:unit.maker,cardConfirmed:true,shape:{...unit.shape}};
}

/** `markerIndex` is assigned by the work this sound joins (its number in 万物声场), so the marker never changes later. */
export function initialSoundBirth(markerIndex=0):SoundBirthState{
 return {source:null,name:'',maker:null,cardConfirmed:false,shape:{},cardPhoto:null,dialog:null,reading:false,notice:null,markerIndex};
}

export function soundBirthReducer(state:SoundBirthState,action:SoundBirthAction):SoundBirthState{
 switch(action.type){
  case 'dialog':return {...state,dialog:action.dialog};
  case 'reading':return {...state,reading:action.reading};
  case 'source-ready':{
   // A new sound brings its own name but keeps the child's five choices (a paper card may be filled in first).
   // The maker starts as whoever recorded a local sound; it is only a suggestion and stays editable.
   const maker=state.maker??(action.source.kind==='example'?null:normalizeMakerName(action.source.provenance.recordedBy??''));
   // Bundled examples are documented already; a local sound starts unconfirmed until its info is checked.
   return {...state,source:action.source,name:action.source.label,maker,cardConfirmed:action.source.kind==='example',dialog:null,reading:false,notice:null,
    markerIndex:action.markerIndex??state.markerIndex};
  }
  case 'source-update':
   if(state.source?.id!==action.source.id)return state;
   return {...state,source:action.source,notice:state.notice?.area==='info'&&!missingProvenance(action.source).length?null:state.notice};
  case 'rename':return {...state,name:normalizeSoundName(action.name,state.source?.label??'')};
  case 'maker':return {...state,maker:normalizeMakerName(action.name)};
  case 'card':
   // Confirming needs a traceable source; going back to edit is always allowed.
   if(action.confirmed&&(!state.source||missingProvenance(state.source).length))return state;
   // On confirm, an unwritten maker defaults to whoever recorded the sound (still editable on the marker).
   const maker=action.confirmed?state.maker??normalizeMakerName(state.source?.provenance.recordedBy??''):state.maker;
   return {...state,cardConfirmed:action.confirmed,maker,notice:action.confirmed&&state.notice?.area==='info'?null:state.notice};
  case 'choose':{
   if(!(SOUND_CHOICES[action.dimension] as readonly string[]).includes(action.value))return state;
   const shape={...state.shape,[action.dimension]:action.value};
   return {...state,shape};
  }
  case 'clear':{
   if(state.shape[action.dimension]===undefined)return state;
   const shape={...state.shape};delete shape[action.dimension];
   return {...state,shape};
  }
  case 'card-photo':return {...state,cardPhoto:action.url};
  case 'notice':return {...state,notice:action.notice};
  case 'next':return {...initialSoundBirth(action.markerIndex),notice:action.notice};
 }
}

/** Child-facing summary of the chosen options, in row order, e.g. 「高高的、有起伏」. */
export function describeShape(shape:Partial<SoundShape>,labels:{[K in SoundDimension]:Record<string,string>}){
 return SOUND_DIMENSIONS.flatMap(dimension=>{const value=shape[dimension];return value?[labels[dimension][value]!]:[];}).join('、');
}

export function remainingDimensions(shape:Partial<SoundShape>){return SOUND_DIMENSIONS.filter(dimension=>shape[dimension]===undefined);}

/**
 * What still blocks 做好了, in the order the page guides the child / teacher through it. The five choices are optional:
 * a child may go on with the original sound, so only a sound and its provenance are required.
 */
export type FinishCheck={kind:'no-source'}|{kind:'missing-provenance';fields:ReturnType<typeof missingProvenance>}|{kind:'ready'};
export function finishCheck(state:Pick<SoundBirthState,'source'>):FinishCheck{
 if(!state.source)return {kind:'no-source'};
 const fields=missingProvenance(state.source);
 if(fields.length)return {kind:'missing-provenance',fields};
 return {kind:'ready'};
}

/** `analysis`: the source's 声音体检, kept with the unit so later pages time it from the work's data alone. */
export function toSoundUnitDraft(state:SoundBirthState,id:string,now:Date,analysis?:SoundAnalysis):SoundUnitDraft|null{
 if(finishCheck(state).kind!=='ready'||!state.source)return null;
 return {version:SOUND_CONTRACT_VERSION,id,sourceId:state.source.id,name:state.name||state.source.label,maker:state.maker,markerIndex:state.markerIndex,
  shape:{...state.shape},input:state.cardPhoto?'paper-card-reference':'manual',createdAt:now.toISOString(),...(analysis?{analysis}:{})};
}
