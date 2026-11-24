import {homeScene} from '../../../shared/scene/homeScene';
export const homeAssets = homeScene;
export const sceneLayers = homeAssets.layers.filter(layer=>layer.kind!=='foreground');
export const introLayers = homeAssets.layers.filter(layer=>layer.kind==='foreground');
export const foliageOpacity:Record<string,number> = {
 'env-upper-left':.22,'env-canopy-right':.36,'env-perch-left':.46,'env-bank-right':.48,'env-pond-left':.65,
};
// Swap only the green palette: brighter yellow-green foliage, softer sage frog.
// These display filters preserve the artwork, alpha, placement, and non-green colours.
export const homeGreenTones={foliage:{hue:-18,saturation:1.5},frog:{hue:16,saturation:.55}};
export const homeMotion = {deadlineMs:1800,durationMs:1500,foregroundOpacity:.94,storageKey:'wanwu:home:intro:v2'};

// Keep each character in the same coordinate space as its supporting branch or bank.
export const sceneGroups = [
 {id:'twig',rect:[0,0,174,142],members:['env-upper-left']},
 {id:'canopy',rect:[1027,0,413,543],members:['env-canopy-right','bird','cicada']},
 {id:'perch',rect:[0,178,385,410],members:['env-perch-left','squirrel']},
 {id:'pond',rect:[0,476,578,484],members:['env-pond-left','frog','snail']},
 {id:'bank',rect:[1083,615,357,345],members:['env-bank-right','drop']},
] as const;
/** Display size of a character relative to its artwork box, anchored at its feet (bottom centre). The image is unchanged. */
export const characterScale:Record<string,number> = {drop:2/3};

export const mobilePlacement:Record<string,readonly number[]> = {
 cicada:[265,32,73,89],
 bird:[154,201,196,152], frog:[96,104,232,202],
 snail:[442.5,301.4,101,77.6], drop:[143,-214,123,168],
};
