import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionSourceArchive} from '../src/shared/creation/sourceArchive.ts';
import type {SoundSource} from '@wanwu-v2/contracts/sound';

const source:SoundSource={id:'recording:test',kind:'local-recording',label:'原件',durationMs:1000,mimeType:'audio/webm',
 provenance:{recordedBy:'老师',recordedOn:'2026-10-25',place:'公园',group:null,provenanceUrl:null}};
test('archive keeps exact original bytes through metadata edits and repeated saves',async()=>{
 const archive=new SessionSourceArchive(),blob=new Blob([new Uint8Array([0,1,2,254,255])],{type:'audio/webm'});
 const decoded={} as AudioBuffer;
 archive.save(source,decoded,{blob});archive.update({...source,label:'新名字'});archive.save({...source,label:'新名字'},decoded);
 assert.equal(archive.original(source.id)!.blob,blob);
 assert.deepEqual(new Uint8Array(await archive.original(source.id)!.blob.arrayBuffer()),new Uint8Array([0,1,2,254,255]));
 assert.throws(()=>archive.save(source,decoded,{blob:new Blob(['replacement'])}),/cannot-be-replaced/);
});
test('a local excerpt records its parent bytes and immutable selection, not a re-encoded original',()=>{
 const archive=new SessionSourceArchive(),selection={startMs:1000,endMs:2000},blob=new Blob(['parent-file']);
 archive.save(source,{} as AudioBuffer,{blob,selection});selection.endMs=3000;
 assert.deepEqual(archive.original(source.id)!.selection,{startMs:1000,endMs:2000});
 assert.throws(()=>archive.save(source,{} as AudioBuffer,{blob,selection:{startMs:2000,endMs:3000}}),/cannot-be-replaced/);
 assert.equal(archive.original(source.id)!.blob,blob);assert.equal(archive.original('missing'),null);
});
