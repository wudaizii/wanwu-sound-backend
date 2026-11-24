import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const recipe=JSON.parse(await fs.readFile(path.join(root,'docs/assets/build-recipe.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(root,'docs/assets/release-manifest.json'),'utf8'));
const manifest={version:recipe.version,design:recipe.design,layers:[],sounds:{},totals:{},introDurationMs:recipe.introDurationMs};
const files=[],release=[];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function stage(id,tier,url,bytes){
 const filePath='apps/web/public'+url;
 files.push({filePath,bytes});release.push({id,tier,path:filePath,sha256:hash(bytes),bytes:bytes.length});
}
for(const asset of recipe.layers){
 const source=path.join(root,asset.source);
 const metadata=await sharp(source).metadata();
 if(!metadata.hasAlpha)throw new Error('Expected alpha PNG: '+asset.source);
 const variants={};
 for(const tier of ['mobile','desktop','fallback']){
  const options=asset.variants[tier];
  const pipeline=sharp(source).extract(asset.crop).resize({width:Math.max(options.width,options.height),height:Math.max(options.width,options.height),fit:'inside',withoutEnlargement:true});
  const encoded=tier==='fallback'?pipeline.png({palette:true,colors:128,quality:75,dither:.3,compressionLevel:9,effort:7}):pipeline.webp({quality:options.quality,alphaQuality:90,effort:6});
  const {data,info}=await encoded.toBuffer({resolveWithObject:true});
  const url=`/media/home/${asset.category}/${tier}/${asset.id}.${hash(data).slice(0,10)}.${tier==='fallback'?'png':'webp'}`;
  variants[tier]={url,width:info.width,height:info.height,bytes:data.length};stage(asset.id,tier,url,data);
 }
 const {category:_,source:__,crop:___,variants:____,...runtime}=asset;
 manifest.layers.push({...runtime,variants});
}
for(const {id,source,url:_,...sound} of recipe.sounds){
 const bytes=await fs.readFile(path.join(root,source));
 if(bytes.length>=50*1024)throw new Error('Audio budget exceeded: '+source);
 const url=`/media/sounds/home/${id}.${hash(bytes).slice(0,10)}.mp3`;
 manifest.sounds[id]={...sound,url,bytes:bytes.length};stage(id,'audio',url,bytes);
}
for(const [tier,budget] of [['mobile',400*1024],['desktop',700*1024],['fallback',400*1024]]){
 const total={all:0,scene:0,intro:0,decodedPixels:0};
 for(const asset of manifest.layers){const item=asset.variants[tier];total.all+=item.bytes;total[asset.kind==='foreground'?'intro':'scene']+=item.bytes;total.decodedPixels+=item.width*item.height;}
 if(total.all>budget)throw new Error(tier+' exceeds image budget');manifest.totals[tier]=total;
}
// Validate everything before replacing release metadata or removing obsolete generated files.
for(const file of files){const dest=path.join(root,file.filePath);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.bytes);}
await fs.writeFile(path.join(root,'apps/web/src/shared/scene/home-assets.generated.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'docs/assets/release-manifest.json'),JSON.stringify(release,null,2)+'\n');
const live=new Set(release.map(item=>item.path));
for(const old of current){if(!live.has(old.path)&&/^apps\/web\/public\/media\/.+\.[0-9a-f]{10}\.(png|webp|mp3)$/.test(old.path))await fs.rm(path.join(root,old.path),{force:true});}
console.log('Rebuilt '+release.length+' resources from project-local originals.');
console.log(JSON.stringify(manifest.totals,null,2));
