import { tickOfDate, yearLength } from '../calendar';
import type { CalDate } from '../config/academicCalendar';
import {
  CHAPTER_BEDS,
  CHAPTER_NOISE,
  CHAPTER_NOISE_REACH,
  CHAPTER_WORDS,
  FOUNDING_SHARE,
  GAME_DAY_BONUS,
  GIVING_BONUS,
  GIVING_DATE,
  GIVING_MOST,
  GREEK_DRAG_MOST,
  GREEK_DRAG_PER_SHARE,
  GREEK_HOUSES_MOST,
  GREEK_INTEREST,
  GREEK_LETTERS,
  GREEK_LIFE,
  PHILANTHROPY,
  PRANK_CHANCE,
  PRANKS,
  PROBATION_HOURS,
  ROW_BONUS,
  ROW_REACH,
  RUSH_DATE,
  RUSH_MOST,
  SENIOR_SHARE,
} from '../config/greek';
import { PLACED } from '../config/placed';
import { POLICIES, type PolicyEffect, type PolicySpec } from '../config/policies';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../config/time';
import { BANNED_WORDS } from '../config/tone';
import { headCount } from '../format';
import { hashInts } from '../rng';
import { scaleOf } from '../scale';
import { enrollment } from '../selectors';
import { addTimer, cancelTimers } from '../timers';
import type { Chapter, ChapterEvent, ChapterStatus, GameState, Greek, LogEntry, Placed, PlacedType, Week } from '../types';
import { hasDaily } from './daily';
import { noiseAt } from './football';
import { eraOf } from './goals';
import { coverFor } from './incidents';
import { offCampusNow } from './town';

/**
 * Greek Row (DESIGN.md 14.1, adapted and built in section 51). A campus with
 * goals may build chapter houses from the Growth era on. Each house is one
 * chapter, with a name made from the game's own words. Its members are
 * students who lived in dorm beds: they move in at rush week, early each
 * fall, and the seniors among them leave at commencement. A house holds few;
 * its worth is what its members feel, inside Food & fun and named "Greek
 * Row" there, and the retention that follows. It likes the stadium's noise,
 * likes another house beside it, and is noisy itself to the dorms and
 * lecture halls near it. A small drag on the academic rating follows the
 * share of students in chapters. Pranks are friendly, and come to the desk.
 */

export function newGreek(): Greek {
  return { chapters: [], used: [], rush: null, totals: { rushes: 0, pranks: 0, giving: 0 }, news: [] };
}

/** The most events a chapter keeps on its record. */
const EVENTS_KEPT = 12;

function remember(state: GameState, chapter: Chapter, kind: ChapterEvent['kind'], text: string): void {
  chapter.events.push({ tick: state.clock.tick, kind, text });
  if (chapter.events.length > EVENTS_KEPT) chapter.events.splice(0, chapter.events.length - EVENTS_KEPT);
}

export function isChapterHouse(type: PlacedType): boolean {
  return PLACED[type].family === 'chapter';
}

/** The chapters whose houses stand, in the order founded. */
export function chapters(state: GameState): Chapter[] {
  return state.greek?.chapters ?? NONE;
}
const NONE: Chapter[] = [];

export function chapterOf(state: GameState, house: number): Chapter | null {
  return chapters(state).find((chapter) => chapter.house === house) ?? null;
}

export function houseOf(state: GameState, chapter: Chapter): Placed | null {
  return state.map.placed[chapter.house] ?? null;
}

/** True once the campus may build a chapter house: a game with goals, in the Growth era or later. */
export function greekOpen(state: GameState): boolean {
  return hasDaily(state) && !!state.greek && eraOf(state.goals) >= 1;
}

/** Why a chapter house cannot be built now, or null when it can. */
export function cannotBuildChapter(state: GameState): string | null {
  if (!hasDaily(state) || !state.greek) return 'Greek Row comes with a campus that has goals.';
  if (eraOf(state.goals) < 1) return 'Greek Row opens with the Growth era.';
  if (chapters(state).length >= GREEK_HOUSES_MOST) return `${GREEK_HOUSES_MOST} chapters is the most a campus has.`;
  return null;
}

