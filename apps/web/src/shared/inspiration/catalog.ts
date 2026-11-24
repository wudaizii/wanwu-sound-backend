// 课本灵感, shared by 万物声场 (chosen before or while arranging, heard at once in the local background) and 万物成曲.
// Each song is a feature card (`TextbookTrack`, contract textbook-v1): extracted once at development time, shipped
// with the page, so listing and 帮我找找 (local rules in @wanwu-v2/sound-rules/textbook-match) work without a network.
// The real catalogue (songs, licence, grade mapping) is not connected: the mock (mocks/inspirationCatalog.ts) returns
// made-up example cards and says so.
// An inspiration only lends rhythm and feel to the background layer — never a melody, never the child's sounds.
//
// Intended source (not implemented): public/textbook/tracks-v1.json, written by tools/textbook-features/ (code reads
// the numbers, AI writes the words, a person checks by ear). A server list may replace it later:
//   GET  /api/v1/textbook-tracks?edition=…&grade=…      → TextbookTrack[] (validated with isTextbookTrack)
import type {Metre,TextbookTrack} from '@wanwu-v2/contracts/textbook';

/** Beats per minute and beats per bar (the rhythm a textbook song lends). */
export type Rhythm={tempo:number;metre:Metre};
export const trackRhythm=(track:Pick<TextbookTrack,'tempoBpm'|'meter'>):Rhythm=>({tempo:track.tempoBpm,metre:track.meter});

export type InspirationList={origin:'example'|'catalogue';entries:readonly TextbookTrack[]};
export type InspirationCatalog={list():Promise<InspirationList>};
