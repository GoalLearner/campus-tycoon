import type { DayPeriod } from './daylight';

/**
 * Life and sound (DESIGN.md section 33): which small scenes are on the map,
 * how much things move, and how loud each part of the soundscape is.
 *
 * All of it is for show. Nothing here is saved, nothing here changes a
 * number, and nothing here runs while the game is closed. The hour comes from
 * the player's own clock and is only ever seen. The season and the weekday
 * come from the date in the game. The weather comes from the calendar layer
 * when it is built: until then it is always clear, and everything here
 * already answers to it.
 *
 * These are plain sums with no map and no audio in them, so they are tested
 * as they are (tests/life.test.ts). The map and the sound engine only do
 * what these say.
 */

export type Season = 'fall' | 'winter' | 'spring' | 'summer';
/** Set by the calendar layer when weather exists. Until then the sky is clear. */
export type Weather = 'clear' | 'rain' | 'snow';

/** The season of a month of the game's own date: September to November is fall. */
export function seasonOf(month: number): Season {
  if (month >= 9 && month <= 11) return 'fall';
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  return 'summer';
}

/**
 * True in the two weeks after each semester begins, when every club sets out
 * a table: from the first day of fall, 20 August, to 5 September, and from 15
 * to 31 January.
 */
export function clubFair(month: number, day: number): boolean {
  return (month === 8 && day >= 20) || (month === 9 && day <= 5) || (month === 1 && day >= 15);
}

// ---------------------------------------------------------------- effects --

export type Effects = 'full' | 'reduced';
const EFFECTS_KEY = 'campus-tycoon.effects';
let effects: Effects | null = null;

/** The Reduce effects setting: full, or reduced for an older phone or a player who wants a still map. */
export function effectsSetting(): Effects {
  if (effects === null) {
    effects = 'full';
    try {
      if (localStorage.getItem(EFFECTS_KEY) === 'reduced') effects = 'reduced';
    } catch {
      // Storage is blocked: full effects, until the page closes.
    }
  }
  return effects;
}

export function setEffectsSetting(value: Effects): void {
  effects = value;
  try {
    localStorage.setItem(EFFECTS_KEY, value);
  } catch {
    // Private browsing: the choice lasts until the page closes.
  }
}

// ----------------------------------------------------------------- scenes --

export interface LifeFacts {
  period: DayPeriod;
  /** Saturday or Sunday in the game's calendar. */
  weekend: boolean;
  /** The month and the day of the game's own date. */
  month: number;
  day: number;
  /** True while a semester is in session, from the game's own calendar: false in the summer break. */
  term: boolean;
  weather: Weather;
  students: number;
  /** True with Reduce effects on. */
  reduced: boolean;
  /** The share of students on campus, from the calendar: a quarter in a break, fewer in the summer term. 1 when left out. */
  presence?: number;
  /** True in midterm and finals weeks: more study groups, and no games on the quads. */
  exams?: boolean;
  /** True from an hour before a home game's kickoff to its final whistle. */
  gameDay?: boolean;
}

export interface Scenes {
  /** The share of picnic tables by lecture halls and libraries with a study group at them. */
  studyGroups: number;
  /** Club tables set out on lawns: a tent, a table, a sign board and two people at each. */
  clubTables: number;
  /** Rings of friends on quads big enough for one, each a handful of people keeping a ball in the air. */
  pickupGames: number;
  /** Picnic rugs on lawns beside a quad or a pond, each with a basket and two friends. */
  picnics: number;
  /** Someone playing by the coffee stand. */
  busker: boolean;
  /** Sprinklers on the lawns. */
  sprinklers: boolean;
  /** Ripples on ponds and fountains. */
  ripples: boolean;
  /** How much trees and pennants sway, from 0 for still to 1. */
  wind: number;
  /** The share of dorm and lecture hall windows that are lit, from 0 to 1. */
  windows: number;
  /** Tailgates in the car parks before and during a home game: a parasol, a table and a few fans at each. */
  tailgates: number;
  /** The marching band, formed up by the stadium on a home game day. */
  band: boolean;
}

