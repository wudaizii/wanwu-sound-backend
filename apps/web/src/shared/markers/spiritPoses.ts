// Live parts of each marker when it plays the sound character (声音诞生): eyes, shoulders and resting hands, in the
// 627 × 627 coordinates of the original marker PNG. Taken from the approved character study
// (万物声谱_视觉过程稿/声音角色交互预览/sound-spirit.js). The paper body itself is the unchanged marker artwork.
export type SpiritPose={
 /** [x, y, rotation°, rx, ry] per eye. */
 eyes:readonly (readonly [number,number,number,number,number])[];
 /** Left and right shoulder. */
 shoulders:readonly (readonly [number,number])[];
 /** Resting hand per arm. */
 hands:readonly (readonly [number,number])[];
 /** Where the body stands (its lowest point); the floor and the tapping hand use it. */
 bottom:number;
 /** Eyes a little narrower than round, for the slate marker's calmer look. */
 openness?:number;
};

export const spiritPoses:Record<string,SpiritPose>={
 'marker-sage':{eyes:[[342,160,28,43,62],[447,211,30,41,58]],shoulders:[[102,280],[551,364]],hands:[[40,411],[608,473]],bottom:586},
 'marker-ochre':{eyes:[[216,149,-6,40,65],[323,143,-9,41,65]],shoulders:[[100,301],[494,340]],hands:[[39,64],[589,92]],bottom:586},
 'marker-slate':{eyes:[[211,153,-8,43,64],[327,150,5,43,64]],shoulders:[[112,347],[533,362]],hands:[[29,458],[613,468]],bottom:520,openness:.83},
 'marker-lilac':{eyes:[[225,149,5,39,65],[333,141,8,40,66]],shoulders:[[106,327],[551,299]],hands:[[-25,248],[649,174]],bottom:521},
};

/** Arm tuning (marker units; the body is about 540 wide). */
export const spiritArm={
 base:300,
 /** Length range while the right hand points at a row. */
 reachMin:160,reachMax:330,
 /** Spring stiffness: higher follows faster. Critically damped, so it never overshoots. */
 follow:10,stretch:8,bend:6,
 stroke:25,
 /** Left hand: how high it hovers above the floor (marker units) and how long one tap takes (ms). */
 tapLift:120,tapMs:220,
} as const;
