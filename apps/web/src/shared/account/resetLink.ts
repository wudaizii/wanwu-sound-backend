export function resetLinkToken(hash:string):string|null{
 const values=new URLSearchParams(hash.replace(/^#/,''));
 const token=values.get('token');
 return [...values.keys()].length===1&&token&&/^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
}
