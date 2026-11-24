import assets from './title-assets.generated.json';
export const titleAssets=assets;
export const titleCanvas={width:640,height:230};
export const titleMotion={enterMs:460,staggerMs:110,totalEnterMs:1450,decodeDeadlineMs:3500};
// Match the approved sketch's larger first line and taller main letters, with a shallow arch.
export const titleGlyphs=[
 // Align the visible ink bounds of 今天 and the main line at x=320; the comma hangs to the right.
 {index:0,x:242,y:6,size:82,height:82,angle:-8},{index:1,x:320,y:8,size:82,height:82,angle:5},{index:2,x:385,y:58,size:36,height:36,angle:10},
 // Optical spacing closes the extra ink gap before 了 while keeping the line centered.
 {index:3,x:45,y:116,size:96,height:112,angle:-10},{index:4,x:126,y:109,size:96,height:112,angle:-6},{index:5,x:207,y:104,size:96,height:112,angle:-3},
 {index:6,x:270,y:102,size:96,height:112,angle:1},{index:7,x:351,y:104,size:96,height:112,angle:3},{index:8,x:432,y:109,size:96,height:112,angle:6},{index:9,x:513,y:116,size:96,height:112,angle:10},
] as const;
// Independent image sprites launch from behind the static lettering, rise, fade and repeat.
export const titleParticles=[
 {index:3,x:92,y:174,size:27,rise:-142,drift:-18,angle:-10,duration:7100,delay:0},
 {index:0,x:185,y:153,size:29,rise:-154,drift:-25,angle:-12,duration:7900,delay:1000},
 {index:4,x:273,y:139,size:19,rise:-133,drift:12,angle:9,duration:6700,delay:2600},
 {index:1,x:441,y:154,size:34,rise:-156,drift:23,angle:12,duration:8800,delay:3400},
 {index:5,x:540,y:174,size:25,rise:-142,drift:24,angle:10,duration:7300,delay:1700},
 {index:2,x:362,y:139,size:25,rise:-168,drift:-13,angle:-9,duration:8200,delay:4500},
] as const;