/** Beds in one house, on the campus's own count. */
export function chapterBeds(state: GameState): number {
  return CHAPTER_BEDS * scaleOf(state);
}

/** Students in chapters, all of them. */
export function greekMembers(state: GameState): number {
  let sum = 0;
  for (const chapter of chapters(state)) sum += chapter.members;
  return sum;
}

/** The share of everyone enrolled who is in a chapter. */
export function greekShare(state: GameState): number {
  const students = enrollment(state);
  return students > 0 ? Math.min(1, greekMembers(state) / students) : 0;
}

// ---------------------------------------------------------------- names --

/** A name for a new chapter: one or two Greek letters and a plain English word, never one this campus has used. */
function chapterName(state: GameState, salt: number): string {
  const used = new Set(state.greek.used);
  for (let attempt = 0; attempt < 400; attempt++) {
    const h = (n: number): number => hashInts(state.seed, 5101, salt, attempt, n);
    const first = GREEK_LETTERS[h(1) % GREEK_LETTERS.length]!;
    const two = h(2) % 3 !== 0;
    const second = two ? GREEK_LETTERS[h(3) % GREEK_LETTERS.length]! : null;
    const word = CHAPTER_WORDS[h(4) % CHAPTER_WORDS.length]!;
    if (second === first) continue;
    const name = second ? `${first} ${second} ${word}` : `${first} ${word}`;
    // The second line: nothing on the tone guide's list, whatever the pools come to hold.
    if (used.has(name) || BANNED_WORDS.test(name)) continue;
    return name;
  }
  return `${GREEK_LETTERS[salt % GREEK_LETTERS.length]} ${CHAPTER_WORDS[salt % CHAPTER_WORDS.length]} ${salt}`;
}

// --------------------------------------------------------------- policies --

type Times = Extract<PolicyEffect, { kind: 'greekDrag' | 'greekMembers' }>;

/**
 * What the policies that are on do to Greek Row: the drag on the rating, and how many join. Read from the list itself,
 * as the policy page reads it, so the switch and what follows agree.
 */
function policyTimes(state: GameState, kind: Times['kind']): { times: number; by: PolicySpec[] } {
  const on = state.policies?.on;
  if (!on || on.length === 0) return { times: 1, by: [] };
  let times = 1;
  const by: PolicySpec[] = [];
  for (const spec of POLICIES) {
    if (!on.includes(spec.id)) continue;
    for (const effect of [...spec.gains, ...spec.costs]) {
      if (effect.kind !== kind) continue;
      times *= effect.times;
      by.push(spec);
    }
  }
  return { times, by };
}

// ------------------------------------------------------------ the status --

export interface ChapterTrouble {
  /** More members than beds. */
  overfull: boolean;
  /** No Campus Safety office reaches the house. */
  unsafe: boolean;
}

export function chapterTrouble(state: GameState, chapter: Chapter): ChapterTrouble {
  const house = houseOf(state, chapter);
  return {
    overfull: chapter.members > chapterBeds(state),
    unsafe: !!house && !coverFor(state.map, 'safety', house.x, house.y),
  };
}

const troubled = (trouble: ChapterTrouble): boolean => trouble.overfull || trouble.unsafe;

/** How a chapter stands now, from what is true of it now: put right, it is Good again at once. */
export function chapterStatus(state: GameState, chapter: Chapter): ChapterStatus {
  if (!troubled(chapterTrouble(state, chapter))) return 'good';
  if (chapter.since >= 0 && state.clock.tick - chapter.since >= PROBATION_HOURS * TICKS_PER_HOUR) return 'probation';
  return 'warning';
}

