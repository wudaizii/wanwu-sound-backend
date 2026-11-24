import {useState} from 'react';
import {Glyph} from '../ui/PaperIcon';
import {useAccount} from './AccountProvider';
import {AccountDialog} from './AccountDialog';

export function AccountEntry({className}:{className?:string}){
 const [open,setOpen]=useState(false),{account}=useAccount();
 return <>
  <button type="button" className={className} aria-label={account?'老师账号':'登录'} onClick={()=>setOpen(true)}><Glyph name="person"/><span>{account?'老师账号':'登录'}</span></button>
  {open&&<AccountDialog onClose={()=>setOpen(false)}/>}
 </>;
}
