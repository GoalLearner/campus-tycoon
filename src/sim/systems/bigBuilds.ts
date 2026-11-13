import {
  BIG_BUILDS,
  COMMONS_POINTS,
  HONORS_RATE,
  SECOND_BUILDER_SEALS,
  UNION_REACH,
  UNION_STRENGTH,
  WELCOME_MORE,
  type BigBuildSpec,
} from '../config/bigBuilds';
import { ERA_AT_RANK, ERAS, RANK_GOALS } from '../config/goals';
import { PLACED } from '../config/placed';
import { TICKS_PER_HOUR } from '../config/time';
import { duration } from '../format';
import { addTimer, cancelTimers } from '../timers';
import type { BigBuilds, GameState, LogEntry, MapState, Placed, PlacedType } from '../types';
import { eraOf } from './goals';
import { dailyOnPlaced } from './daily';

/**
 * The big builds the eras open (DESIGN.md 41.3 and 41.4, as built in section
 * 45). Each is a placed building of the family 'era', one of each, bought once
 * its era has come. It goes up over real days: while it does, it stands on the
 * map as a building site, does nothing and costs nothing to run, and the
 * Seals panel can finish it now. One goes up at a time, two with the second
 * builder. Its one effect is read here, by the rule it belongs to.
 */

export function newBigBuilds(): BigBuilds {
  return { slots: 1, news: [] };
}

export function bigBuildSpec(type: PlacedType): BigBuildSpec | undefined {
  return BIG_BUILDS.find((spec) => spec.type === type);
}

export function isBigBuild(type: PlacedType): boolean {
  return PLACED[type].family === 'era';
}

/** The big builds of the map: the ids of the family 'era', from the index when there is one. */
function bigOnMap(map: MapState): Placed[] {
  const ids = map.care?.byFamily?.era;
  const out: Placed[] = [];
  if (ids) {
    for (const id of ids) {
      const placed = map.placed[id];
      if (placed && PLACED[placed.type].family === 'era') out.push(placed);
    }
    return out;
  }
  for (const placed of map.placed) if (placed && PLACED[placed.type].family === 'era') out.push(placed);
  return out;
}

/** The one of a type on the map, built or going up. null when there is none. */
export function bigBuildOf(state: GameState, type: PlacedType): Placed | null {
  return bigOnMap(state.map).find((placed) => placed.type === type) ?? null;
}

/** True when the one of a type stands and is open. */
export function bigBuildOpen(state: GameState, type: PlacedType): boolean {
  const placed = bigBuildOf(state, type);
  return placed !== null && placed.done === undefined;
}

/** The big builds going up now, the soonest to open first. */
export function goingUp(state: GameState): Placed[] {
  return bigOnMap(state.map)
    .filter((placed) => placed.done !== undefined)
    .sort((a, b) => a.done! - b.done!);
}

/** The big builds this game may buy: those its eras have opened. None on a game with no goals. */
export function bigBuildsOffered(state: GameState): BigBuildSpec[] {
  if (!state.goals || !state.bigBuilds) return [];
  const era = eraOf(state.goals);
  return BIG_BUILDS.filter((spec) => spec.era <= era);
}

/** The rank goal that opens an era, as "the Top 75". */
function eraAt(era: number): string {
  const goal = ERA_AT_RANK[era - 1];
  return goal === undefined ? `the ${ERAS[era]} era` : `the ${ERAS[era]} era, at the Top ${RANK_GOALS[goal - 1]}`;
}

/** Why a big build cannot be started here now, or null when it can. */
export function cannotStart(state: GameState, type: PlacedType): string | null {
  const spec = bigBuildSpec(type);
  const name = PLACED[type].name;
  if (!spec || !state.goals || !state.bigBuilds) return `${name} comes with an era, on a campus with goals.`;
  if (eraOf(state.goals) < spec.era) return `${name} comes with ${eraAt(spec.era)}.`;
  const there = bigBuildOf(state, type);
  if (there) return there.done === undefined ? `${name} is already on the campus. Clear it first to move it.` : `${name} is being built. It opens in ${duration(there.done - state.clock.tick)}.`;
  const busy = goingUp(state);
  if (busy.length >= state.bigBuilds.slots) {
    const names = busy.map((placed) => `the ${PLACED[placed.type].name}`).join(' and ');
    return state.bigBuilds.slots < 2
      ? `The builder is busy with ${names}. A second builder costs ${SECOND_BUILDER_SEALS} Gold Seals, once.`
      : `Both builders are busy, with ${names}.`;
  }
  return null;
}

/** A big build has just been placed and paid for: it goes up from now. Changes the state it is given. */
export function startBigBuild(state: GameState, placed: Placed): void {
  const spec = bigBuildSpec(placed.type);
  if (!spec) return;
  placed.done = state.clock.tick + spec.hours * TICKS_PER_HOUR;
  addTimer(state, placed.done, 'bigBuild', placed.id);
  state.bigBuilds.news.push(`Work has begun on the ${PLACED[placed.type].name}. It opens in ${duration(placed.done - state.clock.tick)}.`);
}