/** Ticks until a chapter on Warning goes on Probation, or null when it is not on Warning. */
export function probationIn(state: GameState, chapter: Chapter): number | null {
  if (chapterStatus(state, chapter) !== 'warning') return null;
  const from = chapter.since >= 0 ? chapter.since : state.clock.tick;
  return Math.max(0, from + PROBATION_HOURS * TICKS_PER_HOUR - state.clock.tick);
}

// ------------------------------------------------------------ what it lifts --

function gap(a: Placed, x: number, y: number): number {
  return Math.max(Math.max(a.x - x, 0, x - (a.x + a.w - 1)), Math.max(a.y - y, 0, y - (a.y + a.h - 1)));
}

/** True when another chapter house stands within reach of this one: the Row. */
export function onTheRow(state: GameState, chapter: Chapter): boolean {
  const house = houseOf(state, chapter);
  if (!house) return false;
  for (const other of chapters(state)) {
    if (other === chapter) continue;
    const there = houseOf(state, other);
    if (there && gap(house, there.x, there.y) <= ROW_REACH) return true;
  }
  return false;
}

export interface ChapterLift {
  /** Points of Food & fun its members feel, out of that cause's 100. 0 on Probation. */
  points: number;
  parts: Array<{ label: string; points: number }>;
}

/** What a chapter's members feel, in points of Food & fun, and why. */
export function chapterLift(state: GameState, chapter: Chapter): ChapterLift {
  if (chapterStatus(state, chapter) === 'probation') return { points: 0, parts: [] };
  const parts: Array<{ label: string; points: number }> = [{ label: 'A house of their own', points: GREEK_LIFE }];
  if (onTheRow(state, chapter)) parts.push({ label: 'Another house beside it', points: ROW_BONUS });
  const house = houseOf(state, chapter);
  if (house && noiseAt(state, house.x, house.y) > 0) parts.push({ label: 'Game days next door', points: GAME_DAY_BONUS });
  const giving = Math.min(GIVING_MOST, chapter.giving);
  if (giving > 0) parts.push({ label: giving === 1 ? 'A philanthropy event' : `${giving} philanthropy events`, points: GIVING_BONUS * giving });
  return { points: parts.reduce((sum, part) => sum + part.points, 0), parts };
}

/** Students living in dorm beds or chapter houses now, the ones a rush is drawn from. */
function residents(state: GameState): number {
  return Math.max(0, enrollment(state) - offCampusNow(state));
}

/**
 * Greek Row's effects, in the shape the policies' are, so the causes and the rating read them through the same hooks
 * and name "Greek Row" on the same lines (DESIGN.md 41.7). Nothing at all on a campus with no chapter.
 */
export function greekEffects(state: GameState): Array<{ spec: Pick<PolicySpec, 'id' | 'name'>; effect: PolicyEffect }> {
  const list = chapters(state);
  if (list.length === 0) return [];
  let members = 0;
  let lifted = 0;
  for (const chapter of list) {
    members += chapter.members;
    lifted += chapter.members * chapterLift(state, chapter).points;
  }
  if (members <= 0) return [];
  const out: Array<{ spec: Pick<PolicySpec, 'id' | 'name'>; effect: PolicyEffect }> = [];
  const points = Math.round((lifted / members) * 10) / 10;
  if (points > 0) out.push({ spec: GREEK_ROW, effect: { kind: 'cause', cause: 'life', points, among: 'greek' } });
  const drag = greekDrag(state);
  if (drag.points > 0) out.push({ spec: GREEK_ROW, effect: { kind: 'rating', input: 'graduation', points: -drag.points, why: drag.why } });
  return out;
}
const GREEK_ROW: Pick<PolicySpec, 'id' | 'name'> = { id: 'greekRow', name: 'Greek Row' };

/** The share of the students read at a zone's lots that Greek Row's lift touches: its members, among those in dorms. */
export function greekTouched(state: GameState, zone: 'housing' | 'academic', housedByPolicy: number): number {
  if (zone !== 'housing') return 0;
  const inDorms = residents(state) + housedByPolicy;
  return inDorms > 0 ? Math.min(1, greekMembers(state) / inDorms) : 0;
}

