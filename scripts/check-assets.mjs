import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=path.join(root,'apps/web/public');
const entries=JSON.parse(await fs.readFile(path.join(root,'docs/assets/release-manifest.json'),'utf8'));
const titleEntries=JSON.parse(await fs.readFile(path.join(root,'docs/assets/title-release-manifest.json'),'utf8'));
// Artwork built by scripts/build-art-assets.mjs; each recipe names its runtime manifest and release list.
const artRecipes=await Promise.all(['docs/assets/marker-recipe.json','docs/assets/marker-hero-recipe.json'].map(async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'))));
const artReleases=await Promise.all(artRecipes.map(async recipe=>JSON.parse(await fs.readFile(path.join(root,recipe.output.release),'utf8'))));
// 声音库: whole originals converted by scripts/build-library-audio.mjs; the catalogue must point at released files.
const libraryRecipe=JSON.parse(await fs.readFile(path.join(root,'docs/assets/library-recipe.json'),'utf8'));
const libraryEntries=JSON.parse(await fs.readFile(path.join(root,'docs/assets/library-release-manifest.json'),'utf8'));
const libraryCatalogue=JSON.parse(await fs.readFile(path.join(root,'apps/web/src/shared/creation/library-sounds.generated.json'),'utf8'));
const libraryReleased=new Set(libraryEntries.map(item=>item.path));
if(libraryCatalogue.sounds.length!==libraryRecipe.sounds.length)throw new Error('Library catalogue is stale: run npm run assets:library');
for(const sound of libraryCatalogue.sounds)if(!libraryReleased.has('apps/web/public'+sound.url))throw new Error('Library sound missing from release manifest: '+sound.url);
// The catalogue's 声音体检 must come from the current analysis rules.
const {ANALYSIS_RULES}=await import('../packages/sound-rules/src/rules.ts');
for(const sound of libraryCatalogue.sounds)if(sound.analysis?.rules!==ANALYSIS_RULES.version)throw new Error(`Library analysis is from ${sound.analysis?.rules??'nothing'}, rules are ${ANALYSIS_RULES.version}: run npm run assets:library`);
for(const item of libraryEntries){
 const original=await fs.readFile(path.join(root,item.original));
 if(crypto.createHash('sha256').update(original).digest('hex')!==item.originalSha256)throw new Error('Library original changed: run npm run assets:library ('+item.original+')');
 if(item.bytes>libraryRecipe.maxBytesPerSound)throw new Error('Library sound exceeds budget: '+item.id);
}
entries.push(...titleEntries,...artReleases.flat(),...libraryEntries);
for(const tier of ['mobile','desktop','fallback'])if(titleEntries.filter(item=>item.tier===tier||item.tier==='vector').reduce((sum,item)=>sum+item.bytes,0)>120*1024)throw new Error('Title + doodles exceed combined budget: '+tier);
const manifest=JSON.parse(await fs.readFile(path.join(root,'apps/web/src/shared/scene/home-assets.generated.json'),'utf8'));
let count=0;
for(const item of entries){
 const bytes=await fs.readFile(path.join(root,item.path));
 if(bytes.length!==item.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error(`Asset changed without updating release manifest: ${item.path}`);
 if(item.tier==='audio'&&bytes.length>=50*1024)throw new Error('Audio clip exceeds budget: '+item.id);
 count++;
}
for(const [tier,budget] of [['mobile',400*1024],['desktop',700*1024],['fallback',400*1024]]){
 let sum=0;
 for(const asset of manifest.layers){
  const item=asset.variants[tier];const stat=await fs.stat(path.join(publicRoot,item.url));
  if(stat.size!==item.bytes)throw new Error('Stale runtime manifest: '+item.url);sum+=stat.size;
 }
 if(sum>budget)throw new Error(tier+' budget exceeded');
 console.log(`${tier}: ${sum} bytes / ${budget}`);
}
async function walk(dir){const all=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())all.push(...await walk(file));else all.push(file);}return all;}
for(const file of await walk(publicRoot)){
 if(/masters|assets-source|imagegen|approved-v12|公测计划|homepage-lab|\.ogg$|\.oga$/i.test(file))throw new Error('Source or reference file in public build: '+file);
}
for(const [index,recipe] of artRecipes.entries()){
 const runtime=JSON.parse(await fs.readFile(path.join(root,recipe.output.manifest),'utf8'));
 const released=new Set(artReleases[index].map(item=>item.path));
 for(const tier of ['mobile','desktop','fallback']){
  let sum=0;
  for(const asset of Object.values(runtime.assets)){
   const item=asset.variants[tier];
   if(!released.has('apps/web/public'+item.url))throw new Error('Artwork missing from release manifest: '+item.url);
   sum+=item.bytes;
  }
  if(sum>recipe.budgets[tier])throw new Error(recipe.version+' '+tier+' budget exceeded');
  console.log(`${recipe.version} ${tier}: ${sum} bytes / ${recipe.budgets[tier]}`);
 }
}
if(manifest.layers.length!==13)throw new Error('Expected 13 layers');
console.log(`Validated ${count} release resources. Source artwork and recordings remain outside public/.`);
