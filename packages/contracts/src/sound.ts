// Sound source / sound shape contract shared by the front end and the future service layer.
// Version every persisted shape. Original audio is referenced, never rewritten; the five choices belong to the child.

export const SOUND_CONTRACT_VERSION='sound-v1' as const;

/**
 * Where the audio came from. `local-*` means it only exists on this device and has not been uploaded; `uploaded` means
 * the original is stored on the server (PUT /api/v1/sources/{id}, then …/complete) and can no longer be overwritten.
 */
export type SoundSourceKind='example'|'local-recording'|'local-file'|'uploaded';
export const SOUND_SOURCE_KINDS:readonly SoundSourceKind[]=['example','local-recording','local-file','uploaded'];
/**
 * Who captured the sound, when, where and in which group — so every sound in a work can be traced back.
 * Children are recorded by nickname and places stay approximate (no real names, faces or exact locations).
 */
export type SourceProvenance={
 recordedBy:string|null;
 /** Calendar date YYYY-MM-DD in the recorder's local time. */
 recordedOn:string|null;
 place:string|null;
 /** Teacher-defined collection such as an outing or a lesson; groups the source in the library. */
 group:string|null;
 /** Public licence / source record for bundled examples. */
 provenanceUrl:string|null;
};
export type SoundSource={
 id:string;
 kind:SoundSourceKind;
 /** Name of the source itself (采集时的来源名称). The sound card keeps its own display name. */
 label:string;
 durationMs:number;
 mimeType:string;
 provenance:SourceProvenance;
};

export const SOURCE_TEXT_MAX=20;
/** Fields a locally captured source still needs before it is traceable. Bundled examples are documented elsewhere. */
export function missingProvenance(source:SoundSource):('label'|'recordedBy'|'recordedOn'|'place')[]{
 if(source.kind==='example')return [];
 const missing:('label'|'recordedBy'|'recordedOn'|'place')[]=[];
 if(!source.label.trim())missing.push('label');
 if(!source.provenance.recordedBy?.trim())missing.push('recordedBy');
 if(!source.provenance.recordedOn||!/^\d{4}-\d{2}-\d{2}$/.test(source.provenance.recordedOn))missing.push('recordedOn');
 if(!source.provenance.place?.trim())missing.push('place');
 return missing;
}
/** Trim and cap free-text provenance; empty becomes null so "not filled" is explicit. */
export function cleanSourceText(value:string){const clean=[...value.replace(/\s+/g,' ').trim()].slice(0,SOURCE_TEXT_MAX).join('');return clean||null;}

export type PitchChoice='low'|'mid'|'high';
export type DurationChoice='short'|'medium'|'long';
export type ContourChoice='rising'|'falling'|'flat'|'wavy';
export type IntensityChoice='soft'|'medium'|'loud';
export type PatternChoice='once'|'repeat'|'bursts'|'fade-in';
/** The five paper-card dimensions: 高低、长短、变化、轻响、出现方式. No sixth dimension. */
export type SoundShape={pitch:PitchChoice;duration:DurationChoice;contour:ContourChoice;intensity:IntensityChoice;pattern:PatternChoice};
export type SoundDimension=keyof SoundShape;

export const SOUND_DIMENSIONS:readonly SoundDimension[]=['pitch','duration','contour','intensity','pattern'];
export const SOUND_CHOICES:{readonly [K in SoundDimension]:readonly SoundShape[K][]}={
 pitch:['low','mid','high'],
 duration:['short','medium','long'],
 contour:['rising','falling','flat','wavy'],
 intensity:['soft','medium','loud'],
 pattern:['once','repeat','bursts','fade-in'],
};
/**
 * What the child actually chose. Every dimension is optional: an unchosen one keeps the original sound for that aspect
 * (original pitch, length, gain and a single play), so a child may go on with the plain recording.
 */
export type ChosenShape=Partial<SoundShape>;
/** Middle value of every dimension (tests and fixtures). Never stored in place of an unchosen dimension. */
export const NEUTRAL_SHAPE:SoundShape={pitch:'mid',duration:'medium',contour:'flat',intensity:'medium',pattern:'once'};

/**
 * How the five choices were entered. Paper-card recognition is not implemented, so a photo is reference only.
 * `example-preset` marks a bundled example unit whose choices were written by the project, not by a child.
 */
