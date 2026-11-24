// The one place that chooses the implementation behind every port the pages use. Today: the mocks (mocks/) and the
// honest offline implementations. To connect the server, put the server adapters here and delete mocks/ — no page
// changes. Pages take these as their default implementations; tests pass their own.
import type {ComposeRepository} from '../pages/compose/services/composeRepository';
import {presetHintProvider} from '../pages/sound-birth/services/soundHints';
import type {SoundHintProvider} from '../pages/sound-birth/services/soundHints';
import {offlineMoodInterpreter} from '../pages/sound-world/services/moodInterpreter';
import type {MoodInterpreter} from '../pages/sound-world/services/moodInterpreter';
import type {SoundWorldRepository} from '../pages/sound-world/services/soundWorldRepository';
import type {ShelfRepository} from '../pages/works/services/shelfRepository';
import {offlineBackgroundGenerator} from '../shared/background/generator';
import type {BackgroundGenerator} from '../shared/background/generator';
import type {BackgroundLibrary} from '../shared/background/library';
import type {InspirationCatalog} from '../shared/inspiration/catalog';
import {offlineTeachingMusicService} from '../shared/inspiration/teachingMusic';
import type {TeachingMusicService} from '../shared/inspiration/teachingMusic';
import {offlineTalkPolisher} from '../shared/talk/polisher';
import {bundledSoundLibrary} from '../shared/creation/soundLibrary';
import type {SoundLibraryService} from '../shared/creation/soundLibrary';
import type {TalkPolisher} from '../shared/talk/polisher';
import {mockServices} from '../mocks';

export type Services={
 soundLibrary:SoundLibraryService;
 soundHints:SoundHintProvider;
 soundWorldRepository:SoundWorldRepository;
 moodInterpreter:MoodInterpreter;
 composeRepository:ComposeRepository;
 shelfRepository:ShelfRepository;
 backgroundLibrary:BackgroundLibrary;
 backgroundGenerator:BackgroundGenerator;
 inspirationCatalog:InspirationCatalog;
 teachingMusic:TeachingMusicService;
 talkPolisher:TalkPolisher;
};

export const services:Services={
 ...mockServices,
 // Offline, and saying so: corpus hints, no model for mood words, AI background, AI rewording and teaching-music
 // analysis not open.
 soundHints:presetHintProvider,
 moodInterpreter:offlineMoodInterpreter,
 backgroundGenerator:offlineBackgroundGenerator,
 talkPolisher:offlineTalkPolisher,
 teachingMusic:offlineTeachingMusicService,
 // Real content, not a mock: the example sounds shipped with the page.
 soundLibrary:bundledSoundLibrary,
};