/** How much of the day's studying outdoors is going on. */
const STUDY: Record<DayPeriod, number> = { morning: 0.2, afternoon: 0.55, evening: 0.6, night: 0 };
/** Wind by season: fall is breezy, summer is still. */
const WIND: Record<Season, number> = { fall: 1, winter: 0.8, spring: 0.6, summer: 0.35 };
/**
 * Buildings with their windows lit, by the part of the day: the evening most, the small hours less, and
 * the early risers before dawn. They only show while the street lamps are on, so by day this is not seen.
 */
const WINDOWS: Record<DayPeriod, number> = { morning: 0.3, afternoon: 0, evening: 0.75, night: 0.4 };
/** A club table for this many students, and the most there are on an ordinary day and in a club fair. */
const STUDENTS_PER_CLUB_TABLE = 600;
const MAX_CLUB_TABLES = 2;
const MAX_FAIR_TABLES = 5;
/** A pickup game for this many students, and the most at once. */
const STUDENTS_PER_PICKUP = 500;
const MAX_PICKUP = 3;
/** One tailgate, and another for every this many students, up to the most at once. */
const STUDENTS_PER_TAILGATE = 900;
const MAX_TAILGATES = 4;
/** A picnic rug for this many students, and the most at once. */
const STUDENTS_PER_PICNIC = 400;
const MAX_PICNICS = 4;

/**
 * Which scenes are on, for a time of day, a date and a campus. The same facts
 * always give the same scenes: nothing is rolled.
 */
export function scenesFor(facts: LifeFacts): Scenes {
  const season = seasonOf(facts.month);
  const fine = facts.weather === 'clear';
  const day = facts.period === 'morning' || facts.period === 'afternoon';
  const out = facts.period !== 'night';
  // On a break most students have gone home: what is left is quiet. In the summer term a few stay.
  const here = facts.presence ?? 1;
  const anyone = facts.students > 0 && here > 0;
  const quiet = here < 0.5;
  const exams = facts.exams === true;
  const gameDay = facts.gameDay === true && facts.students > 0;
  // The summer break is between terms: few students are about, and no clubs meet.
  const term = facts.term;

  // Study groups sit out in fine weather, less on a weekend and little in the cold.
  // In an exam week nearly every table has a group at it, whatever the season. On a break hardly any.
  const study = !anyone || !fine ? 0 : exams ? Math.min(0.95, STUDY[facts.period] * 1.6) : STUDY[facts.period] * (facts.weekend ? 0.5 : 1) * (season === 'winter' ? 0.3 : 1) * (term ? 1 : 0.4) * (quiet ? 0.3 : 1);

  // Club tables: every weekday in the two weeks a semester begins, and on every other day of the month for
  // the rest of the term. Fewer in the morning, none in the evening.
  let clubs = 0;
  if (anyone && fine && term && !facts.weekend && day && !quiet && !exams) {
    const fair = clubFair(facts.month, facts.day);
    const meets = fair || facts.day % 2 === 0;
    const most = fair ? MAX_FAIR_TABLES : MAX_CLUB_TABLES;
    if (meets) clubs = Math.min(most, Math.max(1, Math.round(facts.students / STUDENTS_PER_CLUB_TABLE)));
    if (facts.period === 'morning') clubs = Math.ceil(clubs / 2);
  }

  // Pickup games: afternoons and evenings in fine weather, more at a weekend, few in winter.
  let pickup = 0;
  if (anyone && fine && !exams && (facts.period === 'afternoon' || facts.period === 'evening')) {
    const keen = (facts.weekend ? 1.5 : 1) * (season === 'winter' ? 0.34 : 1) * (quiet ? 0.34 : 1);
    pickup = Math.min(MAX_PICKUP, Math.round(Math.max(facts.students >= 60 ? 1 : 0, facts.students / STUDENTS_PER_PICKUP) * keen));
  }

  // Picnic rugs on a sunny lawn: the afternoon most, a few in the evening, more at a weekend, none in winter.
  let picnics = 0;
  if (anyone && fine && season !== 'winter' && (facts.period === 'afternoon' || facts.period === 'evening')) {
    const keen = (facts.weekend ? 1.5 : 1) * (facts.period === 'evening' ? 0.5 : 1) * (quiet ? 0.34 : 1);
    picnics = Math.min(MAX_PICNICS, Math.round(Math.max(facts.students >= 60 ? 1 : 0, facts.students / STUDENTS_PER_PICNIC) * keen));
  }

  // A busker by the coffee stand in the afternoon and evening of two days in three, when it is fine and not winter.
  const busker = anyone && fine && !quiet && season !== 'winter' && (facts.period === 'afternoon' || facts.period === 'evening') && facts.day % 3 !== 0;

  return {
    studyGroups: facts.reduced ? Math.min(study, 0.3) : study,
    clubTables: clubs,
    pickupGames: facts.reduced ? Math.min(1, pickup) : pickup,
    picnics: facts.reduced ? Math.min(1, picnics) : picnics,
    busker,
    // Sprinklers run on fine mornings, outside winter. A still map has none.
    sprinklers: !facts.reduced && fine && facts.period === 'morning' && season !== 'winter',
    ripples: !facts.reduced && out,
    wind: facts.reduced ? 0 : WIND[season] * (facts.weather === 'rain' ? 1.3 : 1),
    // With most students away, most windows are dark.
    windows: WINDOWS[facts.period] * (quiet ? 0.35 : 1),
    // A home game: tailgates in the car parks in any weather, more of them at a bigger school, and the band by the stadium.
    tailgates: gameDay ? Math.min(MAX_TAILGATES, 1 + Math.floor(facts.students / STUDENTS_PER_TAILGATE)) : 0,
    band: gameDay,
  };
}

