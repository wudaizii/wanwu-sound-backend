// Which page the 课本灵感 dialog opens on — one rule for every page that opens it without asking for a tab:
// teaching music chosen → 教学音乐; a song chosen → 课本歌曲 (the song is marked there); nothing yet → 帮我找找 when
// there are sounds to compare, otherwise 课本歌曲.
import type {Inspiration} from '@wanwu-v2/contracts/work';

export type InspirationTab='match'|'examples'|'upload';

export function openingTab(value:Inspiration,hasMatches:boolean):InspirationTab{
 if(value.kind==='teaching-music')return 'upload';
 if(value.kind==='textbook')return 'examples';
 return hasMatches?'match':'examples';
}
