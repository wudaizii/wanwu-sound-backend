import {useEffect,useState} from 'react';
import {media} from '../../styles/breakpoints';
type Variants={mobile:string;desktop:string;fallback:string};
type Resource={url:string;ready:boolean;failed:boolean};
// Decode before showing a bitmap. Resize/fallback loads never replace a previously ready image with a blank one.
export function useDecodedImage(variants:Variants,deadlineMs:number):Resource{
 const [mobile,setMobile]=useState(()=>matchMedia(media.phone).matches);
 const [resource,setResource]=useState<Resource>({url:'',ready:false,failed:false});
 useEffect(()=>{
  const query=matchMedia(media.phone),change=()=>setMobile(query.matches);
  if(query.addEventListener){query.addEventListener('change',change);return()=>query.removeEventListener('change',change);}
  query.addListener(change);return()=>query.removeListener(change);
 },[]);
 const preferred=mobile?variants.mobile:variants.desktop;
 useEffect(()=>{
  let alive=true,expired=false;const images:HTMLImageElement[]=[];
  const timer=setTimeout(()=>{expired=true;if(alive)setResource(old=>old.ready?old:{...old,failed:true});for(const image of images)image.src='';},deadlineMs);
  const decode=async(url:string)=>{const image=new Image();images.push(image);image.decoding='async';image.src=url;await image.decode();return url;};
  void (async()=>{
   try{
    let url:string;
    try{url=await decode(preferred);}catch(error){if(!alive||expired)return;if(preferred===variants.fallback)throw error;url=await decode(variants.fallback);}
    if(alive&&!expired){clearTimeout(timer);setResource({url,ready:true,failed:false});}
   }catch{if(alive&&!expired){clearTimeout(timer);setResource(old=>old.ready?old:{...old,failed:true});}}
  })();
  return()=>{alive=false;clearTimeout(timer);for(const image of images)image.src='';};
 },[preferred,variants.fallback,deadlineMs]);
 return resource;
}
