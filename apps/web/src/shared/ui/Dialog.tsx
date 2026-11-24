import {useEffect,useId,useRef} from 'react';
import type {ReactNode} from 'react';
import styles from './Dialog.module.css';

type DialogProps={
 title:string;
 description?:string;
 className?:string;
 children:ReactNode;
 onClose:()=>void;
};

/** Native modal owns focus containment; the caller owns its content and dismissal state. */
export function Dialog({title,description,className='',children,onClose}:DialogProps){
 const ref=useRef<HTMLDialogElement>(null);
 const id=useId();
 useEffect(()=>{
  const dialog=ref.current;
  if(!dialog)return;
  const returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  dialog.showModal();
  return()=>{
   dialog.close();
   document.body.style.overflow=previousOverflow;
   if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  };
 },[]);
 return <dialog ref={ref} className={`${styles.dialog} ${className}`} aria-labelledby={`${id}-title`}
  aria-describedby={description?`${id}-description`:undefined}
  onCancel={event=>{event.preventDefault();onClose();}}
  onClick={event=>{
   if(event.target!==event.currentTarget)return;
   const rect=event.currentTarget.getBoundingClientRect();
   if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();
  }}>
  <button className={styles.close} type="button" aria-label="关闭弹窗" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="m6 6 12 12m0-12L6 18"/></svg></button>
  <header className={styles.header}>
   <h2 id={`${id}-title`}>{title}</h2>
   {description&&<p id={`${id}-description`} className={styles.description}>{description}</p>}
  </header>
  {children}
 </dialog>;
}
