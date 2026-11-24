// Builds web derivatives of transparent artwork from project-local originals.
// Usage: node scripts/build-art-assets.mjs docs/assets/<recipe>.json [...]
// Originals stay in assets-source/; only hashed, compressed files go to public/.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function alphaBounds(data,info,margin){
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>8){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;}
 if(right<left)throw new Error('Empty image');
 left=Math.max(0,left-margin);top=Math.max(0,top-margin);right=Math.min(info.width-1,right+margin);bottom=Math.min(info.height-1,bottom+margin);
 return {left,top,width:right-left+1,height:bottom-top+1};
}
async function build(recipePath){
 const recipe=await read(recipePath);
 const {publicDir,manifest:manifestPath,release:releasePath}=recipe.output;
 const previous=await read(releasePath).catch(()=>[]);
 const files=[],manifest={version:recipe.version,assets:{},totals:{}};
 for(const group of recipe.groups)for(const asset of group.assets){
  const original=await fs.readFile(path.join(root,asset.source));
  if((await sharp(original).metadata()).hasAlpha!==true)throw new Error('Expected alpha PNG: '+asset.source);
  const raw=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const crop=alphaBounds(raw.data,raw.info,6);
  const variants={};
  for(const tier of ['mobile','desktop','fallback']){
   const width=Math.round(crop.width*group.scale[tier==='fallback'?'mobile':tier]);
   const pipeline=sharp(original).extract(crop).resize({width,withoutEnlargement:true});
   const encoded=tier==='fallback'?pipeline.png({palette:true,colors:128,quality:75,dither:.3,compressionLevel:9,effort:7}):pipeline.webp({quality:group.quality[tier],alphaQuality:88,effort:6});
   const {data,info}=await encoded.toBuffer({resolveWithObject:true});
   const url=`${publicDir}/${tier}/${asset.id}.${hash(data).slice(0,10)}.${tier==='fallback'?'png':'webp'}`;
   variants[tier]={url,width:info.width,height:info.height,bytes:data.length};
   files.push({id:asset.id,tier,path:'apps/web/public'+url,bytes:data.length,sha256:hash(data),data});
  }
  manifest.assets[asset.id]={label:asset.label,group:group.id,crop,variants};
 }
 for(const tier of ['mobile','desktop','fallback']){
  const total=files.filter(f=>f.tier===tier).reduce((sum,f)=>sum+f.bytes,0);
  if(total>recipe.budgets[tier])throw new Error(`${recipe.version} ${tier} images ${total} B exceed ${recipe.budgets[tier]} B`);
  manifest.totals[tier]=total;
 }
 // Everything validated: write files, then metadata, then remove obsolete hashed outputs of this recipe only.
 for(const file of files){const target=path.join(root,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.data);}
 await fs.mkdir(path.dirname(path.join(root,manifestPath)),{recursive:true});
 await fs.writeFile(path.join(root,manifestPath),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(root,releasePath),JSON.stringify(files.map(({data:_,...file})=>file),null,2)+'\n');
 const live=new Set(files.map(f=>f.path));
 const generated=new RegExp(`^apps/web/public${publicDir.replace(/[/]/g,'\\/')}\\/(mobile|desktop|fallback)\\/[a-z-]+\\.[0-9a-f]{10}\\.(webp|png)$`);
 for(const old of previous)if(!live.has(old.path)&&generated.test(old.path))await fs.rm(path.join(root,old.path),{force:true});
 console.log(recipe.version,JSON.stringify(manifest.totals));
}
const recipes=process.argv.slice(2);
if(!recipes.length)throw new Error('Pass at least one recipe path');
for(const recipe of recipes)await build(recipe);
