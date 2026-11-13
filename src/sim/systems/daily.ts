import { decorSpec, hurryCraft } from './decor';
import { ticksToIntake } from '../calendar';
import {
  COLLECT,
  COLLECT_HOURS,
  COLLECT_READY_HOURS,
  GAME_CASH,
  GAMES_HELD,
  HEAD_START_HOURS,
  LEVEL_FIRST,
  LEVEL_MOST,
  LEVEL_MOST_BEFORE_21,
  LEVEL_STEP,
  LEVEL_UNLOCKS,
  OPENINGS_PER_DAY,
  SEAL_HOURS,
  SEALS_ERA,
  SEALS_FIFTH_LEVEL,
  SEALS_PER_LEVEL,
  SEALS_RANK_GOAL,
  SEALS_SIZE_GOAL,
  STORE_WIN_TICKS,
  STORE_WIN_TIMES,
  XP_SOURCES,
  type LevelGift,
  type XpSourceId,
} from '../config/daily';
import { PLACED } from '../config/placed';
import { POLICIES } from '../config/policies';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../config/time';
import { duration, headCount } from '../format';
import { scaleOf } from '../scale';
import { addTimer, cancelTimers } from '../timers';
import type { Daily, GameState, LogEntry } from '../types';
import { hiresBehind, nextSemesterStaff } from './staffing';

/**
 * The daily layer's first stop (DESIGN.md section 42): the University Level,
 * Gold Seals, collecting and "Finish now".
 *
 * Only a game with goals has it: on any other game every function here
 * answers "nothing" and the save's `daily` never changes.
 *
 * Experience only ever rises, and the level is worked out from it. Seals are
 * one balance. What a building holds to collect is worked out from the time
 * since it was last collected, when somebody asks: nothing here runs on a
 * tick except telling a level that was reached.
 */

export function newDaily(tick = 0): Daily {
  return { xp: 0, level: 1, seals: 0, began: tick, since: {}, opened: [], openings: [], games: 0, wins: [], news: [] };
}

/** True on a game that has the layer. */
export function hasDaily(state: GameState): boolean {
  return state.goals !== null && !!state.daily;
}

// ----------------------------------------------------------------- levels --

/** Experience to go from a level to the next. `most` is the most a level asks: today's, unless an older save's. */
export function levelCost(level: number, most = LEVEL_MOST): number {
  return Math.min(most, LEVEL_FIRST + LEVEL_STEP * Math.max(0, level - 1));
}

/**
 * Experience saved under the costs before version 21, moved onto today's: the same level, and the same share of the
 * way into it. A level never falls (DESIGN.md 42.2).
 */
export function relevelXp(xp: number): number {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (left >= levelCost(level, LEVEL_MOST_BEFORE_21)) {
    left -= levelCost(level, LEVEL_MOST_BEFORE_21);
    level += 1;
  }
  let total = 0;
  for (let n = 1; n < level; n++) total += levelCost(n);
  return total + Math.floor((left * levelCost(level)) / levelCost(level, LEVEL_MOST_BEFORE_21));
}

/** The level a total of experience has reached, and how far into it: 1 with none. */
export function levelAt(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (left >= levelCost(level)) {
    left -= levelCost(level);
    level += 1;
  }
  return { level, into: left, need: levelCost(level) };
}

/** What reaching a level gives: its Seals, more at every fifth, and whatever the list of unlocks has for it. */
export function levelGifts(level: number): LevelGift[] {
  const seals = level % 5 === 0 ? SEALS_FIFTH_LEVEL : SEALS_PER_LEVEL;
  return [{ kind: 'seals', count: seals }, ...(LEVEL_UNLOCKS[level] ?? [])];
}

const seals = (n: number): string => `${n} Gold ${n === 1 ? 'Seal' : 'Seals'}`;
const list = (parts: string[]): string => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** A level's gifts in words: "2 Gold Seals". */
export function giftWords(gifts: readonly LevelGift[]): string {
  return list(gifts.map((gift) => (gift.kind === 'seals' ? seals(gift.count) : gift.name)));
}

/**
 * Pay every level the experience has reached and not yet been paid for.
 * With a log the line is said at once. Without one, from an action, it waits
 * in `news` for the next tick, as a policy's line does.
 */
