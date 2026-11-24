// Instrument library port, shared by 万物声场 (listen while arranging) and 万物成曲 (choose instruments); the
// implementation is chosen in app/services.ts (today the browser-synthesised examples in mocks/). The background has three
// steps of a chain (see shared/background/generator.ts): AI audio → AI notes → local notes → only the child's
// sounds. Only the local step exists: its notes come from @wanwu-v2/sound-rules/background (rules, no model), played by
// the chosen instruments. The AI steps are server work (shared/background/generator.ts) and not open yet.
//
// Intended server endpoints (not implemented):
//   GET  /api/v1/instruments                           → Instrument[] (licensed, reviewed; more open over time)
// AI backgrounds have one entry, POST /api/v1/backgrounds + GET /api/v1/backgrounds/{jobId} (shared/background/generator.ts):
// the chosen instruments ride in the BackgroundBrief; on failure or timeout the page keeps the local background.
import type {Instrument} from './instruments.ts';

/** `example` = made in the browser for this demo, not a licensed library. `coming`: names shown as not open yet. */
export type InstrumentList={origin:'example'|'library';instruments:readonly Instrument[];coming:readonly string[]};

export type BackgroundLibrary={list():Promise<InstrumentList>};
