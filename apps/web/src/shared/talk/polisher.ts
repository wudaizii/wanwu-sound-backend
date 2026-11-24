// 讲解润色 port (作品讲解 / 音乐小发现 and 课本讲解). The page always shows the corpus sentences first, written from facts
// the program counted; this port asks the server for an AI rewording and the page uses only the lines that pass the same
// checks the server runs (@wanwu-v2/prompts/accept). The cloud adapter opens work talk only when the saved revision
// has server facts. It sends references to POST /api/v1/works/:id/talk; the server builds the anonymous brief.
// Textbook talk stays on the existing local corpus until its newer contract is integrated by the frontend owner.
// Keys and prompts stay on the server. Child names are restored locally and are never sent for AI rewording.
import type {TextbookTalkBrief,WorkTalkBrief} from '@wanwu-v2/contracts/talk';

export type TalkPolisher={
 readonly subscribe?:(listener:()=>void)=>()=>void;
 readonly basis?:{brief:WorkTalkBrief;names:string[];binding:string}|null;
 readonly revisionKey?:string;
 readonly timeoutMs?:number;
 /** Whether an AI rewording can be asked for now; false while no model is connected. */
 readonly open:boolean;
 workTalk(brief:WorkTalkBrief,signal:AbortSignal):Promise<unknown>;
 textbookTalk(brief:TextbookTalkBrief,signal:AbortSignal):Promise<unknown>;
};

export const offlineTalkPolisher:TalkPolisher={open:false,async workTalk(){return null;},async textbookTalk(){return null;}};

/** The corpus sentences are already showing; an AI rewording that takes longer than this is not waited for. */
export const TALK_TIMEOUT_MS=6000;
