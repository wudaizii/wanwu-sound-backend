// Instruments for the background layer (万物声场 plays it, 万物成曲 chooses who plays it). An instrument only changes who
// plays the background's notes; with none chosen the notes play in the original soft voice. Each instrument says which
// parts it is for, so several chosen split the work (rules: assignParts in @wanwu-v2/sound-rules/background). The
// list comes from the BackgroundLibrary port (library.ts); today's three browser-synthesised examples are in mocks/.
import type {BackgroundPart} from '@wanwu-v2/sound-rules/background';

export type InstrumentRecipe='pad'|'bells'|'pulse';
export type Instrument={
 id:string;name:string;
 /** How it is made: `local-synth` is rendered in the browser from `recipe`; a server instrument will carry samples. */
 source:'local-synth';recipe:InstrumentRecipe;
 /** Parts it plays first; parts it can also cover when nobody leading them is chosen. */
 lead:readonly BackgroundPart[];can:readonly BackgroundPart[];
};
