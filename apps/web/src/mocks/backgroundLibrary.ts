// Mock instrument library: three instruments synthesised in the browser (no audio files, no licence needed), standing in
// for the licensed library the server will provide; more are shown as "coming" (not playable).
import type {BackgroundLibrary} from '../shared/background/library';
import type {Instrument} from '../shared/background/instruments';

export const mockInstruments:readonly Instrument[]=[
 {id:'inst:local:organ',name:'风琴',source:'local-synth',recipe:'pad',lead:['chord','bass'],can:['melody']},
 {id:'inst:local:xylophone',name:'木琴',source:'local-synth',recipe:'bells',lead:['melody'],can:['chord','bass']},
 {id:'inst:local:drum',name:'小鼓',source:'local-synth',recipe:'pulse',lead:['rhythm'],can:[]},
];
/** Names of instruments planned for later, shown greyed as 即将开放 (not playable). */
export const comingInstruments=['钢琴','笛子','沙锤'] as const;

export const mockBackgroundLibrary:BackgroundLibrary={
 async list(){return {origin:'example',instruments:mockInstruments,coming:comingInstruments};},
};
