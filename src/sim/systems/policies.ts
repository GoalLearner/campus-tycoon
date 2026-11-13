import { PLACED } from '../config/placed';
import { EXAMS_AT_MIDTERMS, EXAMS_MOST, POLICIES, type PolicyEffect, type PolicySpec, type RatingInputId } from '../config/policies';
import { SEASON_CURVE } from '../config/season';
import { SURNAME_ENDS, SURNAME_STARTS, type CauseId } from '../config/students';
import { dollars, headCount } from '../format';
import { hashInts } from '../rng';
import { scaleOf } from '../scale';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, LogEntry, Policies, Zone } from '../types';
import { eraOf } from './goals';
import { driversNow, offCampusNow } from './town';
import { commonsLift } from './bigBuilds';
import { traditionEffects } from './traditions';
import { chapters, greekEffects, greekTouched } from './greek';
import { calendarAt } from '../calendar';

/**
 * Policies (DESIGN.md sections 12 and 41): the switches an era opens.
 *
 * Only a game begun on the model campus has eras, so only it has policies.
 * A switch that is on changes numbers the game already had, each through one
 * of the hooks below, and every hook answers "nothing" at once on a game
 * with no switch on. So a game that never touches the page plays exactly as
 * it did before there was one.
 *
 * No fifth cause (the owner's rule). What a policy does to Happiness goes
 * inside one of the four causes and is named on that cause's line. What it
 * does to Stress comes off the top at exams, as help from the desk does, and
 * is named beside Stress. Neither has a line of its own.
 *
 * A changed switch stays put until the next class moves in.
 */

export function newPolicies(): Policies {
  return { on: [], locked: [], news: [] };
}

const NONE: readonly PolicySpec[] = [];

export function policySpec(id: string): PolicySpec | undefined {
  return POLICIES.find((spec) => spec.id === id);
}

/** The policies an era opens: 1 is Growth. Greek Row's two open with the first chapter house instead (DESIGN.md 51). */
export function policiesAt(era: number): PolicySpec[] {
  return POLICIES.filter((spec) => spec.era === era && !spec.greek);
}

/**
 * The switches this game has: every policy of the eras it has opened. None on a game with no eras. Greek Row's two
 * show once the campus has a chapter house, and stay while one is on.
 */
export function policiesOpen(state: GameState): PolicySpec[] {
  if (!state.goals) return [];
  const era = eraOf(state.goals);
  if (era <= 0) return [];
  const greek = chapters(state).length > 0;
  return POLICIES.filter((spec) => spec.era <= era && (!spec.greek || greek || state.policies.on.includes(spec.id)));
}

export function policyOn(state: GameState, id: string): boolean {
  return state.policies.on.includes(id);
}

/** True while a switch may not be changed again: from a change until the next class moves in. */
export function policyLocked(state: GameState, id: string): boolean {
  return state.policies.locked.includes(id);
}

/** The policies that are on, in the order of the list. */
function active(state: GameState): readonly PolicySpec[] {
  const on = state.policies?.on;
  if (!on || on.length === 0) return NONE;
  return POLICIES.filter((spec) => on.includes(spec.id));
}

type EffectOf<K extends PolicyEffect['kind']> = Extract<PolicyEffect, { kind: K }>;

/**
 * Every effect of one kind among the policies that are on, with the policy it belongs to, and among the traditions a
 * campus keeps (DESIGN.md 50), each named for its tradition: the same hooks, and the same notes on the same lines.
 */
function effects<K extends PolicyEffect['kind']>(state: GameState, kind: K): Array<{ spec: Pick<PolicySpec, 'id' | 'name'>; effect: EffectOf<K> }> {
  const out: Array<{ spec: Pick<PolicySpec, 'id' | 'name'>; effect: EffectOf<K> }> = [];
  for (const spec of active(state)) {
    for (const effect of [...spec.gains, ...spec.costs]) if (effect.kind === kind) out.push({ spec, effect: effect as EffectOf<K> });
  }
  for (const one of traditionEffects(state)) if (one.effect.kind === kind) out.push({ spec: one.spec, effect: one.effect as EffectOf<K> });
  // Greek Row (DESIGN.md 51): its members' lift and its drag on the rating, named "Greek Row" on those lines.
  for (const one of greekEffects(state)) if (one.effect.kind === kind) out.push({ spec: one.spec, effect: one.effect as EffectOf<K> });
  return out;
}

const signed = (n: number): string => `${n > 0 ? '+' : '\u2212'}${Math.abs(n)}`;
const plural = (n: number, one: string, many: string): string => `${headCount(n)} ${n === 1 ? one : many}`;

// ------------------------------------------------------------ spare beds --

/** Beds with nobody in them: what the dorms hold, less the students who live in them. */
function spareBeds(state: GameState): number {
  return Math.max(0, openCapacity(state, 'housing') - Math.max(0, enrollment(state) - offCampusNow(state)));
}

