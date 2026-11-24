// 课本讲解: four short sentences about the textbook song and this piece — its feature, the shape it took this time, what
// happened when it met the child's sounds, and one thing to try right away. The wording is corpus
// (@wanwu-v2/prompts/corpus, textbook-talk.v1.json), filled from the song's feature card and what the rules found; an AI
// may reword it later (pages/compose/model/useTalk.ts). This file only adapts it to the page's types.
import type {TextbookTrack,TextbookVariation} from '@wanwu-v2/contracts/textbook';
import type {TextbookTalk} from '@wanwu-v2/contracts/talk';
import type {Meeting} from '@wanwu-v2/sound-rules/background';
import {textbookTalk as corpusTalk} from '@wanwu-v2/prompts/corpus';

export {rhythmWords,songFeature} from '@wanwu-v2/prompts/corpus';
export type {TextbookTalk};

/** The names on the 换几种样子 chips. */
export const variationNames={original:'原样',stretch:'慢一倍',squeeze:'压短',offset:'晚半拍',higher:'唱高一点',lower:'唱低一点'} satisfies Record<TextbookVariation,string>;

export function textbookTalk(track:Pick<TextbookTrack,'title'|'meter'|'rhythmCell'|'childLine'>,variation:TextbookVariation,meeting:Meeting,exampleName:string|null):TextbookTalk{
 return corpusTalk(track,variation,meeting.kind,exampleName);
}
