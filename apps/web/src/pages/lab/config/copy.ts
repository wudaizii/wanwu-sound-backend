// 调音台 wording. A tool for the music role in development and preview builds only; children and teachers never see it.
import type {RuleSetName} from '../model/ruleTree';
import type {Listen} from '../model/useLab';

export const labCopy={
 title:'调音台',
 subtitle:'只在开发 / 预览环境出现。用一组固定的声音，把通用规则调到“大多数声音都合适”，再导出规则文件。',
 readme:'每个参数的含义见 packages/sound-rules/README.md。',
 toPrompts:'去提示词台',
 soundTitle:'声音',upload:'上传一段',loading:'正在读取…',waveLabel:'波形：浅色是主体段，深色块是找到的单个声音',
 testSetNote:(have:number,missing:number)=>`测试声音集：已有 ${have} 段（就是声音库的示例），还差 ${missing} 段待收集（见 docs/assets/test-set.json）。`,
 kind:'分类',units:'找到的单个声音',unitMs:'一声多长',band:'高低',loudness:'平均 / 峰值响度',silent:'几乎无声',
 expected:(ok:boolean,want:string)=>ok?`✓ 和预期一致`:`✗ 预期是「${want}」`,
 bands:{short:'短',medium:'中',long:'长'},pitch:{low:'偏低',mid:'居中',high:'偏高'},
 mood:'背景心情',noMood:'不选',
 listen:{original:'听原声（统一响度）',shaped:'听塑形后',background:'塑形 + 本地背景'} satisfies Record<Listen,string>,stop:'停',
 rulesTitle:'规则',
 sets:{shaping:'五个维度',analysis:'声音体检',background:'本地背景',mix:'混音'} satisfies Record<RuleSetName,string>,
 setNotes:{
  shaping:'高低、长短、变化、轻响、出现方式各档怎么变（shaping）。',
  analysis:'怎么找单个声音、分三类、量一声多长和高低（analysis）。改了要运行 npm run assets:library 重算示例声音。',
  background:'心情配置表、旋律空档、结尾、课本歌曲的几种样子、碰一碰的判定（background）。',
  mix:'孩子的声音和背景的音量、背景让位、总线限幅（mix）。',
 } satisfies Record<RuleSetName,string>,
 reset:'恢复成规则文件里的数值',
 exportFile:(name:RuleSetName)=>`导出${({shaping:'五个维度',analysis:'声音体检',background:'本地背景',mix:'混音'} satisfies Record<RuleSetName,string>)[name]}规则文件`,
} as const;
