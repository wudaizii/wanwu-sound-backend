import type {BackgroundPart} from '@wanwu-v2/sound-rules/background';

export type InstrumentRecipe='pad'|'bells'|'pulse';
export type Instrument={
 id:string;name:string;source:'local-synth';recipe:InstrumentRecipe;
 lead:readonly BackgroundPart[];can:readonly BackgroundPart[];
};

/** Existing synthesised voices, not a sampled instrument library. IDs/timbres are unchanged. */
export const LOCAL_INSTRUMENTS:readonly Instrument[]=[
 {id:'inst:local:organ',name:'风琴',source:'local-synth',recipe:'pad',lead:['chord','bass'],can:['melody']},
 {id:'inst:local:xylophone',name:'木琴',source:'local-synth',recipe:'bells',lead:['melody'],can:['chord','bass']},
 {id:'inst:local:drum',name:'小鼓',source:'local-synth',recipe:'pulse',lead:['rhythm'],can:[]},
];
