// Mock instrument library: three instruments synthesised in the browser (no audio files, no licence needed), standing in
// for the licensed library the server will provide; more are shown as "coming" (not playable).
import type {BackgroundLibrary} from '../shared/background/library';
import {LOCAL_INSTRUMENTS} from '@wanwu-v2/audio-engine/instruments';

export const mockInstruments=LOCAL_INSTRUMENTS;
/** Names of instruments planned for later, shown greyed as 即将开放 (not playable). */
export const comingInstruments=['钢琴','笛子','沙锤'] as const;

export const mockBackgroundLibrary:BackgroundLibrary={
 async list(){return {origin:'example',instruments:mockInstruments,coming:comingInstruments};},
};
