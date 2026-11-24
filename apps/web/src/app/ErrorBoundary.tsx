import {Component} from 'react';
import type {ReactNode} from 'react';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main className="boot"><h1>这片森林暂时没打开</h1><p>再试一次，听听声音吧。</p><button type="button" onClick={()=>location.reload()}>重新打开</button></main>:this.props.children;}
}