function payLevels(state: GameState, log?: LogEntry[], quiet = false): void {
  const daily = state.daily;
  const reached = levelAt(daily.xp).level;
  if (daily.level >= reached) return;
  const was = daily.level;
  // Several levels reached at once are one line, with everything they gave.
  let sealsGiven = 0;
  const others: LevelGift[] = [];
  while (daily.level < reached) {
    daily.level += 1;
    for (const gift of levelGifts(daily.level)) {
      if (gift.kind === 'seals') sealsGiven += gift.count;
      else others.push(gift);
    }
  }
  daily.seals += sealsGiven;
  if (quiet) return;
  const up = daily.level - was;
  const text = `${state.school.name} reaches University Level ${daily.level}${up > 1 ? `, ${up} levels at once` : ''}: ${giftWords([{ kind: 'seals', count: sealsGiven }, ...others])}.`;
  if (log) log.push({ tick: state.clock.tick, kind: 'level', text, data: { level: daily.level, up, seals: sealsGiven } });
  else daily.news.push(text);
}

/** Add experience. It never falls. */
export function gainXp(state: GameState, xp: number, log?: LogEntry[]): void {
  if (!hasDaily(state) || xp <= 0) return;
  state.daily.xp += Math.floor(xp);
  payLevels(state, log);
}

/** Experience from one of the listed sources, at its listed amount. */
export function earn(state: GameState, source: XpSourceId, log?: LogEntry[], times = 1): void {
  gainXp(state, XP_SOURCES[source].xp * times, log);
}

/** A level reached in an action is told on the next tick: one line each. */
export function tellDaily(state: GameState, log: LogEntry[]): void {
  const news = state.daily?.news;
  if (!news || news.length === 0) return;
  for (const text of news) log.push({ tick: state.clock.tick, kind: 'level', text, data: { level: state.daily.level } });
  state.daily.news = [];
}

// ------------------------------------------------------- what the sim tells --

/**
 * Goals and eras reached (called as they land): experience for each, and
 * Seals. Returns the Seals given, for the goal's own line.
 */
export function dailyOnGoals(state: GameState, ladder: 'size' | 'rank', goals: number, eras: number, log?: LogEntry[]): number {
  if (!hasDaily(state)) return 0;
  const given = goals * (ladder === 'rank' ? SEALS_RANK_GOAL : SEALS_SIZE_GOAL) + eras * SEALS_ERA;
  state.daily.seals += given;
  earn(state, ladder === 'rank' ? 'rankGoal' : 'sizeGoal', log, goals);
  earn(state, 'era', log, eras);
  return given;
}

/** A lot's building finished a stage: growing pays by itself, and a first opening leaves a bonus to collect. */
export function dailyOnBuilt(state: GameState, building: number, wasStage: number, log: LogEntry[]): void {
  if (!hasDaily(state)) return;
  if (wasStage > 0) earn(state, 'grew', log);
  else addOpening(state, 'lot', building);
}

/** A building was placed by hand: it begins to fill from now, and holds an opening bonus. */
export function dailyOnPlaced(state: GameState, placed: number): void {
  if (!hasDaily(state)) return;
  const spot = state.map.placed[placed];
  if (!spot) return;
  const family = PLACED[spot.type].family;
  if (COLLECT[family]) state.daily.since[placed] = state.clock.tick;
  // Furniture is not a building: a bin or a bench opens nothing.
  if (family !== 'bin' && family !== 'seat') addOpening(state, 'placed', placed);
}

/** A building was cleared: what it held goes with it. */
export function dailyOnCleared(state: GameState, kind: 'placed' | 'lot', id: number): void {
  const daily = state.daily;
  if (!daily) return;
  if (kind === 'placed') delete daily.since[id];
  if (daily.opened.some((one) => one.kind === kind && one.id === id)) daily.opened = daily.opened.filter((one) => !(one.kind === kind && one.id === id));
}

/** At most so many opening bonuses in a real day. One past that is simply not given. */
function addOpening(state: GameState, kind: 'placed' | 'lot', id: number): void {
  const daily = state.daily;
  const tick = state.clock.tick;
  daily.openings = daily.openings.filter((at) => at > tick - TICKS_PER_DAY);
  if (daily.openings.length >= OPENINGS_PER_DAY) return;
  daily.openings.push(tick);
  daily.opened.push({ kind, id });
}

/**
 * A home game ended. A win pays by itself and speeds the campus store for a
 * day. The game itself leaves a bonus at the stadium, which holds a few. One
 * more than it holds, or a game with no stadium plot to tap, pays its
 * experience at once: nothing is lost.
 */
