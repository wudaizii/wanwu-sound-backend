// 讲解润色 port (作品讲解 / 音乐小发现 and 课本讲解). The page always shows the corpus sentences first, written from facts
// the program counted; this port asks the server for an AI rewording and the page uses only the lines that pass the same
// checks the server runs (@wanwu-v2/prompts/accept). No model is connected yet: the offline polisher says so and sends
// nothing.
//
// Intended server endpoints (protocol v0.4; not implemented; the key and the prompts stay on the server, which also
// logs the checks; open to visitors, limited per IP and device — over the limit is reason 'quota'):
//   POST /api/v1/talk/work      ← WorkTalkBrief     → {...WorkTalkReply, model, promptVersion}
//   POST /api/v1/talk/textbook  ← TextbookTalkBrief → {...TextbookTalk, model, promptVersion}
// `model` and `promptVersion` sit beside the reply's own fields, as in BackgroundResult.
// Only anonymous briefs are sent: facts with numbered sounds (「声音1」), never the names a child typed, recordings,
// people or places.
import type {TextbookTalkBrief,WorkTalkBrief} from '@wanwu-v2/contracts/talk';

export type TalkPolisher={
 /** Whether an AI rewording can be asked for now; false while no model is connected. */
 readonly open:boolean;
 workTalk(brief:WorkTalkBrief,signal:AbortSignal):Promise<unknown>;
 textbookTalk(brief:TextbookTalkBrief,signal:AbortSignal):Promise<unknown>;
};

export const offlineTalkPolisher:TalkPolisher={open:false,async workTalk(){return null;},async textbookTalk(){return null;}};

/** The corpus sentences are already showing; an AI rewording that takes longer than this is not waited for. */
export const TALK_TIMEOUT_MS=6000;
