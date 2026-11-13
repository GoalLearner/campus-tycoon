import { GRADUATION_TICK_IN_YEAR, spanOf, tickOfDate, yearLength } from '../calendar';
import { HOMECOMING_SLOT, RIVALRY_SLOT, SLOTS } from '../config/football';
import type { PolicyEffect } from '../config/policies';
import { FINALS_MEASURE_BEFORE } from '../config/rhythm';
import { TICKS_PER_HOUR } from '../config/time';
import { AT_RISK_HOURS, TRADITION_HALF, TRADITION_QUAD, TRADITION_SLOTS, TRADITIONS, TROPHY_AWAY_SHARE, type TraditionCondition, type TraditionDay, type TraditionSpec } from '../config/traditions';
import { duration, shortName } from '../format';
import { addTimer } from '../timers';
import type { GameState, KeptTradition, LogEntry, Traditions, Week } from '../types';
import { hasDaily } from './daily';
import { teamName } from './football';
import { eraOf } from './goals';
import { inReach } from './placed';
import { roadsByAccess } from './town';

/**
 * Traditions (DESIGN.md 14.2, adapted and built in section 50). A campus with
 * goals picks them as its slots open. Each is checked on its day by a timer,
 * or at the end of the rivalry game for the two that belong to it. A
 * tradition kept adds one to its count; one not met that year does not count,
 * and nothing is taken. What each lifts is read through the same hooks the
 * policies use, named for the tradition on that number's line: no fifth cause
 * and no rank points.
 */

export function newTraditions(): Traditions {
  return { began: false, slots: 0, chosen: [], trophy: false, news: [] };
}

export function traditionSpec(id: string): TraditionSpec | undefined {
  return TRADITIONS.find((spec) => spec.id === id);
}

/** How many traditions this campus may keep now: one from its first commencement, and one with each era. */
export function traditionSlots(state: GameState): number {
  if (!hasDaily(state) || !state.traditions) return 0;
  return Math.min(TRADITION_SLOTS, (state.traditions.began ? 1 : 0) + eraOf(state.goals!));
}

/** True when a slot is open and nothing is chosen for it yet. */
export function traditionToChoose(state: GameState): boolean {
  return traditionSlots(state) > (state.traditions?.chosen.length ?? 0);
}

// ---------------------------------------------------------- the calendar --

/** The tick of a day in one school year. */
function dayIn(week: Week, day: TraditionDay): number | null {
  switch (day) {
    case 'opener':
      return tickOfDate(week, SLOTS[0]!.date);
    case 'homecoming':
      return tickOfDate(week, SLOTS[HOMECOMING_SLOT]!.date);
    case 'rivalryEve':
    case 'rivalryGame':
      return tickOfDate(week, SLOTS[RIVALRY_SLOT]!.date);
    case 'fallFinals':
    case 'springFinals': {
      const span = spanOf(week, day);
      return span ? span.to - FINALS_MEASURE_BEFORE : null;
    }
    case 'commencement':
      return week.start + GRADUATION_TICK_IN_YEAR;
  }
}

/** The next time a day comes, after now, and the school year it belongs to. */
export function nextDay(state: GameState, day: TraditionDay): { at: number; year: number } | null {
  const week = state.clock.week;
  const next: Week = { year: week.year + 1, start: week.start + yearLength(week), extra: 0 };
  for (const w of [week, next]) {
    const at = dayIn(w, day);
    if (at !== null && at > state.clock.tick) return { at, year: w.year };
  }
  return null;
}

// --------------------------------------------------------- the conditions --

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function kindAt(state: GameState, x: number, y: number): string | null {
  const map = state.map;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.cells[y * map.width + x]!.kind;
}

function placedOf(state: GameState, type: string): GameState['map']['placed'][number] | null {
  return state.map.placed.find((placed) => placed?.type === type) ?? null;
}

/** True when a building has a cell of this kind beside it. */
function besideKind(state: GameState, placed: NonNullable<GameState['map']['placed'][number]>, kinds: ReadonlySet<string>): boolean {
  for (let y = placed.y - 1; y <= placed.y + placed.h; y++) {
    for (let x = placed.x - 1; x <= placed.x + placed.w; x++) {
      const inside = x >= placed.x && x < placed.x + placed.w && y >= placed.y && y < placed.y + placed.h;
      if (!inside && kinds.has(kindAt(state, x, y) ?? '')) return true;
    }
  }
  return false;
}

const PATHS = new Set(['path']);

