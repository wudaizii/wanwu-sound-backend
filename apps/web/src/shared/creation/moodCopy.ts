// The piece's mood, shared by 万物声场 (where it is chosen), 万物成曲 (background rhythm) and 作品书架 (shown on a card).
// One set of labels; the faces are shared/ui/MoodFace.
import type {MoodChoice,MoodId} from '@wanwu-v2/contracts/arrangement';

export const moodLabels={happy:'开心',calm:'平静',lively:'活泼',sad:'悲伤',angry:'生气',scared:'害怕',curious:'好奇'} satisfies Record<MoodId,string>;

/** The preset a mood stands for: the chosen preset, or for the child's own words the preset the model found nearest. */
export function presetMood(mood:MoodChoice|null):MoodId|null{
 return mood?.kind==='preset'?mood.id:mood?.kind==='custom'?mood.nearest:null;
}
