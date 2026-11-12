import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DayPeriod } from '../src/app/daylight';
import {
  bellDue,
  clubFair,
  CROWD_FULL_AT,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SOUND_VOLUME,
  heardMusic,
  heardSound,
  muted,
  setMuted,
  musicVolume,
  scenesFor,
  seasonOf,
  setMusicVolume,
  setSoundVolume,
  SILENT,
  soundMix,
  soundVolume,
  TRAFFIC_FULL_AT,
  type LifeFacts,
  type SoundFacts,
} from '../src/app/life';
import { advance, newGame, SAVE_VERSION, serialize } from '../src/sim';

/**
 * Life and sound (DESIGN.md section 33). The rules for which small scenes are
 * on the map and how loud each part of the soundscape is are plain sums, so
 * they are tested as they are. The map and the sound engine only do what
 * these say, and none of it reaches the saved game.
 */

const PERIODS: DayPeriod[] = ['morning', 'afternoon', 'evening', 'night'];

/** A fine Wednesday afternoon in October on a campus of 1,200. */
const life = (over: Partial<LifeFacts> = {}): LifeFacts => ({
  period: 'afternoon',
  weekend: false,
  month: 10,
  day: 14,
  term: true,
  weather: 'clear',
  students: 1200,
  reduced: false,
  ...over,
});

/** A busy view at the opening zoom on a spring afternoon. */
const heard = (over: Partial<SoundFacts> = {}): SoundFacts => ({
  walkersInView: 35,
  vehiclesInView: 5,
  buskerInView: false,
  zoom: 1,
  period: 'afternoon',
  month: 4,
  weather: 'clear',
  hidden: false,
  ...over,
});

describe('the season and the calendar of small scenes', () => {
  it('names the season of each month of the game year', () => {
    expect([9, 10, 11].map(seasonOf)).toEqual(['fall', 'fall', 'fall']);
    expect([12, 1, 2].map(seasonOf)).toEqual(['winter', 'winter', 'winter']);
    expect([3, 4, 5].map(seasonOf)).toEqual(['spring', 'spring', 'spring']);
    expect([6, 7, 8].map(seasonOf)).toEqual(['summer', 'summer', 'summer']);
  });

  it('holds a club fair for the two weeks after each semester begins', () => {
    expect(clubFair(8, 20)).toBe(true);
    expect(clubFair(8, 19)).toBe(false);
    expect(clubFair(9, 5)).toBe(true);
    expect(clubFair(9, 6)).toBe(false);
    expect(clubFair(1, 15)).toBe(true);
    expect(clubFair(1, 14)).toBe(false);
    expect(clubFair(4, 20)).toBe(false);
  });
});

