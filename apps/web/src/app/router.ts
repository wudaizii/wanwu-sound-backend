// Minimal history routing for the approved pages; no router library. Unknown paths fall back to home.
import {useCallback,useEffect,useState} from 'react';

/** `lab`: 调音台, `lab-prompts`: 提示词台 — only built in development or a preview build (the app falls back to home elsewhere). */
export type Route={page:'home'}|{page:'sound-birth'}|{page:'sound-world'}|{page:'compose'}|{page:'works'}|{page:'lab'}|{page:'lab-prompts'}|{page:'reset-password'}|{page:'admin'}|{page:'share';token:string};

export function parseRoute(pathname:string):Route{
 const path=pathname.replace(/\/+$/,'');
 const share=/^\/share\/([A-Za-z0-9_-]{1,128})$/.exec(path);if(share)return {page:'share',token:share[1]!};
 if(path==='/admin')return {page:'admin'};
 if(path==='/world')return {page:'sound-world'};
 if(path==='/compose')return {page:'compose'};
 if(path==='/works')return {page:'works'};
 if(path==='/create')return {page:'sound-birth'};
 if(path==='/reset-password')return {page:'reset-password'};
 if(path==='/lab/sound-rules')return {page:'lab'};
 if(path==='/lab/prompts')return {page:'lab-prompts'};
 return {page:'home'};
}
export function routeHref(route:Route){
 if(route.page==='share')return `/share/${route.token}`;
 if(route.page==='admin')return '/admin';
 if(route.page==='sound-world')return '/world';
 if(route.page==='compose')return '/compose';
 if(route.page==='works')return '/works';
 if(route.page==='reset-password')return '/reset-password';
 if(route.page==='lab')return '/lab/sound-rules';
 if(route.page==='lab-prompts')return '/lab/prompts';
 return route.page==='home'?'/':'/create';
}

export function useRoute(){
 const read=()=>parseRoute(location.pathname);
 const [route,setRoute]=useState<Route>(read);
 useEffect(()=>{const sync=()=>setRoute(read());addEventListener('popstate',sync);return()=>removeEventListener('popstate',sync);},[]);
 const navigate=useCallback((next:Route)=>{
  const href=routeHref(next);
  if(href!==location.pathname+location.search)history.pushState(null,'',href);
  scrollTo(0,0);setRoute(next);
 },[]);
 return [route,navigate] as const;
}
