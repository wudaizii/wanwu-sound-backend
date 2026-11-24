// Only approved pages are activated here. No fake login or business API is provided.

/** Main flow. Steps without a path are not built yet and render as plain labels. */
export const flowSteps=[
 {id:'entry',label:'声音入口',path:'/'},
 {id:'birth',label:'声音诞生',path:'/create'},
 {id:'world',label:'万物声场',path:'/world'},
 {id:'compose',label:'万物成曲',path:'/compose'},
] as const;

export const destinations={
 create:{label:'开始成曲',page:'声音诞生',path:'/create',ready:true},
 shelf:{label:'作品书架',page:'作品书架',path:'/works',ready:true},
 login:{label:'登陆',page:'登录',path:'/sign-in',ready:false},
 api:{label:'API 输入',page:'模型配置',ready:true},
} as const;
export type HomeDestination=keyof typeof destinations;
