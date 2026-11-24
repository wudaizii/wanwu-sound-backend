import {loginUsername,validPassword} from '@wanwu-v2/contracts/account';

export type AccountFormMode='login'|'register'|'change'|'reset';
export type AccountDraft={username:string;password:string;confirmation:string;invitationCode:string;oldPassword:string};
export const emptyAccountDraft=():AccountDraft=>({username:'',password:'',confirmation:'',invitationCode:'',oldPassword:''});
export function validateAccountForm(mode:AccountFormMode,draft:AccountDraft):string|null{
 if((mode==='login'||mode==='register')&&!loginUsername(draft.username))return '账号须为 3–32 位英文字母、数字、下划线或短横线。';
 if(mode==='login')return draft.password.length>0&&[...draft.password].length<=128?null:'请填写密码（最多 128 个字符）。';
 if(mode==='register'&&!/^[A-Za-z0-9_-]{43}$/.test(draft.invitationCode.trim()))return '请填写管理员发给你的完整邀请码。';
 if(mode==='change'&&!draft.oldPassword)return '请填写当前密码。';
 if(!validPassword(draft.password))return '新密码须至少 12 个字符，并包含大写字母、小写字母、数字和特殊字符。';
 if(draft.password!==draft.confirmation)return '两次填写的新密码不一致。';
 return null;
}
