import {AccountError} from './accountClient';

export function accountErrorText(error:unknown){
 if(!(error instanceof AccountError))return '连接未完成，请稍后重试。当前创作没有被清空。';
 const messages:Partial<Record<AccountError['reason'],string>>={
  'invalid-invitation':'邀请码已失效、已使用或已撤销，请联系管理员。',
  'invalid-credentials':'账号或密码不正确。',
  'username-taken':'这个账号名已被使用，请换一个。',
  'invalid-reset-token':'重置链接已失效或已使用，请联系管理员重新获取。',
  'needs-account':'登录已过期，请重新登录。',
  'account-disabled':'此账号已停用，请联系管理员。',
  'csrf-failed':'登录状态已变化，请再次提交；刚才的操作没有通过验证。',
  'not-open':'账号服务暂未开放；仍可作为访客在当前页面创作。',
  'https-required':'账号服务需要 HTTPS，请联系管理员检查入口。',
  'bad-response':'账号服务返回异常，未确认操作成功，请稍后重试。',
  'network':'连接未完成，无法确认操作结果。请检查网络后重试。',
  'timeout':'连接超时，无法确认操作结果。请稍后重试。',
  'session-unavailable':'登录状态暂时无法保存，请稍后重试。',
  'forbidden':'当前账号没有此操作权限。',
 };
 if(error.reason==='rate-limited'||error.reason==='busy')return error.retryAfter?`请求较多，请 ${error.retryAfter} 秒后重试。`:'请求较多，请稍后重试。';
 return messages[error.reason]??'操作未完成，请稍后重试。';
}
