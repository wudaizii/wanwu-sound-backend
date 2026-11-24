import {useState} from 'react';
import {Glyph} from './PaperIcon';
import {WorkSheet,sheetStyles} from './WorkSheet';
import type {Classroom} from './classroom';

const copy={library:'声音库',shelf:'作品书架',classroomOn:'大屏',classroomOff:'退出大屏',classroomLabel:'课堂大屏：全屏、大字、大按钮',
 libraryTitle:'声音库在万物声场里',
 libraryBody:['回到万物声场，点「找更多声音」，就能加示例声音和自己做的声音。','班级和公共声音库还没有开放。'],
 goWorld:'去万物声场',stay:'留在这里'};

/**
 * The work pages' secondary entries in the flow header (声音库 · 作品书架). A page with its own sound library passes
 * `onLibrary`; elsewhere 声音库 explains where the library lives. 作品书架 opens the shelf page. Place inside FlowHeader's
 * `aside`; `current` marks the shelf button on the shelf page.
 */
export function WorkHeaderActions({onLibrary,onNavigate,current,classroom}:{onLibrary?:()=>void;onNavigate:(path:string)=>void;current?:'shelf';
 /** Pages shown on the classroom board (万物声场, 万物成曲) pass it to offer 大屏. */
 classroom?:Classroom}){
 const [library,setLibrary]=useState(false);
 return <>
  {classroom&&<button type="button" aria-pressed={classroom.on} title={copy.classroomLabel} onClick={classroom.toggle}><Glyph name="screen"/><span>{classroom.on?copy.classroomOff:copy.classroomOn}</span></button>}
  <button type="button" onClick={onLibrary??(()=>setLibrary(true))}><Glyph name="sounds"/><span>{copy.library}</span></button>
  <button type="button" aria-current={current==='shelf'?'page':undefined} onClick={()=>onNavigate('/works')}><Glyph name="shelf"/><span>{copy.shelf}</span></button>
  {library&&<WorkSheet title={copy.libraryTitle} onClose={()=>setLibrary(false)}>
   {copy.libraryBody.map(line=><p key={line} className={sheetStyles.body}>{line}</p>)}
   <div className={sheetStyles.actions}>
    <button type="button" className={sheetStyles.secondary} onClick={()=>setLibrary(false)}>{copy.stay}</button>
    <button type="button" className={sheetStyles.primary} onClick={()=>{setLibrary(false);onNavigate('/world');}}>{copy.goWorld}</button>
   </div>
  </WorkSheet>}
 </>;
}
