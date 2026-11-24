import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

type Entry={id:string;name:string;expectedKind:'one'|'series'|'texture'|'silent';from?:string};
const manifest=JSON.parse(readFileSync(new URL('../../../docs/assets/test-set.json',import.meta.url),'utf8')) as {sounds:Entry[];toCollect:Entry[]};
const library=JSON.parse(readFileSync(new URL('../src/shared/creation/library-sounds.generated.json',import.meta.url),'utf8')) as {sounds:{id:string;analysis:{kind:string;silent:boolean}}[]};

test('the test set: every sound we have is sorted as expected by the current 声音体检',()=>{
 for(const entry of manifest.sounds){
  const sound=library.sounds.find(item=>item.id===entry.id);
  assert.ok(sound,`${entry.name} is in the library`);
  assert.equal(sound!.analysis.silent?'silent':sound!.analysis.kind,entry.expectedKind,`${entry.name} should be ${entry.expectedKind}`);
 }
});

test('the test set plans 15–20 sounds covering all kinds; the missing ones are listed, not invented',()=>{
 const all=[...manifest.sounds,...manifest.toCollect],ids=new Set(all.map(entry=>entry.id));
 assert.equal(ids.size,all.length,'ids are unique');
 assert.ok(all.length>=15&&all.length<=20);
 for(const kind of ['one','series','texture','silent'] as const)assert.ok(all.some(entry=>entry.expectedKind===kind),kind);
 assert.ok(manifest.toCollect.every(entry=>!('file' in entry)),'a sound to collect has no file yet');
});