/** The timer of a big build fired: it opens, with its line in the paper. */
export function bigBuildDone(state: GameState, id: number, log: LogEntry[]): void {
  const placed = state.map.placed[id];
  if (!placed || placed.done === undefined || placed.done > state.clock.tick) return;
  delete placed.done;
  state.money.ratesDirty = true;
  // Its opening bonus to collect, as any building that opens has.
  dailyOnPlaced(state, id);
  const spec = bigBuildSpec(placed.type);
  log.push({
    tick: state.clock.tick,
    kind: 'bigBuild',
    text: `The ${PLACED[placed.type].name} is open: ${spec?.does ?? PLACED[placed.type].effect}.`,
    data: { keep: 1, id },
  });
}

/** Finish a big build now: it opens on the next tick, with its own line, as it would have. The Seals are the caller's. */
export function hurryBigBuild(state: GameState, id: number): void {
  const placed = state.map.placed[id];
  if (!placed || placed.done === undefined) return;
  cancelTimers(state, 'bigBuild', id);
  placed.done = state.clock.tick + 1;
  addTimer(state, placed.done, 'bigBuild', id);
}

/** A big build cleared while going up: its timer goes with it. */
export function bigBuildCleared(state: GameState, id: number): void {
  cancelTimers(state, 'bigBuild', id);
}

/** Buy the second builder. Changes the state it is given. Returns why not, or null when done. */
export function buySecondBuilder(state: GameState): string | null {
  if (!state.goals || !state.bigBuilds) return 'There is nothing to build here that needs a second builder.';
  if (state.bigBuilds.slots >= 2) return 'The second builder is already yours.';
  if (state.daily.seals < SECOND_BUILDER_SEALS) return `A second builder costs ${SECOND_BUILDER_SEALS} Gold Seals. You have ${state.daily.seals}.`;
  state.daily.seals -= SECOND_BUILDER_SEALS;
  state.bigBuilds.slots = 2;
  state.bigBuilds.news.push('A second builder is hired: two big builds can go up at once, for good.');
  return null;
}

/** Lines waiting from an action are said on the next tick. */
export function tellBigBuilds(state: GameState, log: LogEntry[]): void {
  const news = state.bigBuilds?.news;
  if (!news || news.length === 0) return;
  for (const text of news) log.push({ tick: state.clock.tick, kind: 'bigBuild', text, data: { started: 1 } });
  state.bigBuilds.news = [];
}

/** What an era opens of these, in words, or '' for none: "three buildings to buy: the Student Union, ...". */
export function bigBuildsOpening(era: number): string {
  const names = BIG_BUILDS.filter((spec) => spec.era === era).map((spec) => PLACED[spec.type].name);
  if (names.length === 0) return '';
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
  const listed = names.length === 1 ? `the ${names[0]}` : `${names.slice(0, -1).map((name) => `the ${name}`).join(', ')} and the ${names[names.length - 1]}`;
  const noun = era >= 3 ? (names.length === 1 ? 'landmark' : 'landmarks') : names.length === 1 ? 'building' : 'buildings';
  return `${words[names.length] ?? names.length} ${noun} to buy in the Build menu: ${listed}`;
}

// ------------------------------------------------------------ their effects --

/** Cells between a spot and the nearest edge of a building, counting diagonals as one. */
function gap(placed: Placed, x: number, y: number): number {
  return Math.max(Math.max(placed.x - x, 0, x - (placed.x + placed.w - 1)), Math.max(placed.y - y, 0, y - (placed.y + placed.h - 1)));
}

/** What the Student Union adds to the recreation at a spot: its strength within its reach, once it is open. */
export function unionAt(map: MapState, x: number, y: number): number {
  for (const placed of bigOnMap(map)) {
    if (placed.type !== 'studentUnion' || placed.done !== undefined) continue;
    if (gap(placed, x, y) <= UNION_REACH) return UNION_STRENGTH;
  }
  return 0;
}

/** Points of graduation rate the Honors College adds to what the academic rating reads. 0 when it is not open. */
export function honorsRate(state: GameState): number {
  return bigBuildOpen(state, 'honorsCollege') ? HONORS_RATE : 0;
}

/** The share more that marketing brings with the Welcome Center open. 0 when it is not. */
export function welcomeMore(state: GameState): number {
  return bigBuildOpen(state, 'welcomeCenter') ? WELCOME_MORE : 0;
}

/** What Founders' Commons adds to Grounds at every lot, as a share of full. 0 when it is not open. */
export function commonsLift(state: GameState): number {
  return bigBuildOpen(state, 'foundersCommons') ? COMMONS_POINTS / 100 : 0;
}
