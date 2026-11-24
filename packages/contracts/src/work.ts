// 万物成曲 work contract: the settings a child picks while listening (background layer, textbook inspiration) and a
// saved work (the arrangement snapshot + those settings + who may see it). The arrangement itself stays the 万物声场
// contract — the score is derived from it, never stored separately, so order, rows and repeats always agree.
//
// The background is its own layer: switching it, changing its volume or borrowing a textbook rhythm never touches the
// child's sounds, their excerpts or their placement.
import {parseArrangement} from './arrangement.ts';
import type {Arrangement} from './arrangement';
import {BACKGROUND_SOURCES} from './background.ts';
import {TEXTBOOK_VARIATIONS} from './textbook.ts';
import type {TextbookVariation} from './textbook';
import type {BackgroundSource,RuleVersions} from './background';

export const WORK_CONTRACT_VERSION='work-v1' as const;

/**
 * Background layer under the child's sounds. The background music itself is generated (by code today; later by the
 * server, from teaching music and the arrangement). `instruments` only says who plays it: ids from the instrument
 * library, any number (more open later); `[]` plays it as generated. `enabled` is the only thing that silences the layer;
 * volume is 0–1.
 */
export type BackgroundLayer={enabled:boolean;instruments:string[];volume:number};
export const MAX_INSTRUMENTS=6;
/**
 * Optional textbook inspiration, chosen before or during 万物成曲. It lends rhythm and feel to the background only —
 * never a melody, never the child's sounds or placement.
 * - `textbook`: an entry from the textbook catalogue.
 * - `teaching-music`: teaching music a teacher picked on this device. The server will analyse its features together
 *   with the child's arrangement and generate a matching background; `musicId` refers to that upload.
 */
export type Inspiration={kind:'none'}
 /** `variation`: which shape of the song's feature the background plays (换几种样子); missing = as it is. */
 |{kind:'textbook';entryId:string;variation?:TextbookVariation}
 |{kind:'teaching-music';musicId:string;name:string;durationMs:number};
export type ComposeSettings={background:BackgroundLayer;inspiration:Inspiration};

export const DEFAULT_BACKGROUND_VOLUME=.5;
export const DEFAULT_COMPOSE_SETTINGS:ComposeSettings={background:{enabled:true,instruments:[],volume:DEFAULT_BACKGROUND_VOLUME},inspiration:{kind:'none'}};

/**
 * Who may see a saved work. Only the server decides and enforces this; the front end shows the choice. Anything wider
 * than `private` needs an account, a class space and review, so it is not offered until those exist.
 */
export type Visibility='private'|'class'|'school'|'region'|'public';
export const VISIBILITIES:readonly Visibility[]=['private','class','school','region','public'];

/**
 * How the saved piece was made: which step of the background chain made the background the child kept, and the
 * version of every rule file. The browser only previews; the shelf's and a share's audio is mixed by the server from
 * the arrangement with these same rules, so an old work is mixed again the way it was made. `prompt` is the version of
 * the prompt that made an AI background (from its result); null for the local one, which no model touched.
 */
export type Rendering={background:BackgroundSource;prompt:string|null;rules:RuleVersions};

/**
 * Where sharing a work stands (POST /api/v1/works/{id}/share). Any visibility wider than `private` is reviewed first;
 * `url` is the share link, present only once approved. The server keeps this: a save never changes it.
 */
export type ShareStatus='pending-review'|'approved'|'rejected';
export const SHARE_STATUSES:readonly ShareStatus[]=['pending-review','approved','rejected'];
export type WorkShare={status:ShareStatus;url:string|null};

export const WORK_TITLE_MAX=16;
export type SavedWork={
 version:typeof WORK_CONTRACT_VERSION;
 /** Same as the arrangement id: saving again updates the same work. */
 id:string;
 title:string;
 arrangement:Arrangement;
 settings:ComposeSettings;
 rendering:Rendering;
 visibility:Visibility;
 /** Null until the work is shared. */
 share:WorkShare|null;
 savedAt:string;
};

export function cleanWorkTitle(value:string){const clean=[...value.replace(/\s+/g,' ').trim()].slice(0,WORK_TITLE_MAX).join('');return clean||null;}

const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
export function isValidInspiration(value:unknown):value is Inspiration{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>;
 if(raw.kind==='none')return true;
 if(raw.kind==='textbook')return nonEmpty(raw.entryId)&&(raw.variation===undefined||TEXTBOOK_VARIATIONS.includes(raw.variation as TextbookVariation));
 return raw.kind==='teaching-music'&&nonEmpty(raw.musicId)&&nonEmpty(raw.name)&&Number.isInteger(raw.durationMs)&&(raw.durationMs as number)>0;
}

export function parseComposeSettings(value:unknown):ComposeSettings|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as Record<string,unknown>,background=raw.background as Record<string,unknown>|null;
 if(!background||typeof background!=='object'||typeof background.enabled!=='boolean')return null;
 const instruments=background.instruments;
 if(!Array.isArray(instruments)||instruments.length>MAX_INSTRUMENTS||!instruments.every(nonEmpty)||new Set(instruments).size!==instruments.length)return null;
 if(typeof background.volume!=='number'||!Number.isFinite(background.volume)||background.volume<0||background.volume>1)return null;
 if(!isValidInspiration(raw.inspiration))return null;
 return raw as ComposeSettings;
}

export function isRendering(value:unknown):value is Rendering{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>,rules=raw.rules as Record<string,unknown>|null;
 return BACKGROUND_SOURCES.includes(raw.background as BackgroundSource)&&(raw.background==='local-rules'?raw.prompt===null:nonEmpty(raw.prompt))
  &&!!rules&&typeof rules==='object'
  &&['analysis','shaping','background','mix'].every(key=>nonEmpty(rules[key]));
}

export function isWorkShare(value:unknown):value is WorkShare{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>;
 if(!SHARE_STATUSES.includes(raw.status as ShareStatus))return false;
 return raw.status==='approved'?typeof raw.url==='string'&&/^https:\/\//.test(raw.url):raw.url===null;
}

/** Validates a saved work (future API or storage) before the UI trusts it. */
export function parseSavedWork(value:unknown):SavedWork|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as Record<string,unknown>;
 if(raw.version!==WORK_CONTRACT_VERSION||typeof raw.id!=='string'||!raw.id||typeof raw.savedAt!=='string')return null;
 if(typeof raw.title!=='string'||cleanWorkTitle(raw.title)!==raw.title)return null;
 if(!VISIBILITIES.includes(raw.visibility as Visibility))return null;
 if(raw.share!==null&&!isWorkShare(raw.share))return null;
 const arrangement=parseArrangement(raw.arrangement);
 if(!arrangement||arrangement.id!==raw.id||!parseComposeSettings(raw.settings)||!isRendering(raw.rendering))return null;
 return raw as SavedWork;
}