export function dailyOnHomeGame(state: GameState, won: boolean, log: LogEntry[]): void {
  if (!hasDaily(state)) return;
  const daily = state.daily;
  if (won) {
    daily.wins = [...daily.wins, state.clock.tick].slice(-6);
    earn(state, 'homeWin', log);
  }
  const plot = state.football.stadium.plot;
  if (plot === null || !state.map.placed[plot] || daily.games >= GAMES_HELD) earn(state, 'homeGame', log);
  else daily.games += 1;
}

// ------------------------------------------------------------- collecting --

export interface Collectable {
  /** 'p12' for a building placed by hand, 'b40' for a dorm or a lecture hall. */
  key: string;
  name: string;
  /** The block of cells it stands on, for the marker. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** What a tap would pay now. */
  xp: number;
  cash: number;
  /** True when its marker shows: it has just opened, a game was played, or it has filled long enough. */
  ready: boolean;
  /** How full it is of the most it holds, 0 to 1. 1 for a bonus that is simply waiting. */
  full: number;
  /** Experience the cap has already cost: what it would hold beyond the most, had it no cap. 0 until it is full. */
  lost: number;
}

/** How long, of a stretch of ticks, fell within a day after a home win. */
function boostedTicks(from: number, to: number, wins: readonly number[]): number {
  let total = 0;
  let covered = from;
  for (const win of [...wins].sort((a, b) => a - b)) {
    const start = Math.max(covered, win);
    const end = Math.min(to, win + STORE_WIN_TICKS);
    if (end > start) {
      total += end - start;
      covered = end;
    }
  }
  return total;
}

/** How long a filling building has filled, in hours, with no limit. */
function hoursSince(state: GameState, placed: number): number {
  const daily = state.daily;
  const from = daily.since[placed] ?? daily.began - HEAD_START_HOURS * TICKS_PER_HOUR;
  return Math.max(0, state.clock.tick - from) / TICKS_PER_HOUR;
}

/**
 * The hours' worth a filling building holds now: the hours it has filled, up
 * to the most, and as many again for the part of them that fell within a day
 * after a home win, for a store.
 */
function hoursHeld(state: GameState, placed: number, family: string): number {
  const daily = state.daily;
  const tick = state.clock.tick;
  const hours = Math.min(COLLECT_HOURS, hoursSince(state, placed));
  if (family !== 'store' || daily.wins.length === 0) return hours;
  const from = tick - Math.round(hours * TICKS_PER_HOUR);
  return hours + ((STORE_WIN_TIMES - 1) * boostedTicks(from, tick, daily.wins)) / TICKS_PER_HOUR;
}

/**
 * Everything on the map that holds something to collect, with what a tap
 * would pay. Worked out from time when asked: the page, the markers and the
 * action all read it here, so they agree. It walks the buildings placed by
 * hand, of which a campus has a hundred or so, and is never called on a tick.
 */
export function collectables(state: GameState): Collectable[] {
  if (!hasDaily(state)) return [];
  const daily = state.daily;
  const scale = scaleOf(state);
  const out = new Map<string, Collectable>();
  const at = (key: string, name: string, x: number, y: number, w: number, h: number): Collectable => {
    let one = out.get(key);
    if (!one) {
      one = { key, name, x, y, w, h, xp: 0, cash: 0, ready: false, full: 0, lost: 0 };
      out.set(key, one);
    }
    return one;
  };
  for (const placed of state.map.placed) {
    if (!placed) continue;
    const spec = PLACED[placed.type];
    const rate = COLLECT[spec.family];
    if (!rate) continue;
    const hours = hoursHeld(state, placed.id, spec.family);
    const xp = Math.floor(rate.xpPerHour * hours);
    if (xp <= 0) continue;
    const one = at(`p${placed.id}`, spec.name, placed.x, placed.y, placed.w, placed.h);
    one.xp += xp;
    one.cash += Math.round(rate.cashPerHour * scale * hours);
    const filled = hoursSince(state, placed.id);
    one.full = Math.min(1, filled / COLLECT_HOURS);
    one.lost = Math.floor(rate.xpPerHour * Math.max(0, filled - COLLECT_HOURS));
    if (filled >= COLLECT_READY_HOURS) one.ready = true;
  }
  // The stadium after a home game.
  const plot = state.football.stadium.plot;
  const stadium = plot === null ? null : state.map.placed[plot];
  if (stadium && daily.games > 0) {
    const one = at(`p${stadium.id}`, 'Stadium', stadium.x, stadium.y, stadium.w, stadium.h);
    one.xp += daily.games * XP_SOURCES.homeGame.xp;
    one.cash += daily.games * GAME_CASH * scale;
    one.full = 1;
    one.ready = true;
  }
  // A building that has just opened.
  for (const opened of daily.opened) {
    if (opened.kind === 'placed') {
      const placed = state.map.placed[opened.id];
      if (!placed) continue;
      const one = at(`p${placed.id}`, PLACED[placed.type].name, placed.x, placed.y, placed.w, placed.h);
      one.xp += XP_SOURCES.placed.xp;
      one.full = Math.max(one.full, 1);
      one.ready = true;
    } else {
      const building = state.map.buildings[opened.id];
      if (!building) continue;
      const one = at(`b${building.id}`, building.zone === 'housing' ? 'Dorm' : 'Lecture hall', building.x, building.y, 1, 1);
      one.xp += XP_SOURCES.opened.xp;
      one.full = 1;
      one.ready = true;
    }
  }
  return [...out.values()];
}