/** Whether a tradition's condition holds now. */
export function conditionHolds(state: GameState, condition: TraditionCondition): boolean {
  const map = state.map;
  switch (condition) {
    case 'always':
      return true;
    case 'quadInSafety': {
      let quads = 0;
      for (let i = 0; i < map.cells.length && quads < TRADITION_QUAD; i++) {
        if (map.cells[i]!.kind !== 'quad') continue;
        const x = i % map.width;
        if (inReach(map, 'safety', x, (i - x) / map.width).length > 0) quads += 1;
      }
      return quads >= TRADITION_QUAD;
    }
    case 'ownStadium':
      return state.football.stadium.tier >= 1;
    case 'fountainByPath': {
      const fountain = placedOf(state, 'fountain');
      return fountain !== null && besideKind(state, fountain, PATHS);
    }
    case 'roadToStadium': {
      const plot = state.football.stadium.plot;
      const stadium = plot === null ? null : map.placed[plot];
      if (!stadium) return false;
      const linked = new Set(roadsByAccess(map).linked.map(([x, y]) => y * map.width + x));
      for (let y = stadium.y - 1; y <= stadium.y + stadium.h; y++) {
        for (let x = stadium.x - 1; x <= stadium.x + stadium.w; x++) if (x >= 0 && y >= 0 && x < map.width && y < map.height && linked.has(y * map.width + x)) return true;
      }
      return false;
    }
    case 'bellTower':
      return placedOf(state, 'bellTower') !== null;
    case 'quadWithPath': {
      let quads = 0;
      let besidePath = false;
      for (let i = 0; i < map.cells.length; i++) {
        if (map.cells[i]!.kind !== 'quad') continue;
        quads += 1;
        if (besidePath) continue;
        const x = i % map.width;
        const y = (i - x) / map.width;
        besidePath = ORTHO.some(([dx, dy]) => kindAt(state, x + dx, y + dy) === 'path');
      }
      return quads >= TRADITION_QUAD && besidePath;
    }
    case 'lateDiner':
      return placedOf(state, 'diner') !== null;
  }
}

// ----------------------------------------------------------- choosing --

/** Choose a tradition for an open slot. Changes the state it is given. Returns why not, or null when done. */
export function chooseTradition(state: GameState, id: string): string | null {
  const spec = traditionSpec(id);
  if (!spec) return 'There is no such tradition.';
  if (!hasDaily(state) || !state.traditions) return 'Traditions come with a campus that has goals.';
  if (state.traditions.chosen.some((one) => one.id === id)) return `${spec.name} is a tradition here already.`;
  if (!traditionToChoose(state)) return traditionSlots(state) >= TRADITION_SLOTS ? 'Every place for a tradition is taken.' : 'The next tradition comes with the next era.';
  const kept: KeptTradition = { id, chosen: state.clock.tick, kept: 0, years: [], warned: 0 };
  state.traditions.chosen.push(kept);
  schedule(state, state.traditions.chosen.length - 1);
  state.traditions.news.push(`${spec.name} is a tradition of ${state.school.name} now. Its day: ${spec.when.charAt(0).toLowerCase()}${spec.when.slice(1)}.`);
  return null;
}

/** Set the timer of a chosen tradition's next day. The two of the rivalry game are told by the game itself. */
function schedule(state: GameState, index: number): void {
  const spec = traditionSpec(state.traditions.chosen[index]!.id);
  if (!spec || spec.day === 'rivalryGame') return;
  const next = nextDay(state, spec.day);
  if (next) addTimer(state, next.at, 'tradition', index);
}

// ------------------------------------------------------------- its day --

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** A tradition's day: kept, and told with its count; or not met, and told that it waits for next year. */
function record(state: GameState, chosen: KeptTradition, spec: TraditionSpec, met: boolean, log: LogEntry[], wins = 0): void {
  const year = state.clock.week.year;
  if (chosen.years.some(([one]) => one === year)) return;
  chosen.years.push([year, met ? 1 : 0]);
  if (met) {
    chosen.kept += 1;
    const text = spec.kept
      .replace('{n}', ordinal(chosen.kept))
      .replace('{rival}', teamName(state, state.football.rival))
      .replace('{wins}', wins === 1 ? 'one home win' : `${wins} home wins`);
    log.push({ tick: state.clock.tick, kind: 'tradition', text, data: { tradition: spec.id, kept: chosen.kept, keep: 1, headline: headline(state, spec, chosen.kept) } });
  } else {
    log.push({ tick: state.clock.tick, kind: 'tradition', text: `No ${spec.name} this year: it needs ${needsWords(spec)}. It is kept for next year, and nothing is lost.`, data: { tradition: spec.id, missed: 1 } });
  }
}

/** A condition inside a sentence: "a Late-night diner on campus". A name, such as Founders' Fountain, keeps its capital. */
const needsWords = (spec: TraditionSpec): string => {
  const first = spec.needs.split(' ')[0]!;
  const words = ['A', 'An', 'The', 'Six', 'Nothing'].includes(first) ? `${spec.needs.charAt(0).toLowerCase()}${spec.needs.slice(1)}` : spec.needs;
  return words.split('. ')[0]!;
};

/** The paper's headline for a tradition kept: "Larp Keeps Its 4th Homecoming Parade". */
function headline(state: GameState, spec: TraditionSpec, kept: number): string {
  return `${shortName(state.school.name)} Keeps Its ${ordinal(kept)} ${spec.name}; Alumni Say It Was Better in Their Day`;
}

/** The timer of a chosen tradition fired: its day has come. */
export function traditionDue(state: GameState, index: number, log: LogEntry[]): void {
  const chosen = state.traditions?.chosen[index];
  const spec = chosen ? traditionSpec(chosen.id) : undefined;
  if (!chosen || !spec || !hasDaily(state)) return;
  record(state, chosen, spec, conditionHolds(state, spec.condition), log);
  schedule(state, index);
}

