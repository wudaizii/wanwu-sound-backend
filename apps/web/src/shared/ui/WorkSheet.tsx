import type {ReactNode} from 'react';
import {Dialog} from './Dialog';
import {ui} from './controls';
import styles from './WorkSheet.module.css';

/** The shared work-page dialog (record, library, paper card, more sounds, 剪一剪, 自己写…). Focus and Esc come from Dialog. */
export function WorkSheet({title,description,className='',onClose,children}:{title:string;description?:string;className?:string;onClose:()=>void;children:ReactNode}){
 return <Dialog title={title} description={description} className={`${styles.sheet} ${className}`} onClose={onClose}>{children}</Dialog>;
}
/** Footer row of equal buttons, its two button looks, body text and the small centred note line used inside work sheets. */
export const sheetStyles={actions:styles.actions,note:styles.note,body:styles.body,primary:`${ui.pill} ${ui.go} ${styles.primary}`,secondary:`${ui.pill} ${ui.back} ${styles.secondary}`};
