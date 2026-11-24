import type {Visibility} from '@wanwu-v2/contracts/work';
import {homeLayer} from '../../../shared/scene/homeScene';

/** 作品书架 is kept by the snail — slow and careful, it keeps what you made. Reuses the home derivative. */
export const shelfGuide={label:'小蜗牛向导',variants:homeLayer('snail').variants};

export const shelfCopy={
 title:'作品书架',
 subtitle:'这次打开以来放进书架的小曲子，都在这里。',
 bubble:(count:number)=>count?`书架上有 ${count} 首小曲子，点「听一听」就能听，点「打开曲谱」回到万物成曲。`:'书架还空着。做完一首，点「保存这首作品」就会放到这里。',
 sessionBadge:'仅本次打开期间保留 · 刷新就没了',
 accountNote:'保存到账号、分享给班级还没有开放。',
 empty:'还没有作品',
 emptyHint:'在万物成曲点「保存这首作品」，它就会出现在这里。',
 makeOne:'去做一首',goCompose:'回到万物成曲',
 open:'打开曲谱',play:'听一听',stop:'停一停',preparing:'正在准备…',
 renameLabel:(title:string)=>`给「${title}」改个名字`,removeLabel:(title:string)=>`把「${title}」从书架上拿下来`,
 rename:{title:'改个名字',description:'最多 16 个字。只在这次打开期间有效。',placeholder:'例如：下雨天的歌',cancel:'不改了',save:'就叫这个'},
 remove:{title:'从书架上拿下来？',description:(title:string)=>`「${title}」会从书架上拿掉，拿掉就找不回来了。`,cancel:'留着',confirm:'拿下来'},
 failures:{'no-audio':'这个浏览器不能播放。','load-failed':'网络有点慢，声音没加载出来，再点一次试试。','missing-audio':'这首里的录音只在之前打开的页面里，刷新后找不到了。'},
 sounds:(count:number)=>`${count} 个声音`,
 seconds:(value:string)=>`约 ${value} 秒`,
 savedAt:(time:string)=>`${time} 放进书架`,
 current:'正在做的这首',
 visibility:{private:'仅自己可见',class:'班级可见',school:'学校可见',region:'地区可见',public:'公开'} satisfies Record<Visibility,string>,
 replace:{
  title:'换成这首？',
  description:'正在做的那首还没放进书架，打开这首会把它换掉。',
  keep:'先回去保存',open:'换成这首',
 },
} as const;
