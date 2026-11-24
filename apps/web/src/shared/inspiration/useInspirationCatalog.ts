import {useEffect,useMemo,useState} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {InspirationCatalog} from './catalog';
import {inspirationMatches} from './matches';
import type {TeachingMusicService} from './teachingMusic';

/**
 * 课本灵感 for a page (万物声场, 万物成曲): the textbook songs from the one catalogue port, 帮我找找 for the arrangement
 * on the page, and whether teaching music can be analysed yet. Both pages read the same songs and the same chosen song
 * (kept with the work), so what a child picks in one is what the other shows.
 */
export function useInspirationCatalog(arrangement:Arrangement|null,catalog:InspirationCatalog,teaching:TeachingMusicService){
 const [entries,setEntries]=useState<readonly TextbookTrack[]>([]);
 useEffect(()=>{
  let live=true;
  void catalog.list().then(list=>{if(live)setEntries(list.entries);});
  return()=>{live=false;};
 },[catalog]);
 const matches=useMemo(()=>inspirationMatches(arrangement,entries),[arrangement,entries]);
 return {entries,matches,teachingOpen:teaching.analyseAvailable};
}
