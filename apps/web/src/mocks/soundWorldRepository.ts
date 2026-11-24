// Mock 万物声场 repository: the example field and units, and the in-memory work of this visit. Class and public sound
// libraries are reported as not open. Replaced by a server adapter in app/services.ts.
import type {SoundWorldRepository} from '../pages/sound-world/services/soundWorldRepository';
import {newId} from '../shared/creation/ids.ts';
import {workSession} from '../shared/creation/workSession.ts';
import {exampleArrangement,exampleUnit} from '../shared/creation/exampleWork.ts';
import {bundledSoundLibrary} from '../shared/creation/soundLibrary.ts';

export const mockSoundWorldRepository:SoundWorldRepository={
 // The child's own work if there is one this visit; otherwise the example field.
 async load(){return workSession.current()??exampleArrangement(newId('work'),new Date());},
 async save(arrangement){return workSession.save(arrangement)?{status:'session'}:{status:'failed'};},
 async scope(scope){
  switch(scope){
   // The same library 声音诞生 picks from (shared/creation/soundLibrary.ts), as units with the examples' presets.
   case 'example':return {status:'ready',units:(await bundledSoundLibrary.list()).examples.map(example=>exampleUnit(example.id,0))};
   case 'mine':return {status:'ready',units:workSession.current()?.units.filter(unit=>unit.input!=='example-preset')??[]};
   case 'class':return {status:'unavailable',reason:'needs-account'};
   case 'public':return {status:'unavailable',reason:'needs-review'};
  }
 },
 async loadSettings(){return workSession.settings();},
 async saveSettings(settings){return workSession.saveSettings(settings)?{status:'session'}:{status:'failed'};},
};