describe('which small scenes are on the map', () => {
  it('gives the same scenes for the same facts, every time', () => {
    for (const period of PERIODS) expect(scenesFor(life({ period }))).toEqual(scenesFor(life({ period })));
  });

  it('a fine weekday afternoon in term has study groups, a club table, a game, a picnic and a busker', () => {
    const scenes = scenesFor(life());
    expect(scenes.studyGroups).toBeGreaterThan(0.3);
    expect(scenes.clubTables).toBeGreaterThanOrEqual(1);
    expect(scenes.pickupGames).toBeGreaterThanOrEqual(1);
    expect(scenes.picnics).toBeGreaterThanOrEqual(1);
    expect(scenes.busker).toBe(true);
    expect(scenes.ripples).toBe(true);
    expect(scenes.sprinklers).toBe(false);
    expect(scenes.windows).toBe(0);
  });

  it('night is quiet: nobody is out on the lawns, and windows are lit', () => {
    const scenes = scenesFor(life({ period: 'night' }));
    expect(scenes.studyGroups).toBe(0);
    expect(scenes.clubTables).toBe(0);
    expect(scenes.pickupGames).toBe(0);
    expect(scenes.picnics).toBe(0);
    expect(scenes.busker).toBe(false);
    expect(scenes.sprinklers).toBe(false);
    expect(scenes.windows).toBeGreaterThan(0);
    // More windows are lit in the evening than in the small hours.
    expect(scenesFor(life({ period: 'evening' })).windows).toBeGreaterThan(scenes.windows);
    expect(scenesFor(life({ period: 'afternoon' })).windows).toBe(0);
  });

  it('club tables are a weekday, daytime, term-time thing', () => {
    expect(scenesFor(life({ weekend: true })).clubTables).toBe(0);
    expect(scenesFor(life({ period: 'evening' })).clubTables).toBe(0);
    expect(scenesFor(life({ term: false, month: 7 })).clubTables).toBe(0);
    // On an ordinary week a club meets every other day.
    expect(scenesFor(life({ day: 14 })).clubTables).toBeGreaterThan(0);
    expect(scenesFor(life({ day: 15 })).clubTables).toBe(0);
    // Fewer are out in the morning than in the afternoon.
    const big = { students: 6000, month: 8, day: 24 };
    expect(scenesFor(life({ ...big, period: 'morning' })).clubTables).toBeLessThan(scenesFor(life(big)).clubTables);
  });

  it('a club fair fills the lawns: every weekday, and more tables than any ordinary day', () => {
    // The first day of the fall semester is in August, which is still summer by the month but is in term.
    const fair = scenesFor(life({ month: 8, day: 21, students: 6000 }));
    const ordinary = scenesFor(life({ month: 10, day: 14, students: 6000 }));
    expect(fair.clubTables).toBeGreaterThan(ordinary.clubTables);
    expect(fair.clubTables).toBeLessThanOrEqual(5);
    // An odd day, when no club would meet in an ordinary week.
    expect(scenesFor(life({ month: 1, day: 17 })).clubTables).toBeGreaterThan(0);
  });

  it('a bigger campus has more going on, up to a ceiling', () => {
    const small = scenesFor(life({ students: 200 }));
    const large = scenesFor(life({ students: 3000, weekend: true }));
    const huge = scenesFor(life({ students: 60000, weekend: true }));
    expect(large.pickupGames).toBeGreaterThan(small.pickupGames);
    expect(large.picnics).toBeGreaterThan(small.picnics);
    expect(huge.pickupGames).toBeLessThanOrEqual(3);
    expect(huge.picnics).toBeLessThanOrEqual(4);
    expect(scenesFor(life({ students: 60000, month: 8, day: 24 })).clubTables).toBeLessThanOrEqual(5);
  });

  it('a weekend has more games and picnics, and less studying', () => {
    const weekday = scenesFor(life({ students: 800 }));
    const weekend = scenesFor(life({ students: 800, weekend: true }));
    expect(weekend.pickupGames).toBeGreaterThanOrEqual(weekday.pickupGames);
    expect(weekend.picnics).toBeGreaterThan(weekday.picnics);
    expect(weekend.studyGroups).toBeLessThan(weekday.studyGroups);
  });

  it('winter keeps people indoors: no picnics, no busker, no sprinklers, and little studying outside', () => {
    const winter = scenesFor(life({ month: 1, day: 8 }));
    expect(winter.picnics).toBe(0);
    expect(winter.busker).toBe(false);
    expect(winter.studyGroups).toBeLessThan(scenesFor(life()).studyGroups);
    expect(scenesFor(life({ month: 1, period: 'morning' })).sprinklers).toBe(false);
  });

  it('sprinklers run on fine mornings', () => {
    expect(scenesFor(life({ period: 'morning' })).sprinklers).toBe(true);
    expect(scenesFor(life({ period: 'afternoon' })).sprinklers).toBe(false);
    expect(scenesFor(life({ period: 'morning', weather: 'rain' })).sprinklers).toBe(false);
  });

  it('the busker plays two days in three, in the afternoon and evening', () => {
    expect(scenesFor(life({ day: 14 })).busker).toBe(true);
    expect(scenesFor(life({ day: 15 })).busker).toBe(false);
    expect(scenesFor(life({ day: 14, period: 'evening' })).busker).toBe(true);
    expect(scenesFor(life({ day: 14, period: 'morning' })).busker).toBe(false);
  });

  it('rain clears the lawns, which is the hook the calendar layer will use', () => {
    for (const period of PERIODS) {
      const wet = scenesFor(life({ period, weather: 'rain' }));
      expect(wet.studyGroups).toBe(0);
      expect(wet.clubTables).toBe(0);
      expect(wet.pickupGames).toBe(0);
      expect(wet.picnics).toBe(0);
      expect(wet.busker).toBe(false);
      expect(wet.sprinklers).toBe(false);
    }
    // The trees move more in the rain, and snow clears the lawns too.
    expect(scenesFor(life({ weather: 'rain' })).wind).toBeGreaterThan(scenesFor(life()).wind);
    expect(scenesFor(life({ weather: 'snow' })).picnics).toBe(0);
  });

  it('an empty campus has nobody on its lawns', () => {
    for (const period of PERIODS) {
      const empty = scenesFor(life({ period, students: 0 }));
      expect(empty.studyGroups).toBe(0);
      expect(empty.clubTables).toBe(0);
      expect(empty.pickupGames).toBe(0);
      expect(empty.picnics).toBe(0);
      expect(empty.busker).toBe(false);
    }
  });

  it('the summer break is quiet even on a fine day', () => {
    const summer = scenesFor(life({ term: false, month: 7, day: 14 }));
    expect(summer.clubTables).toBe(0);
    expect(summer.studyGroups).toBeLessThan(scenesFor(life()).studyGroups);
  });

  it('fall is the breeziest season and summer the stillest', () => {
    const wind = (month: number): number => scenesFor(life({ month })).wind;
    expect(wind(10)).toBeGreaterThan(wind(4));
    expect(wind(4)).toBeGreaterThan(wind(7));
  });

  it('Reduce effects stills the map and thins the scenes', () => {
    for (const period of PERIODS) {
      const still = scenesFor(life({ period, reduced: true, students: 6000, weekend: true }));
      expect(still.wind).toBe(0);
      expect(still.ripples).toBe(false);
      expect(still.sprinklers).toBe(false);
      expect(still.pickupGames).toBeLessThanOrEqual(1);
      expect(still.picnics).toBeLessThanOrEqual(1);
      expect(still.studyGroups).toBeLessThanOrEqual(0.3);
    }
  });
});

