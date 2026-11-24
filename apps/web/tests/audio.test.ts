import test from 'node:test';
import assert from 'node:assert/strict';
import {SingleSoundPlayer} from '../src/shared/audio/SingleSoundPlayer.ts';
import type {AudioDevice} from '../src/shared/audio/SingleSoundPlayer.ts';
class AudioStub {
 src='';volume=1;muted=false;preload='';paused=true;
 pending:{resolve:()=>void;reject:(error:Error)=>void}[]=[];
 listener:(()=>void)|null=null;
 pause(){this.paused=true;}
 play(){this.paused=false;return new Promise<void>((resolve,reject)=>this.pending.push({resolve,reject}));}
 addEventListener(_name:string,fn:()=>void){this.listener=fn;}
 removeEventListener(){this.listener=null;}
}
test('last click wins; stale rejected/fulfilled plays cannot report as active',async()=>{
 const audio=new AudioStub(),playing:string[]=[],errors:string[]=[];
 const player=new SingleSoundPlayer(audio as unknown as AudioDevice,{playing:id=>playing.push(id),error:id=>errors.push(id)});
 const old=player.play('bird',{url:'bird.mp3',volume:.7}),next=player.play('frog',{url:'frog.mp3',volume:.7});
 audio.pending[0]!.reject(new Error('interrupted'));audio.pending[1]!.resolve();
 assert.equal(await old,'superseded');assert.equal(await next,'playing');assert.equal(audio.src,'frog.mp3');assert.deepEqual(playing,['frog']);assert.deepEqual(errors,[]);
});
test('mute or disposal during loading prevents late activation and removes listeners',async()=>{
 for(const operation of ['mute','dispose']){
  const audio=new AudioStub(),playing:string[]=[];
  const player=new SingleSoundPlayer(audio as unknown as AudioDevice,{playing:id=>playing.push(id)});
  const pending=player.play('drop',{url:'drop.mp3',volume:.7});
  if(operation==='mute')player.setMuted(true);else player.dispose();
  audio.pending[0]!.resolve();assert.equal(await pending,'superseded');assert.deepEqual(playing,[]);assert.equal(audio.paused,true);
  if(operation==='dispose')assert.equal(audio.listener,null);
 }
});
