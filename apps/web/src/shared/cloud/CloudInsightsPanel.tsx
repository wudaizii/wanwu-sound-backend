import {useState} from 'react';
import {useCloud} from './CloudProvider';
import {cloudError} from './cloudTypes';
import styles from './CloudControls.module.css';

export function readableBytes(bytes:number){if(bytes>=1024**3)return `${(bytes/1024**3).toFixed(2)} GiB`;if(bytes>=1024**2)return `${(bytes/1024**2).toFixed(1)} MiB`;if(bytes>=1024)return `${Math.ceil(bytes/1024)} KiB`;return `${bytes} B`;}
export function CloudInsightsPanel(){
 const cloud=useCloud(),[error,setError]=useState('');
 const usage=cloud.usage;
 return <div className={styles.insights}>
  <section aria-label="账号音频用量" className={styles.insightRow}>
   <div><p role="status">{usage?`音频空间预留 ${readableBytes(usage.reservedBytes)} / ${readableBytes(usage.limits.storageBytes)}`:cloud.usagePhase==='loading'?'正在读取账号用量…':'账号用量暂不可用'}</p>
    {usage&&<p className={styles.hint}>处理中：声音 {usage.pendingSources}/{usage.limits.pendingSources}，成品 {usage.pendingRenders}/{usage.limits.pendingRenders}。空间包含处理中的音频预留。</p>}
    {cloud.usageMessage&&<p className={styles.hint}>{cloud.usageMessage}</p>}
   </div>
   <button type="button" className={styles.button} disabled={cloud.usagePhase==='loading'} onClick={()=>void cloud.workspace.insights.refreshUsage(true)}>刷新用量</button>
  </section>
  {cloud.workId&&<section aria-label="云端版本核对" className={styles.insightRow}>
   <div><p role="status">{cloud.factsMessage||'保存完成后可核对云端版本。'}</p>{cloud.talkMessage&&<p className={styles.hint}>{cloud.talkMessage}</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
   </div>
   <button type="button" className={styles.button} disabled={cloud.busy||cloud.phase==='conflict'||cloud.factsPhase==='loading'} onClick={()=>{setError('');void(async()=>{try{await cloud.workspace.flush();await cloud.workspace.insights.refreshFacts();}catch(caught){setError(cloudError(caught));}})();}}>核对云端版本</button>
  </section>}
 </div>;
}
