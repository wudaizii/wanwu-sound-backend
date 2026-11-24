import test from 'node:test';
import assert from 'node:assert/strict';
import {initialIntro,transitionIntro,shouldRememberIntro} from '../src/pages/home/model/introState.ts';
test('resource timeout is terminal: late decode cannot bring the intro back',()=>{
 const state=transitionIntro(initialIntro(),{type:'TIMEOUT'});
 assert.equal(state.phase,'settled');assert.deepEqual(transitionIntro(state,{type:'READY',elapsed:900}),state);
});
test('only an actually started or explicitly skipped opening counts as seen',()=>{
 for(const type of ['TIMEOUT','FAILED','HIDDEN','REDUCED'] as const)assert.equal(shouldRememberIntro(transitionIntro(initialIntro(),{type})),false);
 assert.equal(shouldRememberIntro(initialIntro({seen:true})),false);
 assert.equal(shouldRememberIntro(transitionIntro(initialIntro(),{type:'READY',elapsed:900},1800)),true);
 assert.equal(shouldRememberIntro(transitionIntro(initialIntro(),{type:'SKIP'})),true);
 assert.equal(shouldRememberIntro(transitionIntro(initialIntro(),{type:'READY',elapsed:1801},1800)),false);
});
test('reduced motion, data saver, coarse device hints, 2G and return visits skip animation',()=>{
 for(const policy of [{reduced:true},{saveData:true},{lowDevice:true},{weak:true},{seen:true}])assert.equal(initialIntro(policy).phase,'settled');
});
test('ready within deadline can play; slow ready settles; skip works while loading and playing',()=>{
 assert.equal(transitionIntro(initialIntro(),{type:'READY',elapsed:650}).phase,'playing');
 assert.equal(transitionIntro(initialIntro(),{type:'READY',elapsed:651}).phase,'settled');
 assert.equal(transitionIntro(initialIntro(),{type:'SKIP'}).phase,'settled');
 const playing=transitionIntro(initialIntro(),{type:'READY',elapsed:100});
 assert.equal(transitionIntro(playing,{type:'SKIP'}).phase,'settled');
});
