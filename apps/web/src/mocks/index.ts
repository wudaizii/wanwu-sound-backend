// Mock data and in-memory stand-ins, in one folder so they can be removed in one go once the server exists.
// Nothing outside this folder imports from it except app/services.ts, which chooses the implementation of every port.
// Not mock (kept in shared/): the library's example sounds and the example field, which are real content for visitors
// without an account, and the honest offline implementations (AI not open, preset hints, mood words need a model).
import {mockBackgroundLibrary} from './backgroundLibrary';
import {mockComposeRepository} from './composeRepository';
import {mockInspirationCatalog} from './inspirationCatalog';
import {mockShelfRepository} from './shelfRepository';
import {mockSoundWorldRepository} from './soundWorldRepository';

export const mockServices={
 soundWorldRepository:mockSoundWorldRepository,
 composeRepository:mockComposeRepository,
 shelfRepository:mockShelfRepository,
 backgroundLibrary:mockBackgroundLibrary,
 inspirationCatalog:mockInspirationCatalog,
};
