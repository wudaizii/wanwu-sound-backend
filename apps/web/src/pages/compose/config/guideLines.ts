// What the squirrel says on 万物成曲: one short line (at most 36 characters, two lines in the bubble) that says what just
// happened and what to try next. Hand-written, not generated; checked for length and words by tests/talk.test.ts.
import type {TextbookVariation} from '@wanwu-v2/contracts/textbook';
import {variationNames} from '../../../shared/inspiration/talk.ts';

/** 换几种样子: what each shape does, in a word or two. */
const shapeEffects={stretch:'更悠闲',squeeze:'更急',offset:'更俏皮',higher:'更亮',lower:'更稳'} satisfies Record<Exclude<TextbookVariation,'original'>,string>;

export const guideLines={
 loading:'等我一下，曲谱马上就好～',
 example:'这是示例摆放的曲谱，先听听；回声场自己摆一首，再来保存吧。',
 empty:'声场里还没有声音，回声场摆几个吧。',
 idle:'点「播放」，看竖线走到哪个声音，它就会亮起来～',
 playing:'听，竖线走到哪里，哪个声音就在唱～',
 paused:'停在这里啦，再点「播放」接着听。',
 ended:'听完啦！可以换个长度、开关背景再听一遍。',
 span:(seconds:number)=>`变成 ${seconds} 秒啦，声音的先后都没变。`,
 spanBlocked:(name:string,seconds:number,span:number)=>`「${name}」要响 ${seconds} 秒，至少要 ${span} 秒才放得下。`,
 inspirationNone:'先不用课本，背景跟着心情走。',
 inspirationMusic:'老师的这段音乐还不能用来做背景，现在背景跟着心情走。',
 /** Choosing a song: its feature, then what the shape buttons on the card do. */
 /** Choosing a song: it arrived, and what the shape buttons on the card do (压短更急，唱高一点更亮); 原样 is the song as it is. */
 inspirationSong:(title:string,shapes:readonly TextbookVariation[])=>{
  const others=shapes.filter(shape=>shape!=='original');
  return `「${title}」来啦！${others.length?`按钮能变样子：${others.map(shape=>variationNames[shape]+shapeEffects[shape]).join('，')}。`:'背景跟着它的节奏走。'}`;
 },
 /** A shape was tapped: what changes in a few claps (嗒 / 嘀), then a question to listen for after pressing 播放. */
 shapeTap:(variation:TextbookVariation,before:string,after:string)=>({
  original:`原样：「${before}」，就是课本里的节奏。点「播放」听听它藏在哪儿。`,
  stretch:`慢一倍啦！节奏变成「${after}」。点「播放」听听，是不是慢下来了？`,
  squeeze:`压短啦！节奏变成「${after}」。点「播放」听听，是不是变急了？`,
  offset:'晚半拍啦！点「播放」听听，背景是不是晚一点才进来？',
  higher:'唱高一点啦！点「播放」听听，背景是不是唱到高处了？',
  lower:'唱低一点啦！点「播放」听听，背景是不是唱到低处了？',
 } satisfies Record<TextbookVariation,string>)[variation],
 // The background card holds only controls: the squirrel says what was chosen.
 backgroundOn:(what:string)=>`背景开啦：${what}。`,
 backgroundOff:'背景关啦，现在只听自己的声音。',
 volume:(level:'soft'|'medium'|'loud')=>({soft:'背景轻轻的，你的声音更清楚啦。',medium:'背景音量刚刚好，你的声音和背景都听得见。',loud:'背景大声一点，更热闹啦；你的声音还在最前面。'})[level],
 instruments:(who:string)=>`${who}。再点一下就请它下来。`,
 instrumentsNone:'不选乐器，背景用原来柔柔的声音。',
 instrumentsComing:(names:string)=>`${names}还在路上，暂时不能选。`,
 // The AI chip shows only once an AI background is ready; the child decides, and the first one is one tap away.
 aiOn:'换上了 AI 做的背景，不喜欢再点一下换回来。',
 aiOff:'换回原来的背景啦。',
 aiReady:'AI 也做了一段背景，点「AI」换上听听？',
 saved:'放进作品书架啦！去书架听一听吧。',
};