describe('the soundscape follows what is on screen', () => {
  it('a hidden page is silent, whatever is on it', () => {
    expect(soundMix(heard({ hidden: true, walkersInView: 200, vehiclesInView: 30, weather: 'rain', buskerInView: true }))).toEqual(SILENT);
  });

  it('footsteps and chatter grow with the people in view, up to a full crowd', () => {
    const few = soundMix(heard({ walkersInView: 5 })).crowd;
    const many = soundMix(heard({ walkersInView: 40 })).crowd;
    expect(soundMix(heard({ walkersInView: 0 })).crowd).toBe(0);
    expect(many).toBeGreaterThan(few);
    expect(soundMix(heard({ walkersInView: CROWD_FULL_AT })).crowd).toBe(1);
    expect(soundMix(heard({ walkersInView: CROWD_FULL_AT * 5 })).crowd).toBe(1);
  });

  it('traffic is heard only with vehicles in view', () => {
    expect(soundMix(heard({ vehiclesInView: 0 })).traffic).toBe(0);
    expect(soundMix(heard({ vehiclesInView: 6 })).traffic).toBeGreaterThan(soundMix(heard({ vehiclesInView: 2 })).traffic);
    expect(soundMix(heard({ vehiclesInView: TRAFFIC_FULL_AT * 3 })).traffic).toBe(1);
  });

  it('zooming out makes the campus quieter, and never louder than at the opening zoom', () => {
    const near = soundMix(heard({ zoom: 1 }));
    const far = soundMix(heard({ zoom: 0.4 }));
    const closer = soundMix(heard({ zoom: 2.5 }));
    expect(far.crowd).toBeLessThan(near.crowd);
    expect(far.traffic).toBeLessThan(near.traffic);
    expect(far.birds).toBeLessThan(near.birds);
    expect(far.crowd).toBeGreaterThan(0);
    expect(closer).toEqual(near);
  });

  it('birds sing by day and crickets by night', () => {
    const morning = soundMix(heard({ period: 'morning' }));
    const night = soundMix(heard({ period: 'night', month: 7 }));
    expect(morning.birds).toBeGreaterThan(soundMix(heard({ period: 'afternoon' })).birds);
    expect(morning.crickets).toBe(0);
    expect(night.birds).toBe(0);
    expect(night.crickets).toBeGreaterThan(0.5);
    // Winter nights have no crickets, and winter days few birds.
    expect(soundMix(heard({ period: 'night', month: 1 })).crickets).toBe(0);
    expect(soundMix(heard({ period: 'morning', month: 1 })).birds).toBeLessThan(morning.birds);
  });

  it('rain is heard when it rains, and the birds stop', () => {
    const wet = soundMix(heard({ weather: 'rain', period: 'morning' }));
    expect(wet.rain).toBeGreaterThan(0);
    expect(wet.birds).toBe(0);
    expect(soundMix(heard()).rain).toBe(0);
    expect(soundMix(heard({ weather: 'snow' })).rain).toBe(0);
  });

  it("the busker's tune is heard only while they are on screen", () => {
    expect(soundMix(heard()).busker).toBe(0);
    expect(soundMix(heard({ buskerInView: true })).busker).toBeGreaterThan(0);
    expect(soundMix(heard({ buskerInView: true, zoom: 0.4 })).busker).toBeLessThan(soundMix(heard({ buskerInView: true })).busker);
  });

  it('every level is between nought and one', () => {
    for (const period of PERIODS) {
      for (const weather of ['clear', 'rain', 'snow'] as const) {
        for (const month of [1, 4, 7, 10]) {
          const mix = soundMix(heard({ period, weather, month, walkersInView: 500, vehiclesInView: 80, buskerInView: true, zoom: 3 }));
          for (const level of Object.values(mix)) {
            expect(level).toBeGreaterThanOrEqual(0);
            expect(level).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('the bell chimes when the hour changes, and never on a hidden page or at the start', () => {
    expect(bellDue(13, 14, false)).toBe(true);
    expect(bellDue(23, 0, false)).toBe(true);
    expect(bellDue(14, 14, false)).toBe(false);
    expect(bellDue(13, 14, true)).toBe(false);
    expect(bellDue(null, 14, false)).toBe(false);
  });

  it('both volumes start low, music the lower, and each stays between off and full', () => {
    expect(DEFAULT_SOUND_VOLUME).toBeLessThanOrEqual(0.5);
    expect(DEFAULT_MUSIC_VOLUME).toBeLessThan(DEFAULT_SOUND_VOLUME);
    expect(soundVolume()).toBe(DEFAULT_SOUND_VOLUME);
    expect(musicVolume()).toBe(DEFAULT_MUSIC_VOLUME);
    setSoundVolume(3);
    setMusicVolume(-1);
    expect(soundVolume()).toBe(1);
    expect(musicVolume()).toBe(0);
    setSoundVolume(DEFAULT_SOUND_VOLUME);
    setMusicVolume(DEFAULT_MUSIC_VOLUME);
  });
});

describe('the Mute button', () => {
  it('silences sound and music together, leaves both volumes as they were set, and gives them back', () => {
    setSoundVolume(0.65);
    setMusicVolume(0.3);
    expect(muted()).toBe(false);
    expect(heardSound()).toBe(0.65);
    expect(heardMusic()).toBe(0.3);
    setMuted(true);
    expect(muted()).toBe(true);
    expect(heardSound()).toBe(0);
    expect(heardMusic()).toBe(0);
    // The stored volumes are untouched, and a slider moved while muted is kept too.
    expect(soundVolume()).toBe(0.65);
    expect(musicVolume()).toBe(0.3);
    setMusicVolume(0.5);
    expect(heardMusic()).toBe(0);
    setMuted(false);
    expect(heardSound()).toBe(0.65);
    expect(heardMusic()).toBe(0.5);
    setSoundVolume(DEFAULT_SOUND_VOLUME);
    setMusicVolume(DEFAULT_MUSIC_VOLUME);
  });

  it('is kept on the device, apart from the saved game, and the engine plays what is heard', () => {
    const rules = readFileSync(join(__dirname, '..', 'src/app/life.ts'), 'utf8');
    expect(rules).toContain("'campus-tycoon.muted'");
    const engine = readFileSync(join(__dirname, '..', 'src/app/sound.ts'), 'utf8');
    expect(engine).toContain('heardSound()');
    expect(engine).toContain('heardMusic()');
    // The engine never reads the raw volumes, so it cannot play while muted.
    expect(engine.includes('soundVolume()')).toBe(false);
    expect(engine.includes('musicVolume()')).toBe(false);
  });
});

describe('life and sound are for show', () => {
  const root = join(__dirname, '..');
  const read = (file: string): string => readFileSync(join(root, file), 'utf8');

  it('asking for scenes and sound never changes the game', () => {
    const now = Date.UTC(2026, 0, 5, 9);
    const state = advance(newGame({ seed: 7, name: 'Larkspur', now }), now, now + 3 * 3_600_000).state;
    const before = serialize(state, 0);
    for (const period of PERIODS) {
      for (const weather of ['clear', 'rain', 'snow'] as const) {
        scenesFor(life({ period, weather }));
        soundMix(heard({ period, weather }));
      }
    }
    expect(serialize(state, 0)).toBe(before);
    // Nothing was added to the saved game for this stop.
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(11);
    for (const word of ['weather', 'sound', 'music', 'windows', 'sprinkler']) expect(before.includes(`"${word}"`), `the save holds "${word}"`).toBe(false);
  });

  it('the layers that draw and play it never reach for anything that changes, advances or saves the game', () => {
    const banned = ['applyAction', 'advance(', 'serialize', 'parseSave', "from '../app/store'", "from '../app/session'", 'state.rng', 'nextRandom'];
    for (const file of ['src/game/Scenes.ts', 'src/game/Ambient.ts', 'src/game/Windows.ts', 'src/app/sound.ts', 'src/app/life.ts']) {
      const source = read(file);
      for (const word of banned) expect(source.includes(word), `${file} uses ${word}`).toBe(false);
    }
    // What is drawn on the map keeps nothing on the device at all.
    for (const file of ['src/game/Scenes.ts', 'src/game/Ambient.ts', 'src/game/Windows.ts', 'src/app/sound.ts']) expect(read(file).includes('localStorage'), `${file} uses localStorage`).toBe(false);
    // The two volumes and Reduce effects are kept on the device, apart from the saved game.
    const rules = read('src/app/life.ts');
    for (const key of ["'campus-tycoon.sound'", "'campus-tycoon.music'", "'campus-tycoon.effects'"]) expect(rules).toContain(key);
    expect(rules.includes("from '../sim'")).toBe(false);
  });

  it('the simulation knows nothing of scenes, sound or the hour of the day', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(join(root, dir))) {
        const path = `${dir}/${name}`;
        if (statSync(join(root, path)).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk('src/sim');
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = read(file);
      for (const word of ['app/life', 'app/sound', 'app/daylight', 'AudioContext', 'new Date(', 'Date.now(']) expect(source.includes(word), `${file} uses ${word}`).toBe(false);
    }
  });

  it('no sound is made before the first tap, and none while the page is hidden', () => {
    const engine = read('src/app/sound.ts');
    // The audio is only ever created inside unlock(), which the first tap calls.
    expect(engine.match(/new Ctor\(\)/g)?.length).toBe(1);
    expect(engine).toContain("window.addEventListener('pointerdown', first");
    // Hidden, or with both volumes at zero: the audio clock is suspended and the one timer is cleared.
    expect(engine).toContain('ctx.suspend()');
    expect(engine).toContain('clearInterval(this.timer)');
    expect(engine).toContain("document.addEventListener('visibilitychange'");
    expect(engine).toContain("window.addEventListener('pagehide'");
    // The only recorded audio is the six small files in public/assets/sound, fetched after the first tap.
    expect(engine.match(/fetch\(/g)?.length).toBe(1);
    expect(engine).toContain('./assets/sound/');
    for (const word of ['.mp3', '.ogg', 'new Audio(', 'http']) expect(engine.includes(word), `sound.ts uses ${word}`).toBe(false);
    for (const name of ['tap', 'built', 'cannot', 'win', 'loss', 'reward']) expect(existsSync(join(root, 'public/assets/sound', `${name}.wav`)), `${name}.wav ships`).toBe(true);
  });
});