/** Points off the graduation input of the academic rating, and why: by the share of students in chapters. */
export function greekDrag(state: GameState): { points: number; why: string; before: number; by: string[] } {
  const share = greekShare(state);
  if (share <= 0) return { points: 0, why: '', before: 0, by: [] };
  const before = Math.min(GREEK_DRAG_MOST, share * GREEK_DRAG_PER_SHARE);
  const policy = policyTimes(state, 'greekDrag');
  const points = Math.round(before * policy.times * 10) / 10;
  const percent = share >= 0.1 ? Math.round(share * 100) : Math.round(share * 1000) / 10;
  const eased = policy.by.length > 0 ? `, eased by ${policy.by.map((spec) => spec.name).join(' and ')}` : '';
  return { points, before, why: `${percent}% of students are in chapters${eased}`, by: policy.by.map((spec) => spec.name) };
}

/** How loud the chapter houses are at a cell: a share of full noise, from the nearest, fading over its reach. */
export function chapterNoiseAt(state: GameState, x: number, y: number): number {
  const list = state.greek?.chapters;
  if (!list || list.length === 0) return 0;
  let loud = 0;
  for (const chapter of list) {
    const house = state.map.placed[chapter.house];
    if (!house) continue;
    const distance = gap(house, x, y);
    if (distance > CHAPTER_NOISE_REACH) continue;
    loud = Math.max(loud, CHAPTER_NOISE * (1 - (Math.max(1, distance) - 1) / CHAPTER_NOISE_REACH));
  }
  return loud;
}

// ---------------------------------------------------------- the calendar --

function dateIn(week: Week, ref: number): number {
  return tickOfDate(week, (ref === 0 ? RUSH_DATE : GIVING_DATE) as CalDate);
}

/** The next rush week (ref 0) or philanthropy day (ref 1), after now. */
export function nextGreekDay(state: GameState, ref: number): number | null {
  const week = state.clock.week;
  const next: Week = { year: week.year + 1, start: week.start + yearLength(week), extra: 0 };
  for (const w of [week, next]) {
    const at = dateIn(w, ref);
    if (at > state.clock.tick) return at;
  }
  return null;
}

function schedule(state: GameState, ref: number): void {
  cancelTimers(state, 'greek', ref);
  const at = nextGreekDay(state, ref);
  if (at !== null) addTimer(state, at, 'greek', ref);
}

/** Rush week, or a philanthropy day, has come. */
export function greekDue(state: GameState, ref: number, log: LogEntry[]): void {
  if (chapters(state).length > 0) {
    if (ref === 0) rush(state, log);
    else philanthropy(state, log);
  }
  schedule(state, ref);
}

// ---------------------------------------------------------------- rush --

/** Those who would join a chapter now, across the campus: a share of the students living on campus, less with a grade standard. */
function interested(state: GameState): number {
  return residents(state) * GREEK_INTEREST * policyTimes(state, 'greekMembers').times;
}

const housedIn = (state: GameState, members: number): number => Math.min(members, chapterBeds(state));

/**
 * Rush week: those who want to join are shared among the chapters, each up to a quarter more than its beds. A
 * chapter's members who are still here stay; pledges make up the rest. Students move from dorm beds into the houses.
 */
