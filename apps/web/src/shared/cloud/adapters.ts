import type {ComposeRepository} from '../../pages/compose/services/composeRepository';
import type {SoundWorldRepository} from '../../pages/sound-world/services/soundWorldRepository';
import type {ShelfRepository} from '../../pages/works/services/shelfRepository';
import type {SoundLibraryService} from '../creation/soundLibrary';
import {workEtag} from '@wanwu-v2/contracts/cloud';
import {workSession} from '../creation/workSession';
import {CloudShelf} from './cloudShelf';
import {cloudError} from './cloudTypes';
import type {CloudWorkspace} from './cloudWorkspace';
import {libraryEntries} from './libraryEntries';

export function cloudAdapters(workspace:CloudWorkspace,local:{composeRepository:ComposeRepository;soundWorldRepository:SoundWorldRepository;shelfRepository:ShelfRepository;soundLibrary:SoundLibraryService}){
 const shelf=new CloudShelf(workspace,local.shelfRepository);
 const soundWorldRepository:SoundWorldRepository={...local.soundWorldRepository,
  async scope(scope){
   if(scope==='example'||!workspace.state.accountId)return local.soundWorldRepository.scope(scope);
   try{const items=await libraryEntries(workspace.api,'sound-units',scope==='mine'?'mine':'teachers');
    return {status:'ready',units:items.flatMap(entry=>entry.unit?[entry.unit]:[])};
   }catch(error){workspace.update({phase:'error',message:cloudError(error)});return {status:'unavailable',reason:'needs-account'};}
  },
 };
 const composeRepository:ComposeRepository={...local.composeRepository,
  async load(){const current=await local.composeRepository.load();if(!workspace.state.accountId)return current;await shelf.refresh();
   return {...current,shelved:shelf.list().find(work=>work.id===current.arrangement.id)??null,shelfCount:shelf.list().length};},
  async saveWork(work){if(!workspace.state.accountId)return local.composeRepository.saveWork(work);
   try{const saved=await workspace.formal(work);await shelf.refresh();return {status:'saved',version:workEtag(saved.id,saved.revision)};}
   catch{return {status:'failed'};}
  },
  async share(){if(!workspace.state.accountId)return {status:'unavailable',reason:'needs-account'};workspace.update({dialog:'share'});return {status:'confirmation-required'};},
  async startNew(){if(workspace.state.accountId&&workspace.record)await workspace.freshDraft();else{workSession.reset();workspace.record=null;workspace.update({epoch:workspace.state.epoch+1,workId:null});}},
 };
 const soundLibrary:SoundLibraryService={async list(){
  const bundled=await local.soundLibrary.list();if(!workspace.state.accountId)return bundled;
  try{const [mine,shared]=await Promise.all((['mine','teachers'] as const).map(scope=>libraryEntries(workspace.api,'sources',scope)));
   return {...bundled,origin:'server',entries:[...mine!.map(item=>({scope:'mine' as const,source:item.source.source,url:item.source.playback!.url})),
    ...shared!.map(item=>({scope:'teachers' as const,source:item.source.source,url:item.source.playback!.url}))]};
  }catch(error){workspace.update({phase:'error',message:cloudError(error)});return bundled;}
 }};
 return {composeRepository,soundWorldRepository,shelfRepository:shelf,soundLibrary};
}
