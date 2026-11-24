import {useEffect,useRef,useState} from 'react';
import {AccountForm} from './AccountForm';
import {useAccountForm} from './useAccountForm';
import {resetLinkToken} from './resetLink';
import styles from './AccountDialog.module.css';

export function ResetPasswordPage({onHome}:{onHome:()=>void}){
 const consumed=useRef(false),[link,setLink]=useState<{ready:boolean;token:string|null;revision:number}>({ready:false,token:null,revision:0});
 useEffect(()=>{
  const read=()=>{
   const token=resetLinkToken(location.hash);
   // Retain the single-use secret only in component memory; strip it from the visible history entry.
   history.replaceState(history.state,'',location.pathname+location.search);
   setLink(previous=>({ready:true,token,revision:previous.revision+1}));
  };
  if(!consumed.current){consumed.current=true;read();}
  // Opening another link to the same page is a fragment navigation, not a React remount.
  addEventListener('hashchange',read);return()=>removeEventListener('hashchange',read);
 },[]);
 return <main className={styles.reset}><section className={styles.resetCard} aria-label="密码重置">
  <h1>重置老师账号密码</h1>
  <p className={styles.hint}>链接有效期 15 分钟，只能使用一次。更新后，所有旧设备都会退出登录。</p>
  {!link.ready?<p role="status">正在读取链接…</p>:link.token?<ResetForm key={link.revision} token={link.token} onHome={onHome}/>:<>
   <p className={styles.error} role="alert">重置链接缺失或无效，请重新打开尚未使用的原链接，或联系管理员。</p>
   <button type="button" className={styles.secondary} onClick={onHome}>返回首页登录</button>
  </>}
  <p className={styles.hint}>请勿转发链接。本页不保存链接信息；刷新后可重新打开尚未使用的原链接。</p>
 </section></main>;
}

function ResetForm({token,onHome}:{token:string;onHome:()=>void}){
 const form=useAccountForm('reset',token);
 return <>
  {form.complete?<p className={styles.status} role="status">{form.message}</p>:<AccountForm form={form}/>}
  <button type="button" className={styles.secondary} disabled={form.busy} onClick={onHome}>返回首页登录</button>
 </>;
}