/** How many freshmen from town would take a spare bed if they were asked to: as many as there are, as far as the beds go. */
export function housedIfOn(state: GameState): number {
  return Math.min(state.offCampus[0], spareBeds(state));
}

/**
 * Freshmen from town in a bed nobody else was in ("Freshmen live on campus").
 * They take only spare beds, so no student who needs a bed is ever kept out
 * by them, and a class moving in has the beds it would have had.
 */
export function housedByPolicy(state: GameState): number {
  return effects(state, 'spareBeds').length > 0 ? housedIfOn(state) : 0;
}

/** The same, with the name of the policy that houses them, for the lines that count beds. '' and 0 with none. */
export function housedNote(state: GameState): { housed: number; by: string } {
  const found = effects(state, 'spareBeds');
  return found.length > 0 ? { housed: housedIfOn(state), by: found.map(({ spec }) => spec.name).join(' and ') } : { housed: 0, by: '' };
}

// ---------------------------------------------------- the four causes --

export interface CauseShift {
  /** The policy's id and name. */
  id: string;
  name: string;
  cause: CauseId;
  /** What it adds to the cause's level at a lot of this zone, out of 1. Below zero for a cost. */
  delta: number;
}

/** The share of the students read at a zone's lots that an effect touches. */
function touched(state: GameState, zone: Zone, among: EffectOf<'cause'>['among']): number {
  if (among === 'everyone') return 1;
  if (among === 'greek') return greekTouched(state, zone, housedByPolicy(state));
  if (among === 'drivers') {
    // Those who drive live in town, and a student who lives in town is read at the lecture halls.
    const off = offCampusNow(state);
    return zone === 'academic' && off > 0 ? Math.min(1, driversNow(state) / off) : 0;
  }
  // The freshmen the policy has housed are read at the dorms, with everyone else who lives there.
  const inDorms = Math.max(0, enrollment(state) - offCampusNow(state)) + housedByPolicy(state);
  return zone === 'housing' && inDorms > 0 ? Math.min(1, housedByPolicy(state) / inDorms) : 0;
}

/**
 * What the policies that are on add to or take from the causes of Happiness
 * at a lot of one zone. Each is inside its cause: `approvalAt` adds it to the
 * cause's level and keeps its name beside it, so the campus number, every
 * student card and the share of students who stay all read the same thing.
 */
export function causeShifts(state: GameState, zone: Zone, member?: number): CauseShift[] {
  const found = effects(state, 'cause');
  // Founders' Commons (DESIGN.md 45) is read the same way: inside Grounds, for everyone, its name beside it.
  const commons = commonsLift(state);
  if (found.length === 0 && commons === 0) return [];
  const out: CauseShift[] = [];
  if (commons > 0) out.push({ id: 'foundersCommons', name: PLACED.foundersCommons.name, cause: 'grounds', delta: commons });
  const fall = found.some(({ effect }) => effect.fall) && calendarAt(state.clock).phase === 'fall';
  for (const { spec, effect } of found) {
    // A cost of the fall alone is felt only in the fall semester.
    if (effect.fall && !fall) continue;
    // A chapter's own member, on their card, feels its whole lift: `member` is its points (DESIGN.md 51).
    const delta = effect.among === 'greek' && member !== undefined ? member / 100 : (effect.points / 100) * touched(state, zone, effect.among);
    if (delta !== 0) out.push({ id: spec.id, name: spec.name, cause: effect.cause, delta });
  }
  return out;
}

// --------------------------------------------------------------- stress --

/** How much of an exams effect applies at a point on the calendar's curve: all of it in finals week, a share at midterms. */
function examPart(curve: number): number {
  if (curve >= SEASON_CURVE.finals) return 1;
  return curve >= SEASON_CURVE.midterms ? EXAMS_AT_MIDTERMS : 0;
}

/**
 * Points the policies take off Stress now, and which ones. Nothing outside
 * an exam week. `library` is asked for only when a policy needs it: the share
 * of students with a library in reach.
 */
export function examsOff(state: GameState, curve: number, library: () => number): { points: number; by: string[] } {
  const found = effects(state, 'exams');
  if (found.length === 0) return { points: 0, by: [] };
  const part = examPart(curve);
  if (part === 0) return { points: 0, by: [] };
  let points = 0;
  const by: string[] = [];
  for (const { spec, effect } of found) {
    const off = effect.points * part * (effect.library ? library() : 1);
    if (off <= 0) continue;
    points += off;
    by.push(spec.name);
  }
  return { points: Math.min(EXAMS_MOST, points), by };
}

// --------------------------------------------------- the academic rating --

/** Points the policies add to or take from one input of the academic rating, each with its note for that input's line. */
export function ratingShift(state: GameState, input: RatingInputId): { points: number; notes: string[] } {
  const found = effects(state, 'rating');
  if (found.length === 0) return { points: 0, notes: [] };
  let points = 0;
  const notes: string[] = [];
  for (const { spec, effect } of found) {
    if (effect.input !== input) continue;
    points += effect.points;
    notes.push(`${spec.name}: ${signed(effect.points)}${effect.why ? `, ${effect.why}` : ''}`);
  }
  return { points, notes };
}

