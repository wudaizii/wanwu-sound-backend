// Repository port for 万物声场. The page only talks to this interface; the implementation is chosen in app/services.ts
// (today the mock in mocks/soundWorldRepository.ts: examples and the in-memory work of this visit). A server adapter
// implements the same interface later — the page won't change.
//
// Intended server endpoints (protocol v0.4; not implemented; the server owns auth and visibility):
//   GET  /api/v1/works/current/arrangement       → Arrangement (validated with parseArrangement)          sign-in
//   PUT  /api/v1/works/{workId}/arrangement      ← Arrangement, If-Match: <last version> → {status:'saved',version}
//                                                  (`version` = the server's new updatedAt; 412 when stale)      sign-in
//   PUT  /api/v1/works/{workId}/compose-settings ← ComposeSettings → {status:'saved',version} (课本灵感 and the
//                                                  background switch are chosen here too; 万物成曲 uses the same)  sign-in
//   GET  /api/v1/sound-units?scope=mine|class|school|region|public → SoundUnitDraft[] (each parseSoundUnitDraft; the
//        scopes are the Visibility values, filtered by the server; sign-in for all but public). This page offers
//        example / mine / class / public today; school and region come with accounts.
// A visitor's work stays on this device and none of these are called.
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {ComposeSettings} from '@wanwu-v2/contracts/work';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import type {SaveResult} from '../../../shared/creation/workSession';

export type LibraryScope='example'|'mine'|'class'|'public';
export const libraryScopes:readonly LibraryScope[]=['example','mine','class','public'];
/** `needs-account`: class spaces need teacher sign-in; `needs-review`: public sounds need review and licensing. */
export type ScopeResult={status:'ready';units:SoundUnitDraft[]}|{status:'unavailable';reason:'needs-account'|'needs-review'};

export type SoundWorldRepository={
 load():Promise<Arrangement>;
 save(arrangement:Arrangement):Promise<SaveResult>;
 scope(scope:LibraryScope):Promise<ScopeResult>;
 /** Settings of the current work shared with 万物成曲: 课本灵感 and the background layer (on / off, instruments). */
 loadSettings():Promise<ComposeSettings>;
 saveSettings(settings:ComposeSettings):Promise<SaveResult>;
};