export type ShapeInput='manual'|'paper-card-reference'|'example-preset';
export const SHAPE_INPUTS:readonly ShapeInput[]=['manual','paper-card-reference','example-preset'];

/** A finished sound unit ready for the sound world. `sourceId` (identity) and later event IDs stay separate. */
export type SoundUnitDraft={
 version:typeof SOUND_CONTRACT_VERSION;
 id:string;
 sourceId:string;
 name:string;
 /** Nickname of the child who made this sound card; shown on the marker. Null shows the number instead. */
 maker:string|null;
 /** Position in this creation; drives the neutral marker artwork and the visible number. */
 markerIndex:number;
 /** Only the dimensions the child chose; missing ones keep the original (see ChosenShape). */
 shape:ChosenShape;
 input:ShapeInput;
 createdAt:string;
 /**
  * 声音体检 of the source this unit uses, kept with the unit so how long it sounds can be worked out from the work's
  * data alone (field, score, server). Missing for units made before analysis existed; then the original timing is used.
  */
 analysis?:SoundAnalysis;
};

export const SOUND_NAME_MAX=12;
/** Short enough to sit on the marker artwork. */
export const MAKER_NAME_MAX=6;
/** Longest source a child can record or upload. The whole recording comes in; 万物声场 lets the child pick the part to use. */
export const SOUND_SOURCE_MAX_MS=45_000;
/** A recording stopped at the limit can run a little past it; up to this much over still counts as within it. */
export const SOUND_SOURCE_SLACK_MS=500;

/** Only known dimensions, each with a valid value; any subset (including none) is allowed. */
export function isChosenShape(shape:unknown):shape is ChosenShape{
 if(!shape||typeof shape!=='object'||Array.isArray(shape))return false;
 return Object.entries(shape).every(([dimension,value])=>(SOUND_DIMENSIONS as readonly string[]).includes(dimension)
  &&(SOUND_CHOICES[dimension as SoundDimension] as readonly string[]).includes(value as string));
}

export function isCompleteShape(shape:Partial<SoundShape>):shape is SoundShape{
 return SOUND_DIMENSIONS.every(dimension=>(SOUND_CHOICES[dimension] as readonly string[]).includes(shape[dimension] as string));
}

export function normalizeMakerName(name:string){const clean=[...name.replace(/\s+/g,'').trim()].slice(0,MAKER_NAME_MAX).join('');return clean||null;}

export function normalizeSoundName(name:string,fallback:string){
 const clean=[...name.replace(/\s+/g,' ').trim()].slice(0,SOUND_NAME_MAX).join('');
 return clean||[...fallback.trim()].slice(0,SOUND_NAME_MAX).join('')||'我的声音';
}

/** Validates an incoming unit (e.g. from a future API or storage) before the UI trusts it. */
export function parseSoundUnitDraft(value:unknown):SoundUnitDraft|null{
 if(!value||typeof value!=='object')return null;
 const unit=value as Record<string,unknown>;
 if(unit.version!==SOUND_CONTRACT_VERSION)return null;
 for(const key of ['id','sourceId','name','createdAt'])if(typeof unit[key]!=='string'||!unit[key])return null;
 if(!Number.isInteger(unit.markerIndex)||(unit.markerIndex as number)<0)return null;
 if(!SHAPE_INPUTS.includes(unit.input as ShapeInput))return null;
 if(!isChosenShape(unit.shape))return null;
 if([...(unit.name as string)].length>SOUND_NAME_MAX)return null;
 if(unit.maker!==null&&(typeof unit.maker!=='string'||!unit.maker||[...unit.maker].length>MAKER_NAME_MAX))return null;
 if(unit.analysis!==undefined&&!isSoundAnalysis(unit.analysis))return null;
 return unit as SoundUnitDraft;
}

/** A stretch of a source in ms from its start. */
export type SoundSpan={startMs:number;endMs:number};
/**
 * What kind of sound a recording is, found by the 声音体检:
 * - `one`: a single sound (a cow's moo, an apple landing);
 * - `series`: separate sounds with quiet between them (frog croaks, drips);
 * - `texture`: sound that runs together with no quiet gaps (wind, a stream, a cicada chorus, dense birdsong).
 * The five choices apply to every kind; how each is carried out depends on the kind.
 */
