// 万物声场 is led by the frog — it hops between lily pads the way sounds hop between places in the field.
// Reuses the home derivative (already cached). What it says is in ./guideLines.ts.
import {homeLayer} from '../../../shared/scene/homeScene';

export const worldGuide={label:'小青蛙向导',variants:homeLayer('frog').variants};
export {guideLines} from './guideLines';
