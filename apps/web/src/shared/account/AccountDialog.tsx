import {Dialog} from '../ui/Dialog';
import {useAccount} from './AccountProvider';
import {AccountForm} from './AccountForm';
import {useAccountForm} from './useAccountForm';
import {accountErrorText} from './copy';
import styles from './AccountDialog.module.css';

export function AccountDialog({onClose}:{onClose:()=>void}){
 const {account,checking,error,session}=useAccount(),form=useAccountForm();
 const settings=!!account&&form.mode!=='change';
 return <Dialog title={account?'老师账号':form.mode==='register'?'受邀老师注册':'老师登录'} className={styles.dialog} onClose={onClose}
  description="孩子和访客不需要账号，可以继续在当前页面创作。">
  <p className={styles.notice}>登录不会自动导入或覆盖当前创作。请在上方云端栏主动确认保存；未上传、未保存的本地内容刷新后可能丢失。</p>
  {checking&&<p className={styles.hint} role="status">正在确认登录状态…</p>}
  {error&&!form.error&&<div className={styles.error} role="alert"><p>{accountErrorText(error)}</p><button className={styles.secondary} type="button" disabled={form.busy||checking} onClick={()=>void session.refresh()}>重新检查</button></div>}
  {settings?<>
   <p className={styles.identity}>当前账号：{account.username}</p>
   {account.role==='admin'&&<p className={styles.hint}>管理员身份已由服务端确认，可从上方云端栏进入账号与异常内容管理。</p>}
   <p className={styles.status} role="status">{form.message}</p>
   {form.error&&<p className={styles.error} role="alert">{form.error}</p>}
   <div className={styles.actions}>
    <button className={styles.secondary} type="button" disabled={form.busy} onClick={()=>form.select('change')}>修改密码</button>
    <button className={styles.secondary} type="button" disabled={form.busy} onClick={()=>void form.logout()}>{form.busy?'正在处理…':'退出账号'}</button>
   </div>
  </>:<>
   {form.mode!=='change'&&<nav className={styles.tabs} aria-label="账号入口">
    <button type="button" aria-pressed={form.mode==='login'} disabled={form.busy} onClick={()=>form.select('login')}>账号登录</button>
    <button type="button" aria-pressed={form.mode==='register'} disabled={form.busy} onClick={()=>form.select('register')}>邀请码注册</button>
   </nav>}
   <AccountForm form={form}/>
   {form.mode==='login'&&<p className={styles.hint}>忘记密码？请通过已有合作渠道联系管理员核实身份，获取一次性重置链接。</p>}
   {form.mode==='change'&&<button className={styles.secondary} type="button" disabled={form.busy} onClick={()=>form.select('login')}>返回账号信息</button>}
  </>}
 </Dialog>;
}
