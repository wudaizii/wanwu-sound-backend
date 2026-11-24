// Child-facing wording for the five dimensions — the one copy every page uses (声音诞生 editor, 万物声场 excerpt editor,
// later 万物成曲). Option order follows SOUND_CHOICES in the contract.
import type {SoundDimension,SoundShape} from '@wanwu-v2/contracts/sound';
import type {PaperIconName} from '../ui/PaperIcon';

type DimensionCopy<K extends SoundDimension>={label:string;icon:PaperIconName;options:Record<SoundShape[K],string>};

export const dimensionCopy:{[K in SoundDimension]:DimensionCopy<K>}={
 pitch:{label:'高低',icon:'pitch',options:{low:'低低的',mid:'中间的',high:'高高的'}},
 duration:{label:'长短',icon:'duration',options:{short:'短短的',medium:'刚刚好',long:'长长的'}},
 contour:{label:'变化',icon:'contour',options:{rising:'往上走',falling:'往下落',flat:'稳稳的',wavy:'有起伏'}},
 intensity:{label:'轻响',icon:'intensity',options:{soft:'轻轻的',medium:'刚刚好',loud:'响亮的'}},
 pattern:{label:'出现方式',icon:'pattern',options:{once:'出现一次',repeat:'重复出现',bursts:'一阵一阵','fade-in':'慢慢出现'}},
};