// ------------------------------------------------------------------ sound --

export interface SoundFacts {
  /** People on screen now: students, staff, visitors and neighbours. */
  walkersInView: number;
  /** Cars, buses and trucks on screen now. */
  vehiclesInView: number;
  /** True while the busker by the coffee stand is on screen. */
  buskerInView: boolean;
  /** A home game is being played: 1 with the stadium on screen, a little when it is somewhere off it, 0 with no game. Left out, 0. */
  stadium?: number;
  /** How far in the map is zoomed: 1 is the size the game opens at. */
  zoom: number;
  period: DayPeriod;
  /** The month of the game's own date. */
  month: number;
  weather: Weather;
  /** True while the page is hidden or the app is in the background: everything is silent. */
  hidden: boolean;
}

/** How loud each part of the soundscape is, from 0 to 1, before the player's own volume. */
export interface SoundMix {
  /** Footsteps and chatter. */
  crowd: number;
  traffic: number;
  birds: number;
  crickets: number;
  rain: number;
  /** The busker's tune, heard only while they are on screen. */
  busker: number;
  /** The stadium crowd during a home game: loudest with the stadium on screen. */
  stadium: number;
}

export const SILENT: SoundMix = { crowd: 0, traffic: 0, birds: 0, crickets: 0, rain: 0, busker: 0, stadium: 0 };
/** People on screen at which the crowd is as loud as it gets, and vehicles for traffic. */
export const CROWD_FULL_AT = 70;
export const TRAFFIC_FULL_AT = 10;
const BIRDS: Record<DayPeriod, number> = { morning: 1, afternoon: 0.6, evening: 0.25, night: 0 };
const CRICKETS: Record<DayPeriod, number> = { morning: 0, afternoon: 0, evening: 0.5, night: 1 };
const BIRD_SEASON: Record<Season, number> = { fall: 0.7, winter: 0.3, spring: 1, summer: 0.9 };
const CRICKET_SEASON: Record<Season, number> = { fall: 0.6, winter: 0, spring: 0.6, summer: 1 };

/** Near things are louder: zoomed out to a third the map is quiet, and at the opening zoom and closer it is full. */
function nearness(zoom: number): number {
  return Math.max(0.3, Math.min(1, zoom));
}

