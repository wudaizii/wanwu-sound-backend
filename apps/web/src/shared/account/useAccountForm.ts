import {useState} from 'react';
import {useAccount} from './AccountProvider';
import {accountErrorText} from './copy';
import {emptyAccountDraft,validateAccountForm} from './formValidation';
import type {AccountDraft,AccountFormMode} from './formValidation';

export function useAccountForm(initial:AccountFormMode='login',resetToken:string|null=null){
 const {session,busy}=useAccount();
 const [mode,setMode]=useState(initial),[draft,setDraft]=useState(emptyAccountDraft);
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[complete,setComplete]=useState(false);
 const update=(key:keyof AccountDraft,value:string)=>setDraft(previous=>({...previous,[key]:value}));
 const clearPasswords=()=>setDraft(previous=>({...previous,password:'',confirmation:'',oldPassword:''}));
 const select=(next:AccountFormMode)=>{if(busy)return;session.clearError();setMode(next);setDraft(emptyAccountDraft());setError('');setMessage('');};
 const submit=async()=>{
  if(busy)return;
  const invalid=validateAccountForm(mode,draft);setError(invalid??'');setMessage('');if(invalid)return;
  try{
   if(mode==='login')await session.login(draft.username,draft.password);
   else if(mode==='register')await session.register({username:draft.username,password:draft.password,invitationCode:draft.invitationCode.trim()});
   else if(mode==='change'){await session.changePassword(draft.oldPassword,draft.password);setMode('login');}
   else{
    if(!resetToken){setError('重置链接无效，请联系管理员。');return;}
    await session.resetPassword(resetToken,draft.password);setComplete(true);
   }
   setMessage(mode==='change'||mode==='reset'?'密码已更新，旧设备已退出，请重新登录。':'登录成功。当前本地创作未迁移，请主动确认保存到账号。');
  }catch(caught){setError(accountErrorText(caught));}
  finally{clearPasswords();}
 };
 const logout=async()=>{
  if(busy)return;setError('');setMessage('');
  try{await session.logout();setMode('login');setDraft(emptyAccountDraft());setMessage('已退出账号；当前页面的本地创作仍保留，请勿在共用设备上交给其他人使用。');}
  catch(caught){setError(accountErrorText(caught));}
 };
 return {mode,draft,update,select,submit,logout,error,message,complete,busy};
}
