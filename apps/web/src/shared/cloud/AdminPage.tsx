import {useEffect,useState} from 'react';
import {parseAccountView} from '@wanwu-v2/contracts/account';
import type {AccountView,InvitationView} from '@wanwu-v2/contracts/account';
import {AccountEntry} from '../account/AccountEntry';
import {useAccount} from '../account/AccountProvider';
import {useCloud} from './CloudProvider';
import {cloudError} from './cloudTypes';
import styles from './CloudControls.module.css';

export function AdminPage({onHome}:{onHome:()=>void}){
 const {account,checking}=useAccount(),{workspace}=useCloud();
 const [accounts,setAccounts]=useState<AccountView[]>([]),[invitations,setInvitations]=useState<InvitationView[]>([]),[secret,setSecret]=useState('');
 const [sourceId,setSourceId]=useState(''),[workId,setWorkId]=useState(''),[entryId,setEntryId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [pending,setPending]=useState<{title:string;action:()=>Promise<void>}|null>(null);
 const guard=()=>{if(workspace.state.accountId!==account?.id)throw new Error('账号已切换，请重新打开管理页。');};
 const refresh=async()=>{
  const users:AccountView[]=[];let cursor:string|null=null;
  do{const result:{data:{items:unknown[];nextCursor:string|null}}=await workspace.api.business(`/api/v1/admin/accounts${cursor?`?cursor=${cursor}`:''}`);guard();
   const parsed=result.data.items.map(value=>parseAccountView(value));if(parsed.some(value=>!value))throw new Error('账号列表返回异常。');users.push(...parsed as AccountView[]);cursor=result.data.nextCursor;
  }while(cursor&&users.length<1000);
  const codes=await workspace.api.business<{invitations:InvitationView[]}>('/api/v1/admin/invitations');guard();setAccounts(users);setInvitations(codes.data.invitations);
 };
 const act=async(action:()=>Promise<void>)=>{if(busy||!account)return;const expected=account.id;setBusy(true);setMessage('');try{await action();}catch(error){if(workspace.state.accountId===expected)setMessage(cloudError(error));}finally{if(workspace.state.accountId===expected)setBusy(false);}};
 useEffect(()=>{setSecret('');setPending(null);setAccounts([]);setInvitations([]);setBusy(false);setMessage('');if(account?.role==='admin')void refresh().catch(error=>{if(workspace.state.accountId===account.id)setMessage(cloudError(error));});},[account?.id,workspace]);
 if(checking)return <main className={styles.page}><p>正在确认管理权限…</p></main>;
 if(account?.role!=='admin')return <main className={styles.page}><h1>需要管理员账号</h1><p>权限由服务端核对，普通老师不能使用此入口。</p><AccountEntry/><button className={styles.button} onClick={onHome}>返回首页</button></main>;
 return <main className={styles.page}>
  <div className={styles.actions}><h1>万物声谱 · 最小管理入口</h1><button className={styles.button} onClick={onHome}>返回首页</button><AccountEntry/></div>
  <p className={styles.hint}>这里只处理邀请、账号恢复和异常下架，不承担逐条人工审核。所有操作由服务端鉴权并记录审计。</p>
  <section className={styles.card}><h2>发放邀请</h2><button className={styles.primary} disabled={busy} onClick={()=>void act(async()=>{
   const result=await workspace.api.business<{code:string;expiresAt:string}>('/api/v1/admin/invitations','POST',{});guard();setSecret(result.data.code);setMessage(`邀请码只展示本次，有效至 ${new Date(result.data.expiresAt).toLocaleString('zh-CN')}。`);await refresh();
  })}>生成单次邀请码</button>
   <ul className={styles.list}>{invitations.map(invite=><li key={invite.id}><p>{invite.redeemedAt?'已使用':invite.revokedAt?'已撤销':Date.parse(invite.expiresAt)<Date.now()?'已过期':'未使用'} · 到期 {new Date(invite.expiresAt).toLocaleString('zh-CN')}</p>
    {!invite.redeemedAt&&!invite.revokedAt&&<button className={styles.button} disabled={busy} onClick={()=>setPending({title:'确认撤销此邀请码？',action:async()=>{await workspace.api.business(`/api/v1/admin/invitations/${invite.id}`,'DELETE');await refresh();}})}>撤销邀请</button>}
   </li>)}</ul>
  </section>
  {secret&&<section className={styles.card}><h2>一次性敏感信息</h2><p className={styles.hint}>仅通过已核实的合作渠道发送，不要贴到项目、日志或公开群；离开页面后不会保存。</p>
   <p className={styles.link}>{secret}</p><div className={styles.actions}><button className={styles.button} onClick={()=>void act(async()=>{await navigator.clipboard.writeText(secret);setMessage('已复制，请妥善发送并按需清理系统剪贴板。');})}>复制</button><button className={styles.button} onClick={()=>setSecret('')}>清除此处显示</button></div>
  </section>}
  <section className={styles.card}><h2>老师账号与恢复</h2><p className={styles.hint}>核实身份后才生成 15 分钟、单次使用的恢复链接。停用会撤销该账号会话及分享；重新启用不会恢复旧会话。</p>
   <ul className={styles.list}>{accounts.map(user=><li key={user.id}><p>{user.username} · {user.role==='admin'?'管理员':'老师'} · {user.status==='active'?'可用':'停用'}</p><div className={styles.actions}>
    {user.role!=='admin'&&<button className={styles.button} disabled={busy} onClick={()=>setPending({title:user.status==='active'?'确认停用此账号并撤销会话和分享？':'确认重新启用此账号？',action:async()=>{await workspace.api.business(`/api/v1/admin/accounts/${user.id}`,'PATCH',{status:user.status==='active'?'disabled':'active'});await refresh();}})}>{user.status==='active'?'停用账号':'重新启用'}</button>}
    <button className={styles.button} disabled={busy||user.status!=='active'} onClick={()=>setPending({title:'已通过合作渠道核实身份，确认生成一次性恢复链接？',action:async()=>{
     const result=await workspace.api.business<{resetUrl:string}>(`/api/v1/admin/accounts/${user.id}/password-reset`,'POST',{});guard();setSecret(result.data.resetUrl);setMessage('恢复链接只展示本次，已有未使用链接已撤销。');
    }})}>生成密码恢复链接</button>
   </div></li>)}</ul>
  </section>
  <section className={styles.card}><h2>异常内容下架</h2><p className={styles.hint}>使用被反馈的精确 ID 操作，不批量扫描、读取或更改其他项目的数据。</p>
   <div className={styles.form}><label>异常音源 ID<input value={sourceId} onChange={event=>setSourceId(event.target.value)}/></label>
    <button className={styles.button} disabled={busy||!sourceId} onClick={()=>setPending({title:'确认停用该音源、相关节选和素材条目，并撤销涉及它们的分享？',action:async()=>{await workspace.api.business(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}/disable`,'POST',{});setMessage('音源已停用，相关分享已撤销。');}})}>停用音源</button>
    <label>异常素材条目 ID<input value={entryId} onChange={event=>setEntryId(event.target.value)}/></label>
    <button className={styles.button} disabled={busy||!entryId} onClick={()=>setPending({title:'确认停用此素材条目？已有合法作品引用不会因此被物理删除。',action:async()=>{await workspace.api.business(`/api/v1/admin/library/entries/${encodeURIComponent(entryId)}/disable`,'POST',{});setMessage('条目已停用；若音频本身异常，请同时停用音源。');}})}>停用素材条目</button>
    <label>作品 ID<input value={workId} onChange={event=>setWorkId(event.target.value)}/></label>
    <button className={styles.button} disabled={busy||!workId} onClick={()=>setPending({title:'确认撤销此作品的活动分享？',action:async()=>{await workspace.api.business(`/api/v1/admin/works/${encodeURIComponent(workId)}/share`,'DELETE');setMessage('分享已撤销。');}})}>撤销作品分享</button>
   </div>
  </section>
  {pending&&<section className={styles.card} role="alert"><p>{pending.title}</p><div className={styles.actions}>
   <button className={styles.button} disabled={busy} onClick={()=>setPending(null)}>取消</button><button className={styles.primary} disabled={busy} onClick={()=>void act(async()=>{const action=pending.action;setPending(null);await action();})}>确认执行</button>
  </div></section>}
  <p role="status" className={styles.status}>{message}</p>
 </main>;
}