function rush(state: GameState, log: LogEntry[]): void {
  const list = chapters(state);
  const cap = Math.round(chapterBeds(state) * RUSH_MOST);
  const each = interested(state) / list.length;
  let joined = 0;
  let moved = 0;
  for (const chapter of list) {
    const before = housedIn(state, chapter.members);
    const want = Math.min(cap, Math.round(each));
    chapter.pledges = Math.max(0, want - chapter.members);
    chapter.members = Math.max(chapter.members, want);
    chapter.giving = 0;
    chapter.pranks = 0;
    joined += chapter.pledges;
    moved += Math.max(0, housedIn(state, chapter.members) - before);
    remember(state, chapter, 'rush', `Rush week: ${headCount(chapter.pledges)} ${chapter.pledges === 1 ? 'pledge' : 'pledges'} joined, ${headCount(chapter.members)} members in all.`);
  }
  const year = state.clock.week.year;
  state.greek.rush = { year, joined, moved };
  state.greek.totals.rushes += 1;
  const houses = list.length === 1 ? `the ${list[0]!.name} house` : `the ${headCount(list.length)} chapter houses`;
  const proud = list[hashInts(state.seed, 5107, year) % list.length]!.name;
  const boast = RUSH_BOASTS[hashInts(state.seed, 5109, year) % RUSH_BOASTS.length]!;
  log.push({
    tick: state.clock.tick,
    kind: 'greek',
    text:
      moved > 0
        ? `Rush week: ${headCount(joined)} ${joined === 1 ? 'student joins' : 'students join'} Greek Row, and ${headCount(moved)} ${moved === 1 ? 'moves' : 'move'} from dorm beds into ${houses}.`
        : `Rush week: ${headCount(joined)} ${joined === 1 ? 'student joins' : 'students join'} Greek Row. ${list.length === 1 ? 'Its house was' : 'The houses were'} full already, so the new members keep their dorm beds.`,
    data: { rush: 1, joined, moved, keep: 1, headline: `Rush Week: ${headCount(joined)} Join Greek Row; ${proud} ${boast}` },
  });
  // Every house rush has left overfull, in one line: another house takes their extra members the day it opens.
  const full = list.filter((chapter) => chapter.members > chapterBeds(state));
  if (full.length > 0) {
    const names = full.length <= 3 ? full.map((chapter) => chapter.name) : [full[0]!.name, `${full.length - 1} more`];
    const said = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    log.push({
      tick: state.clock.tick,
      kind: 'greek',
      text: `${said} took more members than ${full.length === 1 ? 'its house has' : 'their houses have'} beds: ${headCount(full[0]!.members)} for ${headCount(chapterBeds(state))}. Another chapter house would give them room.`,
      data: { overfull: 1, houses: full.length },
    });
  }
}

/** The second half of rush week's headline, after a chapter's name. */
const RUSH_BOASTS: readonly string[] = ['Claims the Best Banner', 'Says Its Pancakes Won It', 'Insists the Tuba Helped', 'Paints Its Porch a Third Time', 'Declares Itself the Friendliest'];

/** Commencement: the seniors among each chapter's members graduate. */
export function greekOnGraduation(state: GameState): void {
  for (const chapter of chapters(state)) chapter.members = Math.round(chapter.members * (1 - SENIOR_SHARE));
}

// ------------------------------------------------------- founding and clearing --

/**
 * A house is placed: its chapter is founded at once. Members of an overfull chapter move in first, then those who
 * wanted to join and found no room, and it opens with at least half its beds full, from the dorms.
 */
export function chapterPlaced(state: GameState, house: Placed): void {
  const greek = state.greek;
  const beds = chapterBeds(state);
  const name = chapterName(state, house.id);
  const chapter: Chapter = {
    house: house.id,
    name,
    look: hashInts(state.seed, 5113, house.id) % 64,
    founded: state.clock.tick,
    members: 0,
    pledges: 0,
    since: -1,
    status: 'good',
    giving: 0,
    pranks: 0,
    hazing: 0,
    events: [],
  };
  let fromOthers = 0;
  for (const other of greek.chapters) {
    if (other.members <= beds || chapter.members >= beds) continue;
    const move = Math.min(other.members - beds, beds - chapter.members);
    other.members -= move;
    chapter.members += move;
    fromOthers += move;
  }
  const unmet = Math.max(0, Math.round(interested(state)) - greekMembers(state) - chapter.members);
  const founding = Math.max(Math.round(beds * FOUNDING_SHARE), Math.min(beds, chapter.members + unmet));
  chapter.pledges = Math.max(0, founding - chapter.members);
  chapter.members = Math.max(chapter.members, founding);
  greek.chapters.push(chapter);
  greek.used.push(name);
  remember(state, chapter, 'founded', `Founded, with ${headCount(chapter.members)} members.`);
  if (greek.chapters.length === 1) {
    schedule(state, 0);
    schedule(state, 1);
  }
  const from = fromOthers > 0 ? `, ${headCount(fromOthers)} of them from a house that was overfull` : '';
  greek.news.push(`${name} is founded, with ${headCount(chapter.members)} members${from}. The house has ${headCount(beds)} beds.`);
}

