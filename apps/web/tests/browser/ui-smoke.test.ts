import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openTestBrowser} from './browser.ts';

const root=fileURLToPath(new URL('../../../../',import.meta.url));
const dist=join(root,'apps/web/dist'),artifacts=join(root,'artifacts/ui-smoke');
const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
 '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg'};

test('built H5 routes render at mobile and breakpoint widths without changing visual assets',{timeout:180_000},async t=>{
 await stat(join(dist,'index.html'));await mkdir(artifacts,{recursive:true});
 const server=createServer(async(request,response)=>{
  try{
   const pathname=decodeURIComponent(new URL(request.url!,'http://127.0.0.1').pathname);
   const requested=resolve(dist,`.${pathname}`);
   if(requested!==dist&&!requested.startsWith(dist+sep)){response.writeHead(403).end();return;}
   const file=extname(pathname)?requested:join(dist,'index.html');
   response.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'}).end(await readFile(file));
  }catch{response.writeHead(404).end();}
 });
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const origin=`http://127.0.0.1:${address.port}`;
 const browser=await openTestBrowser();
 const results:{route:string;width:number;text:string;overflow:boolean}[]=[];
 try{
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:1000}});
  const errors:string[]=[];
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const width of [390,700,701,900,901,1440])for(const route of ['/','/create','/world','/compose','/works']){
   await page.setViewportSize({width,height:1000});await page.goto(origin+route,{waitUntil:'networkidle'});
   const result=await page.evaluate(()=>({text:document.body.innerText,
    overflow:document.documentElement.scrollWidth>window.innerWidth+1}));
   assert.ok(result.text.trim().length>10,`${route} must render actual content`);
   assert.equal(result.overflow,false,`${route} overflows at ${width}px`);
   results.push({route,width,text:result.text.slice(0,140),overflow:result.overflow});
   await page.screenshot({path:join(artifacts,`${width}-${route.slice(1)||'home'}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[],'no runtime JS errors');
  await writeFile(join(artifacts,'report.json'),JSON.stringify({status:'pass',browser:browser.version(),scenarios:results},null,2)+'\n');
  t.diagnostic(`${results.length} route/width scenarios; screenshots: ${artifacts}`);
 }finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
});
