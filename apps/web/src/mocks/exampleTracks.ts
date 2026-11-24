// Mock data: made-up textbook feature cards, shown as 示例 until the real catalogue is connected. They are not real
// textbook songs (`source: null`, extraction `example`); the numbers are only plausible values for trying the page.
import {TEXTBOOK_CONTRACT_VERSION} from '@wanwu-v2/contracts/textbook';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';

type Card=Omit<TextbookTrack,'version'|'source'|'extraction'>;
const example=(card:Card):TextbookTrack=>({version:TEXTBOOK_CONTRACT_VERSION,source:null,extraction:{numbers:'example',words:'example',confidence:1,earChecked:false},...card});

export const exampleTracks:readonly TextbookTrack[]=[
 example({id:'tb:mock:march',title:'踏步走',tempoBpm:104,meter:2,rhythmCell:[1,1],onsetDensity:'medium',pitchRange:{low:62,high:74},brightness:'mid',mode:'major',repetition:'high',mood:'lively',childLine:'一步一步很有精神'}),
 example({id:'tb:mock:lullaby',title:'摇篮曲',tempoBpm:66,meter:3,rhythmCell:[2,1],onsetDensity:'sparse',pitchRange:{low:57,high:69},brightness:'dark',mode:'major',repetition:'medium',mood:'calm',childLine:'像摇篮轻轻晃'}),
 example({id:'tb:mock:train',title:'小火车',tempoBpm:116,meter:4,rhythmCell:[.5,.5,1],onsetDensity:'busy',pitchRange:{low:64,high:79},brightness:'bright',mode:'major',repetition:'high',mood:'happy',childLine:'越跑越欢快'}),
 example({id:'tb:mock:rain',title:'雨点跳舞',tempoBpm:108,meter:2,rhythmCell:[.5,.5,.5,.5,1],onsetDensity:'busy',pitchRange:{low:69,high:81},brightness:'bright',mode:'pentatonic',repetition:'high',mood:'lively',childLine:'雨点一下一下跳，很热闹'}),
 example({id:'tb:mock:moon',title:'月亮慢慢走',tempoBpm:63,meter:3,rhythmCell:[2,1],onsetDensity:'sparse',pitchRange:{low:55,high:67},brightness:'dark',mode:'pentatonic',repetition:'low',mood:'calm',childLine:'像月亮在天上慢慢走'}),
 example({id:'tb:mock:wind',title:'风儿吹过山坡',tempoBpm:72,meter:4,rhythmCell:[1,1,2],onsetDensity:'medium',pitchRange:{low:57,high:69},brightness:'mid',mode:'minor',repetition:'medium',mood:'sad',childLine:'像冷风一阵一阵吹过来'}),
];
