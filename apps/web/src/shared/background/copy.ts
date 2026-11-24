// How the background describes itself on both pages: what it follows and what it borrows, and who plays what.
import {BACKGROUND_PARTS,ORIGINAL_PLAYER} from '@wanwu-v2/sound-rules/background';
import type {BackgroundPart,BackgroundPlan} from '@wanwu-v2/sound-rules/background';
import type {BackgroundMode} from '@wanwu-v2/sound-rules/rules';
import {moodLabels} from '../creation/moodCopy.ts';
import {metreNames} from '../inspiration/copy.ts';

const modeWords:Record<BackgroundMode,string>={major:'明亮的大调',minor:'柔和的小调',pentatonic:'五声调式',dorian:'有点神秘的调子'};

const partNames:Record<BackgroundPart,string>={chord:'和弦',bass:'低音',melody:'旋律',rhythm:'拍子'};

export const backgroundCopy={
 /** Who plays what: “风琴弹和弦、低音，木琴弹旋律，小鼓打拍子”; `names` maps instrument ids to their names. */
 parts:(parts:Record<BackgroundPart,string[]>,names:Readonly<Record<string,string>>)=>{
  const byPlayer=new Map<string,BackgroundPart[]>();
  for(const part of BACKGROUND_PARTS)for(const player of parts[part])byPlayer.set(player,[...byPlayer.get(player)??[],part]);
  return [...byPlayer].map(([player,played])=>`${player===ORIGINAL_PLAYER?'原始背景':names[player]??player}${played.every(part=>part==='rhythm')?'打':'弹'}${played.map(part=>partNames[part]).join('、')}`).join('，');
 },
 /** “「悲伤」的心情，柔和的小调，借了「摇篮曲」的三拍子”. */
 describe:(plan:Pick<BackgroundPlan,'colour'|'mode'|'metre'>,trackTitle:string|null)=>[
  plan.colour==='none'?'没选心情':`「${moodLabels[plan.colour]}」的心情`,
  modeWords[plan.mode],
  trackTitle?`借了「${trackTitle}」的${metreNames[plan.metre]}`:metreNames[plan.metre],
 ].join('，'),
 /** “柔和的小调”. */
 mode:(mode:BackgroundMode)=>modeWords[mode],
} as const;
