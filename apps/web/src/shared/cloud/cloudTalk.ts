import type {TalkPolisher} from '../talk/polisher';
import type {CloudWorkspace} from './cloudWorkspace';
export function cloudTalkPolisher(workspace:CloudWorkspace):TalkPolisher{
 return {
  subscribe:workspace.subscribe,
  get open(){return workspace.state.languageAvailable&&!!workspace.insights.basis();},
  get basis(){return workspace.insights.basis();},
  get revisionKey(){return workspace.insights.key;},
  timeoutMs:12000,
  workTalk:(_brief,signal)=>workspace.insights.workTalk(signal),
  // The local baseline's textbook brief is older than the deployed API contract; keep its existing corpus intact.
  async textbookTalk(){return null;},
 };
}
