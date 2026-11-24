import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveTitlePhase,canAnimateTitleDecorations} from '../src/pages/home/model/titleMotionState.ts';
test('entrance waits for decoded lettering and for the forest to settle',()=>{
 const base={ready:true,staticMode:false,completed:false};
 for(const reason of ['finish','seen','timeout'])assert.equal(deriveTitlePhase({...base,opening:{phase:'settled',reason}}),'entering');
 for(const phase of ['waiting','playing'] as const)assert.equal(deriveTitlePhase({...base,opening:{phase,reason:null}}),'waiting');
 assert.equal(deriveTitlePhase({...base,ready:false,opening:{phase:'settled',reason:'finish'}}),'waiting');
});
test('skip, hidden tab, completed entrance and lightweight mode reveal the complete title',()=>{
 const base={ready:true,staticMode:false,completed:false,opening:{phase:'settled' as const,reason:'finish'}};
 for(const reason of ['skip','hidden'])assert.equal(deriveTitlePhase({...base,opening:{phase:'settled',reason}}),'settled');
 for(const change of [{staticMode:true},{completed:true}])assert.equal(deriveTitlePhase({...base,...change}),'settled');
});
test('ambient motion starts only after entrance; hidden and reduced-motion modes stop looping',()=>{
 assert.equal(canAnimateTitleDecorations('settled',false,false),true);
 for(const phase of ['waiting','entering'] as const)assert.equal(canAnimateTitleDecorations(phase,false,false),false);
 assert.equal(canAnimateTitleDecorations('settled',true,false),false);
 assert.equal(canAnimateTitleDecorations('settled',false,true),false);
 assert.equal(canAnimateTitleDecorations('fallback',false,false),false);
});
test('failed or timed-out lettering gets an explicit static fallback rather than permanent loading',()=>{
 assert.equal(deriveTitlePhase({ready:false,failed:true,staticMode:false,completed:false,opening:{phase:'settled',reason:'finish'}}),'fallback');
});
