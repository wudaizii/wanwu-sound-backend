// Fixed sample inputs for checking prompts without a model. Names are made up and deliberately personal-looking, so the
// tests can prove they never reach a prompt.
import type {BackgroundBrief} from '@wanwu-v2/contracts/background';
import type {Discovery,TextbookTalkBrief,WorkTalkBrief} from '@wanwu-v2/contracts/talk';
import {tokenizeFacts} from '../../src/accept.ts';
import {textbookTalk} from '../../src/corpus.ts';

export const PERSONAL_NAMES=['小林家的狗','王老师的铃','后山的风'];
export const pageFacts:Discovery[]=[
 {kind:'opening',first:'小林家的狗',next:'后山的风'},
 {kind:'repeat',name:'小林家的狗',times:3},
 {kind:'together',a:'后山的风',b:'王老师的铃'},
 {kind:'long-short',long:'后山的风',longSeconds:6.2,short:'王老师的铃',shortSeconds:.5},
 {kind:'rest',seconds:3},
 {kind:'ending',name:'小林家的狗',same:true},
];
export const tokenized=tokenizeFacts(pageFacts);
export const workBrief:WorkTalkBrief={version:'work-talk-brief-v1',seconds:30,mood:'calm',textbookTitle:'摇篮曲',facts:tokenized.facts};

const lullaby={title:'摇篮曲',meter:3 as const,rhythmCell:[2,1],childLine:'像摇篮轻轻晃'};
export const textbookBrief:TextbookTalkBrief={
 version:'textbook-talk-brief-v1',title:'摇篮曲',metre:3,rhythm:'嗒— 嗒',childLine:'像摇篮轻轻晃',variation:'lower',meeting:'together',example:'声音1',
 local:textbookTalk(lullaby,'lower','together','声音1'),
};

const rules={analysis:'analysis-v2',shaping:'shaping-v3',background:'background-v1',mix:'mix-v1'};
export const calmLullaby:BackgroundBrief={
 version:'background-request-v1',workId:'work:fixture-1',seconds:30,sounding:[{start:1,end:3},{start:2,end:5},{start:20,end:24}],
 tempo:66,metre:3,mode:'major',mood:'calm',arrangement:{density:'sparse',repetition:'medium',register:'high'},
 textbook:{id:'tb:mock:lullaby',tempoBpm:66,meter:3,rhythmCell:[2,1],onsetDensity:'sparse',pitchRange:{low:57,high:69},brightness:'dark',mode:'major',repetition:'medium',mood:'calm'},
 variation:'lower',teachingMusic:null,instruments:['marimba'],rules,
};
export const busyNoSong:BackgroundBrief={
 version:'background-request-v1',workId:'work:fixture-2',seconds:20,sounding:Array.from({length:10},(_,i)=>({start:i*2,end:i*2+1.5})),
 tempo:100,metre:4,mode:'major',mood:'happy',arrangement:{density:'busy',repetition:'high',register:'low'},
 textbook:null,variation:null,teachingMusic:null,instruments:[],rules,
};
export const quietNoMood:BackgroundBrief={...busyNoSong,workId:'work:fixture-3',seconds:45,sounding:[{start:40,end:44}],mood:null,tempo:76,arrangement:{density:'sparse',repetition:'low',register:'medium'}};
export const BACKGROUND_BRIEFS=[calmLullaby,busyNoSong,quietNoMood];
