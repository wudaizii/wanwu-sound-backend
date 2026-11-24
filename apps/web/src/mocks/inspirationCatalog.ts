// Mock textbook catalogue: the made-up example cards in mocks/exampleTracks (validated like real ones), labelled 示例.
import {isTextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {InspirationCatalog} from '../shared/inspiration/catalog';
import {exampleTracks} from './exampleTracks';

export const mockInspirationCatalog:InspirationCatalog={
 async list(){return {origin:'example',entries:exampleTracks.filter(isTextbookTrack)};},
};
