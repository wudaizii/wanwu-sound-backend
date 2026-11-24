import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import type {Density,Level,Metre,TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import type {MatchField} from '@wanwu-v2/sound-rules/textbook-match';
import {metreNames as corpusMetreNames} from '@wanwu-v2/prompts/corpus';
import {moodLabels} from '../creation/moodCopy.ts';

const minutes=(ms:number)=>{const s=Math.round(ms/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
/** 二拍子 / 三拍子 / 四拍子 — corpus words, so the guide and the 课本讲解 say the same. */
export const metreNames:Record<Metre,string>=corpusMetreNames();

/** Why a song is like the child's arrangement, in a child's words (the song's value for the field that matched). */
const reasons={
 density:{sparse:'都是稀稀的，留了很多空',medium:'疏密都差不多',busy:'都很热闹，一个接一个'} satisfies Record<Density,string>,
 repetition:{low:'都很少重复',medium:'都有一些重复',high:'都喜欢重复'} satisfies Record<Level,string>,
 register:{low:'都在低低的地方',medium:'都在不高不低的地方',high:'都在高高的地方'} satisfies Record<Level,string>,
};

export const inspirationCopy={
 title:'课本灵感',
 description:'选一首课本歌曲，听听它的节奏和你的声音碰在一起。',
 tabs:{match:'帮我找找',examples:'课本歌曲',upload:'教学音乐'},
 example:'示例',
 catalogueNote:'现在是几首示例歌曲，课本曲库还没有开放。',
 matchNote:'看看你摆的声音最像哪首歌。',
 matchEmpty:'先在声场里摆几个声音，再来找找最像哪首歌。',
 use:'用这个',using:'正在用',none:'先不用',done:'好了',
 listen:'听一听',stopListen:'停止',
 /** The second line of a song: its beat and what it is like. */
 feel:(track:TextbookTrack)=>`${metreNames[track.meter]} · ${track.childLine}`,
 reason:(field:MatchField,value:string)=>field==='mood'?`心情都有点「${moodLabels[value as MoodId]}」`:reasons[field][value as never],
 upload:{
  pick:'选一段教学音乐',repick:'换一段',
  hint:'请老师选一段课堂上唱的歌，最长 10 分钟。',
  picked:(ms:number)=>`时长 ${minutes(ms)}`,
  listen:'试听',stop:'停',
  off:'老师的音乐还不能用来做背景，现在背景跟着心情走。',
  errors:{'not-audio':'这不是音频文件，换一个试试。','too-large':'文件太大了（最大 30MB）。','too-long':'音乐太长了，最长 10 分钟。','unreadable':'这段音频读不出来，换一个试试。'},
 },
 /** One line describing the current choice, for the cards that open the dialog. */
 summary:(value:Inspiration,entries:readonly TextbookTrack[])=>{
  if(value.kind==='textbook'){const entry=entries.find(item=>item.id===value.entryId);return entry?`借了「${entry.title}」的节奏`:'课本节奏';}
  if(value.kind==='teaching-music')return `教学音乐「${value.name}」`;
  return '先不用';
 },
} as const;
