import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {traceBubbles} from './lib/trace-bubbles.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const recipe=await read('docs/assets/title-recipe.json');
const previous=await read('docs/assets/title-release-manifest.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[],sources=[],manifest={version:recipe.version};
function inkBounds(data,info){
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>45){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw new Error('Empty atlas cell');
 left=Math.max(0,left-3);top=Math.max(0,top-3);right=Math.min(info.width-1,right+3);bottom=Math.min(info.height-1,bottom+3);
 return {left,top,width:right-left+1,height:bottom-top+1};
}
for(const atlas of recipe.atlases){
 const original=await fs.readFile(path.join(root,atlas.source));
 const metadata=await sharp(original).metadata();
 if(!metadata.hasAlpha)throw new Error('Atlas must have a transparent alpha channel');
 sources.push({path:atlas.source,bytes:original.length,sha256:hash(original)});
 const cells=[];
 for(let index=0;index<atlas.labels.length;index++){
  const col=index%atlas.columns,row=Math.floor(index/atlas.columns);
  const left=Math.round(col*metadata.width/atlas.columns),top=Math.round(row*metadata.height/atlas.rows);
  const width=Math.round((col+1)*metadata.width/atlas.columns)-left,height=Math.round((row+1)*metadata.height/atlas.rows)-top;
  const cell=await sharp(original).extract({left,top,width,height}).png().toBuffer();
  const raw=await sharp(cell).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  cells.push(await sharp(cell).extract(inkBounds(raw.data,raw.info)).png().toBuffer());
 }
 const rows=atlas.id==='doodles'?1:atlas.rows;
 const packedCells=atlas.id==='doodles'?cells.slice(0,3):cells;
 if(atlas.id==='doodles'){
  const bytes=await traceBubbles(cells.slice(3));
  const url=`/media/home/title/bubbles.${hash(bytes).slice(0,10)}.svg`;
  files.push({id:'title-bubbles',tier:'vector',path:'apps/web/public'+url,bytes:bytes.length,sha256:hash(bytes),data:bytes});
  manifest.bubbles={columns:3,rows:1,labels:atlas.labels.slice(3),variants:{mobile:url,desktop:url,fallback:url}};
 }
 const variants={};
 for(const tier of ['mobile','desktop','fallback']){
  const tile=tier==='mobile'?atlas.mobileTile:atlas.desktopTile;
  const composite=[];
  for(let i=0;i<packedCells.length;i++){
   const max=Math.round(tile*.86*(atlas.scales[i]??1));
   const {data,info}=await sharp(packedCells[i]).resize({width:max,height:max,fit:'inside'}).png().toBuffer({resolveWithObject:true});
   composite.push({input:data,left:(i%atlas.columns)*tile+Math.round((tile-info.width)/2),top:Math.floor(i/atlas.columns)*tile+Math.round((tile-info.height)/2)});
  }
  const image=sharp({create:{width:tile*atlas.columns,height:tile*rows,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composite);
  const bytes=await (tier==='fallback'?image.png({palette:true,colors:96,dither:.2}):image.webp({quality:78,alphaQuality:92,effort:6})).toBuffer();
  const url=`/media/home/title/${atlas.id}.${hash(bytes).slice(0,10)}.${tier==='fallback'?'png':'webp'}`;
  variants[tier]=url;files.push({id:'title-'+atlas.id,tier,path:'apps/web/public'+url,bytes:bytes.length,sha256:hash(bytes),data:bytes});
 }
 manifest[atlas.id]={columns:atlas.columns,rows,labels:atlas.labels.slice(0,packedCells.length),variants};
}
for(const tier of ['mobile','desktop','fallback']){
 const total=files.filter(f=>f.tier===tier||f.tier==='vector').reduce((sum,f)=>sum+f.bytes,0);
 if(total>120*1024)throw new Error('Title + doodles exceed combined 120 KiB budget: '+tier);
 console.log(tier+': title, notes and SVG bubbles '+total+' B in three requests');
}
for(const file of files){const target=path.join(root,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.data);}
await fs.writeFile(path.join(root,'apps/web/src/pages/home/config/title-assets.generated.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'docs/assets/title-release-manifest.json'),JSON.stringify(files.map(({data:_,...file})=>file),null,2)+'\n');
const oldSources=await read('docs/assets/source-manifest.json');
const replaced=new Set([...sources.map(s=>s.path),'assets-source/home/title/handwritten-title.png']);
await fs.writeFile(path.join(root,'docs/assets/source-manifest.json'),JSON.stringify([...oldSources.filter(s=>!replaced.has(s.path)),...sources],null,2)+'\n');
const live=new Set(files.map(f=>f.path));
for(const old of previous)if(!live.has(old.path)&&/^apps\/web\/public\/media\/home\/title\/[a-z-]+\.[a-f0-9]{10}\.(webp|png|svg)$/.test(old.path))await fs.rm(path.join(root,old.path),{force:true});
