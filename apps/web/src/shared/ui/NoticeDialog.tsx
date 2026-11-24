import {Dialog} from './Dialog';
import './notice-dialog.css';
export function NoticeDialog({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
 return <Dialog title={title} className="notice-dialog" onClose={onClose}>
  <div className="notice-copy">{children}</div>
  <button className="notice-return" type="button" onClick={onClose}>回到森林</button>
 </Dialog>;
}
