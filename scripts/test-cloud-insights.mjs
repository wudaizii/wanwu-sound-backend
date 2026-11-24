import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(join(tmpdir(),'wanwu-cloud-insights-'));
try{
 const file=join(temporary,'cloud-insights.test.mjs');
 await build({absWorkingDir:root,entryPoints:['apps/web/tests/cloud-insights.integration.ts'],outfile:file,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'warning'});
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--test',file],{cwd:root,stdio:'inherit'});child.on('error',reject);child.on('exit',resolve);});
 if(code!==0)process.exitCode=1;
}finally{await rm(temporary,{recursive:true,force:true});}
