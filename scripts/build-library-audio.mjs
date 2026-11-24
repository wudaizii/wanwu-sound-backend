// 声音库示例声音：read docs/assets/library-recipe.json, convert every original as a whole (no trimming, fades or
// loudness changes — the child picks the part to use), and write the hashed public files, the app's catalogue
// (apps/web/src/shared/creation/library-sounds.generated.json) and the release list with source hashes. Needs ffmpeg.
// Adding a sound = put the original in assets-source/audio/, add one entry to the recipe, run `npm run assets:library`.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// The 声音体检 is the same TypeScript the app runs (Node strips the types), so the catalogue's analysis matches the rules.
const {analyseSamples}=await import('../packages/sound-rules/src/analysis.ts');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const recipe=JSON.parse(await fs.readFile(path.join(root,'docs/assets/library-recipe.json'),'utf8'));
const releasePath=path.join(root,'docs/assets/library-release-manifest.json');
const previous=JSON.parse(await fs.readFile(releasePath,'utf8').catch(()=>'[]'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const DIMENSIONS={pitch:['low','mid','high'],duration:['short','medium','long'],contour:['rising','falling','flat','wavy'],intensity:['soft','medium','loud'],pattern:['once','repeat','bursts','fade-in']};

function run(command,args){
 const result=spawnSync(command,args,{maxBuffer:64*1024*1024});
 if(result.error)throw new Error(`${command} is needed to build library sounds (${result.error.message})`);
 if(result.status!==0)throw new Error(`${command} failed: ${result.stderr.toString().slice(-400)}`);
 return result.stdout;
}
const ids=new Set(),catalogue=[],release=[],writes=[];
const {channels,sampleRate,bitrate}=recipe.encode;
for(const sound of recipe.sounds){
 if(!/^[a-z][a-z0-9-]*$/.test(sound.id)||ids.has(sound.id))throw new Error('Bad or repeated id: '+sound.id);ids.add(sound.id);
 for(const key of ['label','by','license'])if(typeof sound[key]!=='string'||!sound[key].trim())throw new Error(`${sound.id}: ${key} is required`);
 for(const [dimension,value] of Object.entries(sound.preset??{}))if(!DIMENSIONS[dimension]?.includes(value))throw new Error(`${sound.id}: preset ${dimension}=${value} is not a sound-card choice`);
 const original=await fs.readFile(path.join(root,sound.source));
 const bytes=run('ffmpeg',['-v','error','-i',path.join(root,sound.source),'-map','0:a:0','-map_metadata','-1','-fflags','+bitexact','-flags:a','+bitexact',
  '-ac',String(channels),'-ar',String(sampleRate),'-codec:a','libmp3lame','-b:a',bitrate,'-id3v2_version','0','-write_xing','0','-f','mp3','pipe:1']);
 if(bytes.length>recipe.maxBytesPerSound)throw new Error(`${sound.id}: ${bytes.length} bytes exceeds the per-sound budget`);
 const url=`/media/sounds/library/${sound.id}.${hash(bytes).slice(0,10)}.mp3`,file='apps/web/public'+url;
 // Analyse the file the app will play (decoded back to samples at its own rate), so timing agrees with what is heard.
 const pcm=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-f','f32le','-ac','1','-ar',String(sampleRate),'pipe:1'],{input:bytes,maxBuffer:256*1024*1024}).stdout;
 const samples=new Float32Array(pcm.buffer,pcm.byteOffset,Math.floor(pcm.byteLength/4));
 const analysis=analyseSamples([samples],sampleRate);
 catalogue.push({id:sound.id,label:sound.label,by:sound.by,url,bytes:bytes.length,durationMs:analysis.durationMs,preset:sound.preset??null,analysis});
 release.push({id:sound.id,tier:'library-audio',path:file,sha256:hash(bytes),bytes:bytes.length,original:sound.source,originalSha256:hash(original),originalBytes:original.length});
 writes.push({file,bytes});
}
// Validate everything first, then write; files of sounds no longer in the recipe are removed.
for(const {file,bytes} of writes){const dest=path.join(root,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);}
await fs.writeFile(path.join(root,'apps/web/src/shared/creation/library-sounds.generated.json'),JSON.stringify({version:recipe.version,sounds:catalogue},null,2)+'\n');
await fs.writeFile(releasePath,JSON.stringify(release,null,2)+'\n');
const live=new Set(release.map(item=>item.path));
for(const old of previous)if(!live.has(old.path)&&/^apps\/web\/public\/media\/sounds\/library\/.+\.[0-9a-f]{10}\.mp3$/.test(old.path))await fs.rm(path.join(root,old.path),{force:true});
console.log(`Library: ${release.length} sounds, ${release.reduce((sum,item)=>sum+item.bytes,0)} bytes in total.`);
