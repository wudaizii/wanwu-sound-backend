import type {CharacterId} from '../../../shared/media/types';
const frames:Record<CharacterId,Keyframe[]>={
 bird:[{transform:'translateY(0) rotate(0)'},{transform:'translateY(-7px) rotate(-5deg)',offset:.3},{transform:'translateY(-3px) rotate(3deg)',offset:.65},{transform:'translateY(0) rotate(0)'}],
 frog:[{transform:'scale(1)'},{transform:'scale(1.045,.94)',offset:.22},{transform:'translateY(-10px) scale(.98,1.025)',offset:.5},{transform:'scale(1)'}],
 squirrel:[{transform:'rotate(0)'},{transform:'rotate(-4deg)',offset:.3},{transform:'rotate(3deg)',offset:.65},{transform:'rotate(0)'}],
 cicada:[{transform:'translateX(0)'},{transform:'translateX(-1px) rotate(-1.5deg)'},{transform:'translateX(1px) rotate(1.5deg)'},{transform:'translateX(0)'}],
 drop:[{transform:'translateY(0) scale(1)'},{transform:'translateY(-9px) scale(.97,1.025)',offset:.35},{transform:'translateY(1px) scale(1.04,.96)',offset:.75},{transform:'translateY(0) scale(1)'}],
 snail:[{transform:'translateX(0)'},{transform:'translateX(7px)',offset:.65},{transform:'translateX(0)'}],
};
export function animateSticker(el:HTMLElement,id:CharacterId,reduced:boolean){
 if(!el.animate)return null;
 return el.animate(reduced?[{opacity:1},{opacity:.72},{opacity:1}]:frames[id],{
  duration:reduced?220:id==='snail'?2200:id==='cicada'?260:850,
  iterations:!reduced&&id==='cicada'?3:1,easing:'ease-in-out',
 });
}
