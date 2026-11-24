import {homeGreenTones} from '../config/scene';

/** Green must exceed both red and blue, so neutral paper, stones and blue water stay unchanged. */
export function HomeToneFilters(){return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{position:'absolute'}}>
 <defs>{Object.entries(homeGreenTones).map(([kind,tone])=><filter key={kind} id={`home-${kind}-tone`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -8 8 0 0 0" result="greenOverRed"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 8 -8 0 0" result="greenOverBlue"/>
  <feComposite in="greenOverRed" in2="greenOverBlue" operator="in" result="greenMask"/>
  <feColorMatrix in="SourceGraphic" type="hueRotate" values={String(tone.hue)} result="shifted"/>
  <feColorMatrix in="shifted" type="saturate" values={String(tone.saturation)} result="tinted"/>
  <feComposite in="tinted" in2="greenMask" operator="in" result="greenTint"/>
  <feComposite in="SourceGraphic" in2="greenMask" operator="out" result="untouched"/>
  <feComposite in="greenTint" in2="untouched" operator="arithmetic" k2="1" k3="1"/>
 </filter>)}</defs>
</svg>;}
