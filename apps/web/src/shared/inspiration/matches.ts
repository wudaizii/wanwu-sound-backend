// 帮我找找: the example / textbook songs most like the child's arrangement, from the local match rules
// (@wanwu-v2/sound-rules/textbook-match) — no model, no network, so it also works offline.
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {matchTracks,workSummary} from '@wanwu-v2/sound-rules/textbook-match';
import type {TextbookMatch} from '@wanwu-v2/sound-rules/textbook-match';

export type InspirationMatch={track:TextbookTrack;reason:TextbookMatch['reason']};

/** Most alike first; empty while nothing is placed. */
export function inspirationMatches(arrangement:Arrangement|null,tracks:readonly TextbookTrack[]):InspirationMatch[]{
 const summary=arrangement&&workSummary(arrangement);
 if(!summary||!tracks.length)return [];
 return matchTracks(summary,tracks).flatMap(match=>{const track=tracks.find(item=>item.id===match.trackId);return track?[{track,reason:match.reason}]:[];});
}
