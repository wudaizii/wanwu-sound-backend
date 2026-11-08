import {readFile,stat,statfs,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {releaseManifest,environmentPins,imageKinds} from './image-pins.ts';
import { validateModelEnvironment } from './model-environment.ts';

const execute=promisify(execFile),root='/srv/wudaizii/wanwu-sound',command=process.argv[2]??'status';
const allowed=['preflight','status','start','rollback','stop','backup','cleanup'];
if(process.platform!=='linux'
 ||process.arch!=='x64'
 ||!allowed.includes(command)
 ||await realpath(process.cwd())!==root)throw new Error('Only the dedicated Wanwu Linux deployment directory is allowed');
const mutating=!['preflight','status'].includes(command);
if(mutating
 &&!process.argv.includes('--apply'))throw new Error('No changes made: an explicitly authorized --apply is required');
const run=async(binary,args)=>{try{return (await execute(binary,args,{cwd:root,timeout:180_000,maxBuffer:1024*1024})).stdout.trim();}catch{
 throw new Error(`Wanwu ${binary} operation failed; raw output suppressed`);
 }
};
const previous=command==='rollback',release=previous?'previous.env':'.env.release';
const compose=['compose','--project-name','wanwu-sound','--env-file',release,'--file','compose.yml'];
async function oldSite(){
 const value=process.env.WANWU_OLD_HEALTH_URL,url=new URL(value??'');
 if(url.protocol!=='https:'
  ||url.username
  ||url.password
  ||url.search
  ||url.hash)throw new Error('An approved public old-site health URL is required');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10_000)});
 if(!response.ok)throw new Error('Old-site health failed; Wanwu deployment paused');
 const body=await response.arrayBuffer();
 if(body.byteLength>1024*1024)throw new Error('Old-site health response is too large');
 return {host:url.host,status:response.status,bodySha256:createHash('sha256').update(Buffer.from(body)).digest('hex')};
}
async function checkedConfig(){
 for(const name of ['.env.api','.env.models','.env.worker','.env.database','.env.ops',release]){
  const file=await stat(`${root}/${name}`);
  if(!file.isFile()||file.mode&0o077)throw new Error('Wanwu environment files must be private regular files (0600)');
 }
 validateModelEnvironment(await readFile(`${root}/.env.models`,'utf8'));
 const manifest=releaseManifest(JSON.parse(await readFile(`${root}/${previous?'previous-manifest.json':'release-manifest.json'}`,'utf8')));
 const ids=environmentPins(await readFile(`${root}/${release}`,'utf8'),manifest);
 for(const kind of imageKinds)if(await run('docker',['image','inspect',ids[kind],'--format','{{.Id}}'])!==ids[kind])throw new Error('Missing exact release image');
 await run('docker',[...compose,'config','--quiet']);
 return manifest;
}
async function preflight(){
 const memory=/^MemAvailable:\s+(\d+) kB$/m.exec(await readFile('/proc/meminfo','utf8')),disk=await statfs(root);
 const availableMemory=Number(memory?.[1]??0)*1024,availableDisk=disk.bavail*disk.bsize;
 if(availableMemory<2.5*1024**3
  ||availableDisk<8*1024**3)throw new Error('Initial resource guard not met: require 2.5 GiB available RAM and 8 GiB disk after image loading');
 const listener=await run('ss',['-H','-ltn','sport = :3100']);
 if(listener){
  const own=await run('docker',[...compose,'ps','--quiet','api']);
  if(!own)throw new Error('Port 3100 is already occupied outside Wanwu');
  const binding=await run('docker',['inspect',own,'--format','{{json .NetworkSettings.Ports}}']);
  if(!binding.includes('127.0.0.1')||!binding.includes('3100'))throw new Error('Wanwu loopback binding not verified');
  }
 return {availableMemory,availableDisk,oldSite:await oldSite()};
}
try{
 await checkedConfig();
 if(command==='preflight'){console.log(JSON.stringify({status:'pass',...await preflight()}));}
 else if(command==='status'){
  const response=await fetch('http://127.0.0.1:3100/api/v1/health',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Wanwu API health failed');
  const disk=await statfs(root);
  if(disk.bavail*disk.bsize<8*1024**3)throw new Error('Wanwu disk reserve below 8 GiB');
  console.log(await run('docker',[...compose,'run','--rm','--no-deps','--pull','never','ops','apps/api/src/maintenance/health-cli.ts']));
 }else if(command==='backup'||command==='cleanup'){
  console.log(await run('docker',[...compose,'run','--rm','--no-deps','--pull','never','ops',`apps/api/src/maintenance/${command==='backup'?'backup':'gc'}-cli.ts`]));
 }else if(command==='stop'){
  const before=await oldSite();
  await run('docker',[...compose,'stop','api','media']);
  console.log(JSON.stringify({status:'pass',action:'stop-wanwu-only',before,after:await oldSite()}));
 }else{
  const guard=await preflight();
  await run('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','--no-deps','--pull','never','api','media']);
  const response=await fetch('http://127.0.0.1:3100/api/v1/health',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Wanwu health failed; only Wanwu rollback/stop is permitted');
  await run('docker',[...compose,'run','--rm','--no-deps','--pull','never','ops','apps/api/src/maintenance/health-cli.ts','--worker-only']);
  console.log(JSON.stringify({status:'pass',action:command,before:guard.oldSite,after:await oldSite()}));
 }
}catch(error){
 console.error(error.message);
 process.exitCode=1;
}