export type SoundKind='one'|'series'|'texture';
export const SOUND_KINDS:readonly SoundKind[]=['one','series','texture'];
/**
 * 声音体检 of one source, computed by `@wanwu-v2/sound-rules` with fixed rules (no model) — on the device today, by the
 * server later, from the same rule files. `rules` names the analysis rules version that produced it, so a stored result
 * can be recomputed when those rules change. It describes the recording; it never changes it or the child's choices.
 */
export type SoundAnalysis={
 rules:string;
 durationMs:number;
 /** Nothing rose above the silence floor (e.g. an empty recording). */
 silent:boolean;
 /** From the first to the last sounding moment; null when silent. */
 main:SoundSpan|null;
 /** The single sounds (one croak, one chirp) in time order, with their loudest moment in dBFS. */
 units:(SoundSpan&{peakDb:number})[];
 kind:SoundKind;
 /** Typical length of one sound (median, ms) and the 长短 band it falls in. */
 unitMs:number;
 lengthBand:DurationChoice;
 /** Mean loudness of the sounding part (RMS, dBFS) and its highest sample (dBFS). */
 loudnessDb:number;
 peakDb:number;
 /** Spectral centroid of the sounding part and the 高低 band it falls in. */
 brightnessHz:number;
 band:PitchChoice;
};

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const isSpan=(value:unknown):value is SoundSpan=>!!value&&typeof value==='object'
 &&finite((value as SoundSpan).startMs)&&finite((value as SoundSpan).endMs)&&(value as SoundSpan).startMs<=(value as SoundSpan).endMs;
/** Validates a stored or received analysis before shaping trusts it. */
export function isSoundAnalysis(value:unknown):value is SoundAnalysis{
 if(!value||typeof value!=='object')return false;
 const a=value as Record<string,unknown>;
 return typeof a.rules==='string'&&!!a.rules&&finite(a.durationMs)&&typeof a.silent==='boolean'&&(a.main===null||isSpan(a.main))
  &&Array.isArray(a.units)&&a.units.every(unit=>isSpan(unit)&&finite((unit as unknown as {peakDb:unknown}).peakDb))
  &&SOUND_KINDS.includes(a.kind as SoundKind)&&finite(a.unitMs)&&SOUND_CHOICES.duration.includes(a.lengthBand as DurationChoice)
  &&finite(a.loudnessDb)&&finite(a.peakDb)&&finite(a.brightnessHz)&&SOUND_CHOICES.pitch.includes(a.band as PitchChoice);
}

const text=(value:unknown)=>value===null||typeof value==='string';
/**
 * Validates a received source (a server list, a stored work) before the page trusts it. A source a child can record or
 * upload lasts at most SOUND_SOURCE_MAX_MS (+ the slack); bundled examples are whole recordings and may be longer.
 */
export function isSoundSource(value:unknown):value is SoundSource{
 if(!value||typeof value!=='object')return false;
 const s=value as Record<string,unknown>,p=s.provenance as Record<string,unknown>|null;
 if(typeof s.id!=='string'||!s.id||!SOUND_SOURCE_KINDS.includes(s.kind as SoundSourceKind)||typeof s.label!=='string')return false;
 if(!finite(s.durationMs)||s.durationMs<=0||(s.kind!=='example'&&s.durationMs>SOUND_SOURCE_MAX_MS+SOUND_SOURCE_SLACK_MS))return false;
 // MIME is only a browser/file hint. The server validates real container/codec bytes before ready.
 if(typeof s.mimeType!=='string'||! /^(?:audio\/|video\/(?:mp4|webm)(?:;|$)|application\/(?:octet-stream|ogg)(?:;|$))/.test(s.mimeType))return false;
 return !!p&&typeof p==='object'&&['recordedBy','recordedOn','place','group','provenanceUrl'].every(key=>text(p[key]));
}

/**
 * One entry of the sound library (GET /api/v1/sources): the source with its provenance, where its playable file is (a
 * server-made copy; the original stays untouched) and its 声音体检. `url` is https, or a path on this site.
 */
export type SourceEntry={source:SoundSource;url:string;analysis:SoundAnalysis};
const playable=(url:unknown)=>typeof url==='string'&&(/^https:\/\//.test(url)||/^\/(?!\/)/.test(url));
export function parseSourceEntry(value:unknown):SourceEntry|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as Record<string,unknown>;
 return isSoundSource(raw.source)&&playable(raw.url)&&isSoundAnalysis(raw.analysis)?raw as SourceEntry:null;
}
