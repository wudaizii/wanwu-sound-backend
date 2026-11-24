export const API_ERROR_REASONS=[
 'invalid-request','invalid-invitation','needs-account','invalid-credentials','forbidden','account-disabled','not-found',
 'id-conflict','account-changed','source-mismatch','confirmation-required','source-not-ready','version-conflict','precondition-required',
 'too-large','unsupported-media','rate-limited','failed','temporarily-unavailable',
 'username-taken','already-redeemed','invalid-reset-token','admin-already-exists','csrf-failed','https-required',
 'busy','session-unavailable','not-open','internal-error',
] as const;
export type ApiErrorReason=typeof API_ERROR_REASONS[number];
/** HTTP status stays on the response; v0.6 uses the string "error" here. */
export type ApiFailure={status:'error';reason:ApiErrorReason;message?:string;requestId:string};
export function parseApiFailure(value:unknown):ApiFailure|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const raw=value as Record<string,unknown>;
 if(Object.keys(raw).some(key=>!['status','reason','message','requestId'].includes(key)))return null;
 return raw.status==='error'&&API_ERROR_REASONS.includes(raw.reason as ApiErrorReason)
  &&typeof raw.requestId==='string'&&raw.requestId.length>0&&raw.requestId.length<=128
  &&(raw.message===undefined||(typeof raw.message==='string'&&raw.message.length<=512))?raw as ApiFailure:null;
}
