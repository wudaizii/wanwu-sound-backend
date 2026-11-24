// Sound library port: the sounds a child can pick from besides their own recordings. One source for 声音诞生 (pick a
// source) and 万物声场 (找更多声音 · 示例); the implementation is chosen in app/services.ts. Today it is the bundled
// examples (whole recordings shipped with the page, see ./exampleSounds.ts) — real content that works offline, not a mock.
//
// Intended server endpoint (protocol v0.4; not implemented; licences, review and class spaces are the server's):
//   GET /api/v1/sources?scope=mine|class|school|region|public → SourceEntry[] {source, url, analysis} (each
//       parseSourceEntry; `url` is the server's playable copy). The scopes are the Visibility values; sign-in for all
//       but public. The bundled examples stay with the page as the offline fallback and are not served by this endpoint.
// Uploading a source is shared/creation/sourceArchive.ts.
import {exampleSounds} from './exampleSounds.ts';
import type {ExampleSound} from './exampleSounds.ts';

export type SoundLibraryList={origin:'bundled'|'server';examples:readonly ExampleSound[]};
export type SoundLibraryService={list():Promise<SoundLibraryList>};

export const bundledSoundLibrary:SoundLibraryService={async list(){return {origin:'bundled',examples:exampleSounds};}};