/** Those whose marker shows. */
export function readyToCollect(state: GameState): Collectable[] {
  return collectables(state).filter((one) => one.ready);
}

/**
 * Take what one building holds. Changes the state it is given. Returns what
 * it paid, or null when it holds nothing. With `pay` false the experience is
 * left for the caller to add, so several buildings taken together reach a
 * level in one line.
 */
export function collectOne(state: GameState, key: string, pay = true): { xp: number; cash: number } | null {
  const one = collectables(state).find((each) => each.key === key);
  if (!one || one.xp <= 0) return null;
  const daily = state.daily;
  const tick = state.clock.tick;
  if (key.startsWith('p')) {
    const id = Number(key.slice(1));
    const placed = state.map.placed[id];
    const rate = placed ? COLLECT[PLACED[placed.type].family] : undefined;
    if (placed && rate) {
      // The fraction of an hour short of a whole point of experience is carried, so no rounding is lost.
      const hours = hoursHeld(state, id, PLACED[placed.type].family);
      const carried = hoursSince(state, id) < COLLECT_HOURS ? hours - Math.floor(rate.xpPerHour * hours) / rate.xpPerHour : 0;
      daily.since[id] = tick - Math.round(carried * TICKS_PER_HOUR);
    }
    if (state.football.stadium.plot === id) daily.games = 0;
    if (daily.opened.some((opened) => opened.kind === 'placed' && opened.id === id)) daily.opened = daily.opened.filter((opened) => !(opened.kind === 'placed' && opened.id === id));
  } else {
    const id = Number(key.slice(1));
    daily.opened = daily.opened.filter((opened) => !(opened.kind === 'lot' && opened.id === id));
  }
  state.money.cash += one.cash;
  if (pay) gainXp(state, one.xp);
  return { xp: one.xp, cash: one.cash };
}

/** Take everything whose marker shows. Changes the state it is given. */
export function collectReady(state: GameState): { xp: number; cash: number; count: number } {
  const total = { xp: 0, cash: 0, count: 0 };
  for (const one of readyToCollect(state)) {
    const paid = collectOne(state, one.key, false);
    if (!paid) continue;
    total.xp += paid.xp;
    total.cash += paid.cash;
    total.count += 1;
  }
  gainXp(state, total.xp);
  return total;
}

/** The most a year of collecting can pay in cash, if every building is emptied before it is full. For the money tables. */
export function collectCashPerYear(state: GameState, ticksPerYear: number, homeGames: number): number {
  if (!hasDaily(state)) return 0;
  const scale = scaleOf(state);
  let perHour = 0;
  for (const placed of state.map.placed) {
    if (!placed) continue;
    const rate = COLLECT[PLACED[placed.type].family];
    if (rate) perHour += rate.cashPerHour * scale;
  }
  return (perHour * ticksPerYear) / TICKS_PER_HOUR + homeGames * GAME_CASH * scale;
}

// ------------------------------------------------------------ finish now --

export interface Wait {
  /** 'stadium', 'faculty', or 'policy:' and the policy's id. */
  id: string;
  name: string;
  /** What is being waited for, in words. */
  detail: string;
  ticksLeft: number;
  /** Gold Seals to finish it now. */
  price: number;
}

