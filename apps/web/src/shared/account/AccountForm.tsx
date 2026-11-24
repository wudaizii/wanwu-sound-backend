import {useId} from 'react';
import type {useAccountForm} from './useAccountForm';
import styles from './AccountDialog.module.css';

export function AccountForm({form}:{form:ReturnType<typeof useAccountForm>}){
 const id=useId(),{mode,draft,busy,update}=form;
 const submitText=mode==='login'?'登录':mode==='register'?'注册并登录':mode==='change'?'更新密码并退出':'重置密码';
 return <form className={styles.form} onSubmit={event=>{event.preventDefault();void form.submit();}} aria-busy={busy}>
  <fieldset disabled={busy}>
   {(mode==='login'||mode==='register')&&<>
    <label htmlFor={`${id}-username`}>账号</label>
    <input id={`${id}-username`} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={32} value={draft.username} onChange={event=>update('username',event.target.value)} required aria-describedby={`${id}-username-hint`}/>
    <p id={`${id}-username-hint`} className={styles.hint}>3–32 位英文字母、数字、下划线或短横线，不区分大小写。</p>
   </>}
   {mode==='register'&&<>
    <label htmlFor={`${id}-invitation`}>邀请码</label>
    <input id={`${id}-invitation`} name="invitationCode" autoComplete="off" autoCapitalize="none" spellCheck={false} value={draft.invitationCode} onChange={event=>update('invitationCode',event.target.value)} required/>
    <p className={styles.hint}>仅限受邀老师注册；邀请码仅注册时使用。</p>
   </>}
   {mode==='change'&&<>
    <label htmlFor={`${id}-old-password`}>当前密码</label>
    <input id={`${id}-old-password`} name="oldPassword" type="password" autoComplete="current-password" value={draft.oldPassword} onChange={event=>update('oldPassword',event.target.value)} required/>
   </>}
   <label htmlFor={`${id}-password`}>{mode==='login'?'密码':'新密码'}</label>
   <input id={`${id}-password`} name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={draft.password} onChange={event=>update('password',event.target.value)} required aria-describedby={mode==='login'?undefined:`${id}-password-hint`}/>
   {mode!=='login'&&<>
    <p id={`${id}-password-hint`} className={styles.hint}>至少 12 个字符，包含大写字母、小写字母、数字和特殊字符；可使用中文和空格。</p>
    <label htmlFor={`${id}-confirmation`}>再次填写新密码</label>
    <input id={`${id}-confirmation`} name="confirmation" type="password" autoComplete="new-password" value={draft.confirmation} onChange={event=>update('confirmation',event.target.value)} required/>
   </>}
   {form.error&&<p className={styles.error} role="alert">{form.error}</p>}
   <p className={styles.status} role="status">{form.message}</p>
   <button className={styles.primary} type="submit">{busy?'正在处理…':submitText}</button>
  </fieldset>
 </form>;
}
