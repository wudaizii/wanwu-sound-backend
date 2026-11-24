type Connection={saveData?:boolean;effectiveType?:string};
/** Never hold the next page back longer than this waiting for the current page's images. */
const IMAGE_WAIT_MS=20_000;
const imagesSettled=()=>[...document.images].every(image=>image.complete);

/**
 * Warm the next page's code without competing with what the child is looking at: wait until the document has loaded,
 * then `delayMs`, then until the images on the page have arrived (React adds them after the load event), then an idle
 * moment. On Save-Data or a 2G connection nothing is fetched ahead; the page still loads when the child goes there.
 * Returns a cancel function for effects.
 */
export function prefetchWhenIdle(load:()=>Promise<unknown>,delayMs:number):()=>void{
 const connection=(navigator as Navigator&{connection?:Connection}).connection;
 if(connection?.saveData||/2g/.test(connection?.effectiveType??''))return ()=>{};
 let cancelled=false,timer=0,idle=0;
 const fetchNow=()=>{if(!cancelled)void load().catch(()=>{});};
 const whenIdle=()=>{idle=typeof requestIdleCallback==='function'?requestIdleCallback(fetchNow,{timeout:2000}):window.setTimeout(fetchNow,0);};
 const whenImagesSettle=(deadline:number)=>{
  if(cancelled)return;
  if(imagesSettled()||Date.now()>deadline)whenIdle();
  else timer=window.setTimeout(()=>whenImagesSettle(deadline),400);
 };
 const afterLoad=()=>{timer=window.setTimeout(()=>whenImagesSettle(Date.now()+IMAGE_WAIT_MS),delayMs);};
 if(document.readyState==='complete')afterLoad();else window.addEventListener('load',afterLoad,{once:true});
 return ()=>{
  cancelled=true;clearTimeout(timer);window.removeEventListener('load',afterLoad);
  if(typeof cancelIdleCallback==='function')cancelIdleCallback(idle);clearTimeout(idle);
 };
}