/**
 * The soundscape for what is on screen: footsteps and chatter with the crowd,
 * traffic with the cars, birds by day, crickets at night, rain when the
 * calendar layer says it is raining. Zooming out makes all of it quieter, and
 * a hidden page is silent.
 */
export function soundMix(facts: SoundFacts): SoundMix {
  if (facts.hidden) return SILENT;
  const near = nearness(facts.zoom);
  const season = seasonOf(facts.month);
  const wet = facts.weather === 'rain';
  const snow = facts.weather === 'snow';
  return {
    crowd: Math.min(1, Math.max(0, facts.walkersInView) / CROWD_FULL_AT) * near,
    traffic: Math.min(1, Math.max(0, facts.vehiclesInView) / TRAFFIC_FULL_AT) * near,
    // The sky does not care how far in the map is zoomed, only a little.
    birds: wet || snow ? 0 : BIRDS[facts.period] * BIRD_SEASON[season] * (0.6 + 0.4 * near),
    crickets: snow ? 0 : CRICKETS[facts.period] * CRICKET_SEASON[season] * (wet ? 0.3 : 1) * (0.6 + 0.4 * near),
    rain: wet ? 0.9 : 0,
    busker: facts.buskerInView ? near : 0,
    stadium: Math.max(0, Math.min(1, facts.stadium ?? 0)) * near,
  };
}

/** True when the bell should chime: the hour of the player's clock has just changed while the game is on screen. */
export function bellDue(lastHour: number | null, hour: number, hidden: boolean): boolean {
  return !hidden && lastHour !== null && Math.floor(hour) !== Math.floor(lastHour);
}

// ---------------------------------------------------------------- volumes --

/** Both start low. The player sets each from 0 to 1 in the Menu. */
export const DEFAULT_SOUND_VOLUME = 0.4;
export const DEFAULT_MUSIC_VOLUME = 0.25;
const SOUND_KEY = 'campus-tycoon.sound';
const MUSIC_KEY = 'campus-tycoon.music';
const volumes: { sound: number | null; music: number | null } = { sound: null, music: null };

function readVolume(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    const value = stored === null ? NaN : Number(stored);
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  } catch {
    // Storage is blocked: the default, until the page closes.
  }
  return fallback;
}

export function soundVolume(): number {
  if (volumes.sound === null) volumes.sound = readVolume(SOUND_KEY, DEFAULT_SOUND_VOLUME);
  return volumes.sound;
}

export function musicVolume(): number {
  if (volumes.music === null) volumes.music = readVolume(MUSIC_KEY, DEFAULT_MUSIC_VOLUME);
  return volumes.music;
}

function keepVolume(key: string, value: number): number {
  const volume = Math.max(0, Math.min(1, value));
  try {
    localStorage.setItem(key, String(volume));
  } catch {
    // Private browsing: the choice lasts until the page closes.
  }
  return volume;
}

export function setSoundVolume(value: number): void {
  volumes.sound = keepVolume(SOUND_KEY, value);
}

export function setMusicVolume(value: number): void {
  volumes.music = keepVolume(MUSIC_KEY, value);
}

// ------------------------------------------------------------------ mute --

const MUTE_KEY = 'campus-tycoon.muted';
let mutedNow: boolean | null = null;

/** True while the player has muted the game. Remembered between visits, apart from the saved game. */
export function muted(): boolean {
  if (mutedNow === null) {
    mutedNow = false;
    try {
      mutedNow = localStorage.getItem(MUTE_KEY) === 'yes';
    } catch {
      // Storage is blocked: not muted, until the page closes.
    }
  }
  return mutedNow;
}

/**
 * Mute or unmute. Muting silences sound and music together and leaves the
 * two volumes exactly as the player set them, so unmuting brings both back.
 */
export function setMuted(value: boolean): void {
  mutedNow = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? 'yes' : 'no');
  } catch {
    // Private browsing: the choice lasts until the page closes.
  }
}

/** How loud sound and music actually play: the player's volumes, or nothing while muted. */
export function heardSound(): number {
  return muted() ? 0 : soundVolume();
}

export function heardMusic(): number {
  return muted() ? 0 : musicVolume();
}