/** What a wait costs to finish: a Seal for every few hours left, and never less than one. */
export function sealPrice(ticksLeft: number): number {
  return Math.max(1, Math.ceil(ticksLeft / (SEAL_HOURS * TICKS_PER_HOUR)));
}

/**
 * The waits the game has, each with what it costs to finish now. There are
 * three kinds, and all three were in the game before Seals were: a stadium
 * tier going up, faculty hired and on their way, and a policy held until the
 * next class moves in. Nothing here adds a wait.
 */
export function waits(state: GameState): Wait[] {
  if (!hasDaily(state)) return [];
  const out: Wait[] = [];
  const tick = state.clock.tick;
  const wait = (id: string, name: string, detail: string, ticksLeft: number): void => {
    const left = Math.max(1, ticksLeft);
    out.push({ id, name, detail: `${detail} in ${duration(left)}`, ticksLeft: left, price: sealPrice(left) });
  };
  const work = state.football.stadium.work;
  if (work) wait('stadium', `Stadium tier ${work.tier}`, 'It opens', work.done - tick);
  const toClass = ticksToIntake(state.clock);
  if (hiresBehind(state)) {
    const coming = nextSemesterStaff(state).faculty - state.staffing.faculty;
    if (coming > 0) wait('faculty', `${headCount(coming)} faculty on the way`, 'They arrive', toClass);
  }
  for (const id of state.policies.locked) {
    const spec = POLICIES.find((one) => one.id === id);
    if (spec) wait(`policy:${id}`, spec.name, 'Its switch is free again', toClass);
  }
  // The Workshop (DESIGN.md 42.6): what is on a bench and not yet finished.
  state.decor.benches.forEach((bench, index) => {
    if (bench.making !== null && bench.done !== null && bench.done > tick) wait(`craft:${index}`, decorSpec(bench.making)?.name ?? 'The Workshop', 'It is ready', bench.done - tick);
  });
  return out;
}

/** Finish a wait now, for its price in Seals. Changes the state it is given. Returns why not, or null when done. */
export function finishNow(state: GameState, id: string): string | null {
  const wait = waits(state).find((one) => one.id === id);
  if (!wait) return 'There is nothing to finish there.';
  const daily = state.daily;
  if (daily.seals < wait.price) return `That takes ${seals(wait.price)}. You have ${daily.seals}.`;
  daily.seals -= wait.price;
  if (id === 'stadium') {
    const work = state.football.stadium.work!;
    // It opens on the next tick, with its own line, as it would have.
    cancelTimers(state, 'stadiumDone', work.tier);
    work.done = state.clock.tick + 1;
    addTimer(state, work.done, 'stadiumDone', work.tier);
  } else if (id === 'faculty') {
    const next = nextSemesterStaff(state);
    state.staffing.faculty = Math.max(state.staffing.faculty, next.faculty);
    state.staffing.staff = Math.max(state.staffing.staff, next.staff);
  } else if (id.startsWith('craft:')) {
    hurryCraft(state, Number(id.slice('craft:'.length)));
  } else {
    const policy = id.slice('policy:'.length);
    state.policies.locked = state.policies.locked.filter((one) => one !== policy);
  }
  state.money.ratesDirty = true;
  return null;
}

// ---------------------------------------------- a game already in play --

/**
 * A game from before the layer is given the experience its goals, eras and
 * graduations so far have earned, with the Seals of each and of every level
 * that makes, so nobody starts behind. Nothing is said: it loads at its
 * level.
 */
export function backPay(state: GameState): void {
  if (!hasDaily(state)) return;
  const daily = state.daily;
  let xp = 0;
  for (const entry of state.goals!.reached) {
    if (entry.ladder === 'rank') {
      xp += XP_SOURCES.rankGoal.xp;
      daily.seals += SEALS_RANK_GOAL;
    } else if (entry.ladder === 'size') {
      xp += XP_SOURCES.sizeGoal.xp;
      daily.seals += SEALS_SIZE_GOAL;
    } else {
      xp += XP_SOURCES.era.xp;
      daily.seals += SEALS_ERA;
    }
  }
  xp += state.classes.filter((record) => record.finishedOnTime + record.finishedLate > 0).length * XP_SOURCES.graduation.xp;
  daily.xp += xp;
  payLevels(state, undefined, true);
}
