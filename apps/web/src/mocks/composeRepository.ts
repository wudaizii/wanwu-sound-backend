// Mock 万物成曲 repository: the current work of this visit (shared/creation/workSession) and the in-memory shelf
// (mocks/workShelf). Nothing is uploaded; `session` results say so. Replaced by a server adapter in app/services.ts.
import type {ComposeRepository} from '../pages/compose/services/composeRepository';
import {newId} from '../shared/creation/ids';
import {workSession} from '../shared/creation/workSession';
import {exampleArrangement} from '../shared/creation/exampleWork';
import {workShelf} from './workShelf';

export const mockComposeRepository:ComposeRepository={
 // The current work of this visit; with none, the same example 万物声场 shows.
 async load(){
  const arrangement=workSession.current()??exampleArrangement(newId('work'),new Date());
  return {arrangement,settings:workSession.settings(),shelved:workShelf.get(arrangement.id),shelfCount:workShelf.list().length};
 },
 async saveArrangement(arrangement){return workSession.save(arrangement)?{status:'session'}:{status:'failed'};},
 async saveSettings(settings){return workSession.saveSettings(settings)?{status:'session'}:{status:'failed'};},
 async saveWork(work){return workShelf.put(work)?{status:'session'}:{status:'failed'};},
 async share(){return {status:'unavailable',reason:'needs-account'};},
 async startNew(){workSession.reset();},
};