/** A house is cleared: its chapter closes, and its members go back to dorm beds. Its name is not given again. */
export function chapterCleared(state: GameState, house: number): void {
  const chapter = chapterOf(state, house);
  if (!chapter) return;
  state.greek.chapters = state.greek.chapters.filter((one) => one !== chapter);
  state.greek.news.push(`The ${chapter.name} house is cleared. Its ${headCount(chapter.members)} members move back into the dorms.`);
  if (state.greek.chapters.length === 0) {
    cancelTimers(state, 'greek', 0);
    cancelTimers(state, 'greek', 1);
  }
}

// ------------------------------------------------------------ the check --

function troubleWords(state: GameState, chapter: Chapter, trouble: ChapterTrouble): string {
  const words: string[] = [];
  if (trouble.overfull) words.push(`its house is overfull, ${headCount(chapter.members)} members for ${headCount(chapterBeds(state))} beds`);
  if (trouble.unsafe) words.push('Campus Safety does not reach its house');
  return words.join(', and ');
}

function fixWords(trouble: ChapterTrouble): string {
  const words: string[] = [];
  if (trouble.overfull) words.push('another chapter house would give them room');
  if (trouble.unsafe) words.push('a Campus Safety office in reach would put it right');
  const text = words.join(', and ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Once an hour: each chapter's standing, with a change told once. Trouble put right is Good again at once. */
export function stepGreek(state: GameState, log: LogEntry[]): void {
  const list = state.greek?.chapters;
  if (!list || list.length === 0) return;
  const tick = state.clock.tick;
  for (const chapter of list) {
    const trouble = chapterTrouble(state, chapter);
    if (!troubled(trouble)) chapter.since = -1;
    else if (chapter.since < 0) chapter.since = tick;
    const now = chapterStatus(state, chapter);
    if (now === chapter.status) continue;
    const was = chapter.status;
    chapter.status = now;
    const data = { house: chapter.house, status: now === 'good' ? 0 : now === 'warning' ? 1 : 2, keep: 1 };
    if (now === 'warning') {
      log.push({ tick, kind: 'greek', text: `${chapter.name} is on Warning: ${troubleWords(state, chapter, trouble)}. ${fixWords(trouble)} Left as it is for ${PROBATION_HOURS} hours, it goes on Probation.`, data });
    } else if (now === 'probation') {
      log.push({ tick, kind: 'greek', text: `${chapter.name} is on Probation: ${troubleWords(state, chapter, trouble)}. Its members lose what the house gives them until it is put right. ${fixWords(trouble)}`, data });
    } else if (was !== 'good') {
      log.push({ tick, kind: 'greek', text: `${chapter.name} is in good standing again.`, data });
    }
  }
}

/** Lines from a choice or an action, said on the next tick. */
export function tellGreek(state: GameState, log: LogEntry[]): void {
  const news = state.greek?.news;
  if (!news || news.length === 0) return;
  for (const text of news) log.push({ tick: state.clock.tick, kind: 'greek', text, data: { keep: 1 } });
  state.greek.news = [];
}

// ---------------------------------------------------- pranks and philanthropy --

/** A chapter holds a philanthropy event: its members feel it, and it pranks less until the next rush. */
function heldEvent(state: GameState, chapter: Chapter): void {
  chapter.giving += 1;
  state.greek.totals.giving += 1;
}

function eventLine(state: GameState, chapter: Chapter): string {
  const line = PHILANTHROPY[hashInts(state.seed, 5119, chapter.house, state.greek.totals.giving) % PHILANTHROPY.length]!;
  return line.replace('{chapter}', chapter.name);
}

/** The spring's philanthropy: every chapter not on Probation holds one event, and the campus is a little happier for it. */
function philanthropy(state: GameState, log: LogEntry[]): void {
  let first = '';
  let held = 0;
  for (const chapter of chapters(state)) {
    if (chapterStatus(state, chapter) === 'probation') continue;
    const line = eventLine(state, chapter);
    heldEvent(state, chapter);
    remember(state, chapter, 'giving', line.replace(`${chapter.name} `, 'It '));
    if (held === 0) first = line;
    held += 1;
  }
  if (held === 0) return;
  // One line for the paper: the first chapter's event, and how many more gave back.
  const more = held - 1;
  log.push({ tick: state.clock.tick, kind: 'greek', text: `Greek Row gives back. ${first}${more > 0 ? ` ${headCount(more)} more ${more === 1 ? 'chapter' : 'chapters'} held events of ${more === 1 ? 'its' : 'their'} own.` : ''}`, data: { giving: 1, held, keep: 1 } });
  state.inbox.boosts.push({ kind: 'happy', amount: 1, until: state.clock.tick + 2 * TICKS_PER_DAY, label: 'Greek Row gives back' });
}

/** A chapter answers a prank with a philanthropy event, as the desk asked (DESIGN.md 51). */
export function greekGiving(state: GameState, house: number): void {
  const chapter = chapterOf(state, house);
  if (!chapter) return;
  const line = eventLine(state, chapter);
  state.greek.news.push(line);
  heldEvent(state, chapter);
  remember(state, chapter, 'giving', line.replace(`${chapter.name} `, 'It '));
}

/** A prank has come to the desk from this chapter: it is counted. */
export function greekPranked(state: GameState, house: number): void {
  const chapter = chapterOf(state, house);
  if (!chapter) return;
  chapter.pranks += 1;
  state.greek.totals.pranks += 1;
}

/** A prank's line goes on its chapter's record. */
export function greekPrankText(state: GameState, house: number, text: string): void {
  const chapter = chapterOf(state, house);
  if (chapter) remember(state, chapter, 'prank', text);
}

/** The chance a chapter pulls a prank on one day: by its standing, and half as likely once it has given back since rush. */
export function prankChance(state: GameState, chapter: Chapter): number {
  const yearly = PRANK_CHANCE[chapterStatus(state, chapter)];
  return (yearly * (chapter.giving > 0 ? 0.5 : 1)) / 7;
}

/** Today's prank, if a chapter pulls one: the chapter and what it did. `pick` is the desk's number for the day. */
export function prankToday(state: GameState, pick: (salt: number) => number): { chapter: Chapter; text: string } | null {
  const list = chapters(state);
  for (let i = 0; i < list.length; i++) {
    const chapter = list[i]!;
    if ((pick(60 + i) % 100_000) / 100_000 >= prankChance(state, chapter)) continue;
    const line = PRANKS[pick(80 + i) % PRANKS.length]!;
    return { chapter, text: line.replace('{chapter}', chapter.name) };
  }
  return null;
}

// --------------------------------------------------------- student cards --

/**
 * The chapter a student belongs to, from two of their own rolls, or null. Only a student who lives on campus may be
 * a member. `housed` is false for a member of an overfull chapter who still has a dorm bed.
 */
export function memberOf(state: GameState, a: number, b: number): { chapter: Chapter; housed: boolean } | null {
  const list = chapters(state);
  if (list.length === 0) return null;
  const living = residents(state);
  const members = greekMembers(state);
  if (living <= 0 || members <= 0 || a >= Math.min(1, members / living)) return null;
  let at = b * members;
  for (const chapter of list) {
    if (at < chapter.members) return { chapter, housed: at < housedIn(state, chapter.members) };
    at -= chapter.members;
  }
  const last = list[list.length - 1]!;
  return { chapter: last, housed: false };
}