/** The home wins of this fall's regular season so far. */
function homeWinsThisFall(state: GameState): number {
  const games = state.football.season?.games ?? [];
  let wins = 0;
  for (const game of games) {
    if (!game.home || game.slot < 0 || game.slot > 9 || game.us.length === 0) continue;
    const us = game.us.reduce((a, b) => a + b, 0);
    const them = game.them.reduce((a, b) => a + b, 0);
    if (us > them) wins += 1;
  }
  return wins;
}

/** A football game ended. The rivalry game decides who holds the trophy, and is the day of the trophy and the bell. */
export function traditionsOnGame(state: GameState, slot: number, won: boolean, log: LogEntry[]): void {
  if (!hasDaily(state) || !state.traditions || slot !== RIVALRY_SLOT) return;
  state.traditions.trophy = won;
  for (const chosen of state.traditions.chosen) {
    const spec = traditionSpec(chosen.id);
    if (!spec || spec.day !== 'rivalryGame') continue;
    const wins = homeWinsThisFall(state);
    const met = spec.condition === 'bellTower' ? conditionHolds(state, 'bellTower') && wins > 0 : conditionHolds(state, spec.condition);
    record(state, chosen, spec, met, log, wins);
  }
}

/** Commencement: the first one opens the first place for a tradition. */
export function traditionsOnGraduation(state: GameState): void {
  if (!hasDaily(state) || !state.traditions) return;
  state.traditions.began = true;
}

/**
 * The start of a day: a place newly open is told once; and a tradition whose day is near and whose condition does not
 * hold is said to be at risk, once a year, so there is time to put it right.
 */
export function traditionsOnDayStart(state: GameState, log: LogEntry[]): void {
  if (!hasDaily(state) || !state.traditions) return;
  const traditions = state.traditions;
  const slots = traditionSlots(state);
  if (slots > traditions.slots) {
    traditions.slots = slots;
    if (traditionToChoose(state)) {
      log.push({
        tick: state.clock.tick,
        kind: 'tradition',
        text: slots === 1 ? `${state.school.name} can begin its first tradition: eight to choose from, on the Traditions page behind the student count.` : 'A new tradition can be chosen, on the Traditions page behind the student count.',
        data: { slot: slots },
      });
    }
  }
  for (const chosen of traditions.chosen) {
    const spec = traditionSpec(chosen.id);
    if (!spec || spec.condition === 'always') continue;
    const next = nextDay(state, spec.day);
    if (!next || next.at - state.clock.tick > AT_RISK_HOURS * TICKS_PER_HOUR || chosen.warned === next.year) continue;
    if (conditionHolds(state, spec.condition)) continue;
    chosen.warned = next.year;
    log.push({ tick: state.clock.tick, kind: 'tradition', text: `The ${spec.name} is at risk: it needs ${needsWords(spec)}. Its day is in ${duration(next.at - state.clock.tick)}.`, data: { tradition: spec.id, atRisk: 1 } });
  }
}

/** Lines waiting from an action are said on the next tick. */
export function tellTraditions(state: GameState, log: LogEntry[]): void {
  const news = state.traditions?.news;
  if (!news || news.length === 0) return;
  for (const text of news) log.push({ tick: state.clock.tick, kind: 'tradition', text, data: { chosen: 1 } });
  state.traditions.news = [];
}

// ---------------------------------------------------------- what it lifts --

/** How much of its lift a tradition gives now: by the times it has been kept, and the trophy by who holds it. */
export function traditionShare(state: GameState, chosen: KeptTradition): number {
  const share = chosen.kept / (chosen.kept + TRADITION_HALF);
  return chosen.id === 'rivalryTrophy' && !state.traditions.trophy ? share * TROPHY_AWAY_SHARE : share;
}

/**
 * The traditions' lifts, as the policies' effects, each named for its tradition, for the hooks the policies already
 * have. Read from the counts alone: nothing on the map is looked at, so it costs nothing on a tick.
 */
export function traditionEffects(state: GameState): Array<{ spec: { id: string; name: string }; effect: PolicyEffect }> {
  const chosen = state.traditions?.chosen;
  if (!chosen || chosen.length === 0 || !state.goals) return [];
  const out: Array<{ spec: { id: string; name: string }; effect: PolicyEffect }> = [];
  for (const one of chosen) {
    if (one.kept <= 0) continue;
    const spec = traditionSpec(one.id);
    if (!spec) continue;
    const share = traditionShare(state, one);
    const lift = spec.lift;
    const effect: PolicyEffect =
      lift.kind === 'cause'
        ? { kind: 'cause', cause: lift.cause, points: Math.round(lift.points * share * 10) / 10, among: 'everyone' }
        : lift.kind === 'exams'
          ? { kind: 'exams', points: Math.round(lift.points * share * 10) / 10 }
          : { kind: 'fans', lift: Math.round(lift.lift * share * 1000) / 1000 };
    out.push({ spec: { id: `tradition.${spec.id}`, name: spec.name }, effect });
  }
  return out;
}
