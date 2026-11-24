import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionHomeBirth} from '../src/app/transitions/home-birth/transitionState.ts';

test('keep the home until the destination is ready, then crossfade and release it',()=>{
 const preparing=transitionHomeBirth('idle','START');
 assert.equal(preparing,'preparing');
 assert.equal(transitionHomeBirth(preparing,'READY'),'fading');
 assert.equal(transitionHomeBirth('fading','FINISHED'),'idle');
});
test('slow loading releases the home to show the existing loading UI; repeated clicks cannot restart the fade',()=>{
 assert.equal(transitionHomeBirth('preparing','TIMEOUT'),'fading');
 assert.equal(transitionHomeBirth('preparing','START'),'preparing');
 assert.equal(transitionHomeBirth('fading','START'),'fading');
 assert.equal(transitionHomeBirth('fading','READY'),'fading');
});
test('cancel on back or reduced motion; late readiness and timers cannot revive a canceled transition',()=>{
 for(const phase of ['idle','preparing','fading'] as const){
  const canceled=transitionHomeBirth(phase,'CANCEL');
  assert.equal(canceled,'idle');
  for(const event of ['READY','TIMEOUT','FINISHED'] as const)assert.equal(transitionHomeBirth(canceled,event),'idle');
 }
});