// ------------------------------------------------------------- who stays --

/** How much more of every class leaves at the end of a semester, and which policies ask it. */
export function leavingMore(state: GameState): { share: number; by: string[] } {
  const found = effects(state, 'leaving');
  if (found.length === 0) return { share: 0, by: [] };
  return { share: Math.min(0.05, found.reduce((sum, { effect }) => sum + effect.share, 0)), by: found.map(({ spec }) => spec.name) };
}

// -------------------------------------------------------------- football --

/** How much more of a crowd wants a seat at a home game. */
export function fansMore(state: GameState): number {
  const found = effects(state, 'fans');
  return found.length === 0 ? 0 : found.reduce((sum, { effect }) => sum + effect.lift, 0);
}

/** The share of the seats given to students free, and which policy gives them. */
export function freeSeats(state: GameState): { share: number; by: string[] } {
  const found = effects(state, 'freeSeats');
  if (found.length === 0) return { share: 0, by: [] };
  return { share: Math.min(1, found.reduce((sum, { effect }) => sum + effect.share, 0)), by: found.map(({ spec }) => spec.name) };
}

// ----------------------------------------------------------------- money --

function familyCount(state: GameState, family: string): number {
  let count = 0;
  for (const placed of state.map.placed) if (placed && PLACED[placed.type].family === family) count += 1;
  return count;
}

export function upkeepOf(state: GameState, effect: EffectOf<'upkeep'>): { count: number; amount: number } {
  const count = familyCount(state, effect.family);
  return { count, amount: count * effect.perYear * scaleOf(state) };
}

/** What the policies add to upkeep for a year, each with its note for the upkeep line. */
export function upkeepMore(state: GameState): { amount: number; notes: string[] } {
  const found = effects(state, 'upkeep');
  if (found.length === 0) return { amount: 0, notes: [] };
  let amount = 0;
  const notes: string[] = [];
  for (const { spec, effect } of found) {
    const more = upkeepOf(state, effect);
    if (more.amount <= 0) continue;
    amount += more.amount;
    notes.push(`${spec.name}: ${dollars(more.amount)} more`);
  }
  return { amount, notes };
}

/**
 * The donor whose name goes up: a family made from the game's own halves of
 * a surname, by the seed, so it is the same every time and nobody's real
 * name.
 */
export function donorName(state: GameState): string {
  return `${SURNAME_STARTS[hashInts(state.seed, 4117, 1) % SURNAME_STARTS.length]}${SURNAME_ENDS[hashInts(state.seed, 4117, 2) % SURNAME_ENDS.length]}`;
}

export function incomeOf(state: GameState, effect: EffectOf<'income'>): { amount: number; detail: string } {
  if (effect.per === 'driver') {
    const drivers = driversNow(state);
    return { amount: drivers * effect.amount, detail: `${plural(drivers, 'student who drives', 'students who drive')} at ${dollars(effect.amount)}` };
  }
  return { amount: effect.amount * scaleOf(state), detail: `From the ${donorName(state)} family, every year their name is up` };
}

/** The income the policies bring for a year: one line each, named for its policy. */
export function policyIncome(state: GameState): Array<{ id: string; name: string; amount: number; detail: string }> {
  const found = effects(state, 'income');
  if (found.length === 0) return [];
  return found.map(({ spec, effect }) => ({ id: `policy.${spec.id}`, name: spec.name, ...incomeOf(state, effect) })).filter((line) => line.amount > 0);
}

// ------------------------------------------------------------- incidents --

/** How many times as often mischief happens in the dorms: 1 with no policy about it. */
export function mischiefTimes(state: GameState): number {
  const found = effects(state, 'mischief');
  return found.length === 0 ? 1 : found.reduce((times, { effect }) => times * effect.times, 1);
}

/** The inputs of the academic rating, as the Rankings page names them. */
export const RATING_INPUT_NAME: Record<RatingInputId, string> = {
  graduation: 'Graduation rate',
  classSize: 'Class size',
  reputation: 'Reputation',
  retention: 'Retention',
  selectivity: 'Selectivity',
};

// ------------------------------------------------------- lock and paper --

/** A class has moved in: every switch may be changed again. */
export function unlockPolicies(state: GameState): void {
  if (state.policies.locked.length > 0) state.policies.locked = [];
}

/** Each switch changed since the last tick gets its one line in the log, for the paper and the away list. */
export function tellPolicies(state: GameState, log: LogEntry[]): void {
  const news = state.policies?.news;
  if (!news || news.length === 0) return;
  for (const item of news) {
    const spec = policySpec(item.id);
    if (!spec) continue;
    log.push({ tick: state.clock.tick, kind: 'policy', text: (item.on ? spec.begins : spec.ends).replace('{donor}', donorName(state)), data: { id: item.id, on: item.on ? 1 : 0 } });
  }
  state.policies.news = [];
}
