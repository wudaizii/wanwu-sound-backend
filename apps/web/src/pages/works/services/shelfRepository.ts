// Repository port for 作品书架. The implementation is chosen in app/services.ts — today the mock in
// mocks/shelfRepository.ts (the in-memory shelf of this visit; a refresh empties it). Later: the child's works from the
// server, filtered by account and visibility on the server.
//
// Reading stays synchronous (the page reads a snapshot with useSyncExternalStore): a server adapter keeps the shelf it
// last fetched on this device and `refresh` fetches it again. Changes go to the server, so they return promises.
//
// Intended server endpoints (protocol v0.4; not implemented; sign-in required, the server owns auth and visibility):
//   GET    /api/v1/works?owner=me     → SavedWork[], newest first (each validated with parseSavedWork)   ← refresh
//   GET    /api/v1/works/{workId}     → SavedWork, with its `share` status and link                       ← open
//   PATCH  /api/v1/works/{workId}     ← {title} → SavedWork                                              ← rename
//   DELETE /api/v1/works/{workId}     → 204 (the server keeps nothing the child took off)                ← remove
// Errors come back as {status, reason, message?, requestId}; the adapter turns them into the results below.
import type {SavedWork} from '@wanwu-v2/contracts/work';

/** The shelf, newest first. */
export type ShelfSnapshot=readonly SavedWork[];

export type ShelfRepository={
 list():ShelfSnapshot;
 subscribe(listener:()=>void):()=>void;
 /** Fetch the shelf again; `list` and the listeners then show it. */
 refresh():Promise<void>;
 /** Id of the piece being made now (null when none). */
 currentId():string|null;
 /** The current piece is the child's own, has sounds, and its current form is not on the shelf. */
 hasUnsavedCurrent():boolean;
 /** Make a shelved work the current piece (万物成曲 then opens it). */
 open(work:SavedWork):Promise<void>;
 /** Take a work off the shelf; false when it was not there or could not be removed. */
 remove(id:string):Promise<boolean>;
 /** Give a work a new name; null when the name is empty or it could not be renamed. */
 rename(id:string,title:string):Promise<SavedWork|null>;
};
