import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';

const SRC=new URL('../src/',import.meta.url).pathname;
function files(dir:string):string[]{
 return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?files(path):/\.tsx?$/.test(name)?[path]:[];});
}

test('mocks stay in one folder: only app/services.ts imports them, so the folder can be removed in one go',()=>{
 const importers=files(SRC).filter(path=>!relative(SRC,path).startsWith('mocks/'))
  .filter(path=>/from\s+['"][^'"]*\/mocks(\/|['"])/.test(readFileSync(path,'utf8')))
  .map(path=>relative(SRC,path));
 assert.deepEqual(importers,['app/services.ts']);
 const named=files(SRC).filter(path=>!relative(SRC,path).startsWith('mocks/'))
  .filter(path=>/export const mock[A-Z]/.test(readFileSync(path,'utf8'))).map(path=>relative(SRC,path));
 assert.deepEqual(named,[],'no mock implementation lives outside mocks/');
});

test('pages read only the corpus, the word rules and the reply checks; prompts and model calls stay on the server (the dev-only lab excepted)',()=>{
 const importers=files(SRC).filter(path=>!relative(SRC,path).startsWith('pages/lab/'))
  .filter(path=>/from\s+['"]@wanwu-v2\/prompts\/tasks['"]/.test(readFileSync(path,'utf8')))
  .map(path=>relative(SRC,path));
 assert.deepEqual(importers,[]);
});

test('pages take shared data through the service ports: no page reads the example sound list or the textbook cards itself (the dev-only lab excepted)',()=>{
 const direct=files(SRC).filter(path=>relative(SRC,path).startsWith('pages/')&&!relative(SRC,path).startsWith('pages/lab/'))
  .filter(path=>{const text=readFileSync(path,'utf8');return /import\s*\{[^}]*\bexampleSounds\b[^}]*\}/.test(text)||/mocks\/exampleTracks/.test(text);})
  .map(path=>relative(SRC,path));
 assert.deepEqual(direct,[]);
});
