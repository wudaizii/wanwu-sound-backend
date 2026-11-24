// Repeatable "randomness": the same source always gets the same small variations (一阵一阵 never sounds machine-made, and
// never changes between two plays). FNV-1a hash of a seed string feeding mulberry32.
export function seeded(seed:string){
 let state=2166136261;
 for(let i=0;i<seed.length;i++){state^=seed.charCodeAt(i);state=Math.imul(state,16777619);}
 return()=>{
  state=(state+0x6d2b79f5)|0;
  let t=Math.imul(state^(state>>>15),1|state);
  t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return ((t^(t>>>14))>>>0)/4294967296;
 };
}
