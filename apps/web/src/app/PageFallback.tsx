import {flowSteps} from './navigation';
import {FlowHeader} from '../shared/ui/FlowHeader';

/** Shown while a lazily loaded page's code arrives; keeps the header so slow networks never see a blank screen. */
export function PageFallback({current}:{current:(typeof flowSteps)[number]['id']|null}){
 return <><FlowHeader steps={flowSteps} current={current} onNavigate={path=>{location.href=path;}}/>
  <p role="status" style={{textAlign:'center',color:'var(--muted)',fontSize:'var(--font-body)',marginTop:'20vh'}}>正在打开…</p></>;
}
