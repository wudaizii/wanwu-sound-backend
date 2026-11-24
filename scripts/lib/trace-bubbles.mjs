import sharp from 'sharp';
// Trace the simple bubble outlines from the approved bitmap, keeping their uneven contours.
// Charcoal lettering and notes retain raster texture; only hollow bubbles use compact vectors.
export async function traceBubbles(cells){
 const shapes=[];
 for(let index=0;index<cells.length;index++){
  const {data,info}=await sharp(cells[index]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const cx=(info.width-1)/2,cy=(info.height-1)/2,scale=78/Math.max(info.width,info.height),points=[];
  for(let n=0;n<24;n++){
   const angle=n*Math.PI/12,cos=Math.cos(angle),sin=Math.sin(angle);let weight=0,total=0;
   for(let r=Math.min(cx,cy)*.4;r<Math.hypot(cx,cy);r+=.6){
    const x=Math.round(cx+r*cos),y=Math.round(cy+r*sin);if(x<0||y<0||x>=info.width||y>=info.height)continue;
    const alpha=data[(y*info.width+x)*4+3];if(alpha>60){const w=alpha*alpha;weight+=w;total+=w*r;}
   }
   const radius=weight?total/weight:.9/Math.hypot(cos/cx,sin/cy);
   points.push([index*96+48+radius*cos*scale,48+radius*sin*scale]);
  }
  const point=n=>points[(n+points.length)%points.length],f=v=>v.toFixed(1);
  const first=index===1?2:0,last=index===1?24:25;
  let d=`M${point(first).map(f).join(',')}`;
  for(let n=first;n<last-1;n++){
   const [a,b,c,e]=[point(n-1),point(n),point(n+1),point(n+2)];
   d+=`C${f(b[0]+(c[0]-a[0])/6)},${f(b[1]+(c[1]-a[1])/6)} ${f(c[0]-(e[0]-b[0])/6)},${f(c[1]-(e[1]-b[1])/6)} ${c.map(f).join(',')}`;
  }
  if(index!==1)d+='Z';
  shapes.push(`<path d="${d}" stroke-width="${index===2?6:5.5}"/>`);
 }
 return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="288" height="96" viewBox="0 0 288 96"><g fill="none" stroke="#252525" stroke-linecap="round" stroke-linejoin="round">${shapes.join('')}</g></svg>`);
}
