import {
  CRAFT_XP,
  DECOR,
  SEASON_SETS,
  TOWN_DECOR_EACH,
  WORKSHOP_BENCHES,
  WORKSHOP_SECOND_SEALS,
  type DecorSpec,
  type SeasonSet,
} from '../config/decor';
import { realDate } from '../calendar';
import { TICKS_PER_HOUR } from '../config/time';
import { dollars, duration } from '../format';
import { scaleOf } from '../scale';
import { addTimer, cancelTimers } from '../timers';
import type { Bench, Decor, GameState, LogEntry, Placed } from '../types';
import { gainXp, hasDaily } from './daily';
import { ordersCount } from './orders';
import { addPlaced, previewPlace, removePlaced } from './placed';

/**
 * Decorations and the Workshop (DESIGN.md 42.5 and 42.6, as built from
 * 42.20).
 *
 * A decoration on the map is a hand-placed thing of the one type 'decor',
 * with its own id beside it. One not on the map is a count in storage.
 * Nothing is ever sold or lost: clearing one, or putting it away, sends it
 * to storage, and placing one from storage is free.
 *
 * Nothing here runs on a tick. What a decoration does to how a lot looks is
 * worked out when the map changes, with the rest of a lot's score. The
 * Workshop is a tick stored on each bench, and one timer to tell the paper.
 *
 * Only a game with goals has any of it.
 */

export function newDecor(): Decor {
  return { stored: {}, benches: [{ recipe: null, making: null, done: null }], tally: {}, season: '' };
}

export function decorSpec(id: string | null | undefined): DecorSpec | undefined {
  return id ? DECOR.find((spec) => spec.id === id) : undefined;
}

/** The drawing for a decoration on this campus: a banner takes the school's colour. */
export function decorSprite(state: GameState, id: string | undefined): string {
  const spec = decorSpec(id);
  if (!spec) return 'decoration.flowers';
  return spec.colour ? `${spec.sprite}.${state.football.colour}` : spec.sprite;
}

const bump = (decor: Decor, what: string, by = 1): void => {
  decor.tally[what] = (decor.tally[what] ?? 0) + by;
};

/** How many of one decoration stand on the map. */
export function decorPlaced(state: GameState, id: string): number {
  let n = 0;
  for (const placed of state.map.placed) if (placed && placed.type === 'decor' && placed.decor === id) n += 1;
  return n;
}

/** How many of one decoration the campus owns: on the map and in storage. */
export function decorOwned(state: GameState, id: string): number {
  return (state.decor.stored[id] ?? 0) + decorPlaced(state, id);
}

/** Every decoration owned, for the counts the long run prints. */
export function decorCounts(state: GameState): { owned: number; placed: number; stored: number; kinds: number } {
  let placed = 0;
  const kinds = new Set<string>();
  for (const one of state.map.placed) {
    if (one && one.type === 'decor' && one.decor) {
      placed += 1;
      kinds.add(one.decor);
    }
  }
  let stored = 0;
  for (const [id, n] of Object.entries(state.decor.stored)) {
    if (n > 0) {
      stored += n;
      kinds.add(id);
    }
  }
  return { owned: placed + stored, placed, stored, kinds: kinds.size };
}

// ----------------------------------------------------------- the seasons --

/** True when a real date falls inside a set's days. A set may run over the new year. */
function inSet(set: SeasonSet, month: number, day: number): boolean {
  const at = month * 100 + day;
  const from = set.from[0] * 100 + set.from[1];
  const to = set.to[0] * 100 + set.to[1];
  return from <= to ? at >= from && at <= to : at >= from || at <= to;
}

/**
 * The seasonal set that is live now, by the real date on the game's own
 * clock. null between sets. The clock's next tick is the one number that
 * moves with every tick of a catch-up, so a set opens on its day even in the
 * middle of a month away.
 */
export function liveSeason(state: GameState): SeasonSet | null {
  const { month, day } = realDate(state.clock.nextTickAt);
  return SEASON_SETS.find((set) => inSet(set, month, day)) ?? null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A set's dates in words: "1 October to 30 November". */
export function seasonDates(set: SeasonSet): string {
  return `${set.from[1]} ${MONTHS[set.from[0] - 1]} to ${set.to[1]} ${MONTHS[set.to[0] - 1]}`;
}

/** Once a real day: when a seasonal set has just opened, the paper says so, once. */
export function decorOnDayStart(state: GameState, log: LogEntry[]): void {
  if (!hasDaily(state)) return;
  const live = liveSeason(state);
  const id = live?.id ?? '';
  if (id === state.decor.season) return;
  state.decor.season = id;
  if (!live) return;
  const count = DECOR.filter((spec) => spec.home.kind === 'season' && spec.home.season === live.id).length;
  log.push({
    tick: state.clock.tick,
    kind: 'season',
    text: `The ${live.name.toLowerCase()} set is on the Decor shelf until ${live.to[1]} ${MONTHS[live.to[0] - 1]}: ${count} decorations for the season. What you buy is yours for good, and the set comes back every year.`,
    data: { count },
  });
}

// ------------------------------------------------------------ the shelves --

/** How a decoration would be got if it were placed now. */
export type DecorWay = 'storage' | 'cash' | 'seals';

export interface DecorOffer {
  spec: DecorSpec;
  stored: number;
  placed: number;
  /** How placing one now would be paid for. null when it cannot be got now. */
  way: DecorWay | null;
  /** Its price in cash on this campus, where it has one. */
  cost: number;
  /** Its price in Gold Seals, where it has one. */
  seals: number;
  /** Why it cannot be bought now, in a few words. '' when it can, or when one is in storage. */
  locked: string;
}

/** Where one decoration stands for this campus: what is owned, and how another could be got. */
export function decorOffer(state: GameState, id: string): DecorOffer | null {
  const spec = decorSpec(id);
  if (!spec || !hasDaily(state)) return null;
  const stored = state.decor.stored[id] ?? 0;
  const placed = decorPlaced(state, id);
  const home = spec.home;
  const scale = scaleOf(state);
  let way: DecorWay | null = null;
  let cost = 0;
  let seals = 0;
  let locked = '';
  switch (home.kind) {
    case 'shelf':
      cost = home.cost * scale;
      if (state.daily.level >= home.level) way = 'cash';
      else locked = `Level ${home.level}`;
      break;
    case 'seals':
      seals = home.price;
      way = 'seals';
      break;
    case 'season': {
      cost = home.cost * scale;
      const set = SEASON_SETS.find((one) => one.id === home.season);
      if (liveSeason(state)?.id === home.season) way = 'cash';
      else locked = set ? `${set.name} set: ${seasonDates(set)}` : 'Out of season';
      break;
    }
    case 'town':
      locked = "From the town's orders";
      break;
    case 'workshop':
      locked = state.daily.level >= home.level ? 'Made in the Workshop' : `Workshop recipe at Level ${home.level}`;
      break;
    case 'founder':
      locked = "With the Founder's Pack, later";
      break;
  }
  if (stored > 0) {
    way = 'storage';
    locked = '';
  }
  return { spec, stored, placed, way, cost, seals, locked };
}

/** Every decoration, in the order of the list. */
export function decorOffers(state: GameState): DecorOffer[] {
  if (!hasDaily(state)) return [];
  return DECOR.map((spec) => decorOffer(state, spec.id)!);
}

// ------------------------------------------------- placing, moving, storing --

export type DecorProblem = 'offMap' | 'blocked' | 'cash' | 'seals' | 'locked';

export interface DecorPreview {
  id: string;
  x: number;
  y: number;
  way: DecorWay | null;
  cost: number;
  seals: number;
  problem: DecorProblem | null;
}

/** What placing a decoration here would do, without doing it. Drives the ghost. */
export function previewDecor(state: GameState, id: string, x: number, y: number): DecorPreview {
  const offer = decorOffer(state, id);
  const spot = previewPlace(state, 'decor', x, y).problem;
  let problem: DecorProblem | null = spot === 'offMap' || spot === 'blocked' ? spot : null;
  const way = offer?.way ?? null;
  const cost = way === 'cash' ? (offer?.cost ?? 0) : 0;
  const seals = way === 'seals' ? (offer?.seals ?? 0) : 0;
  if (problem === null) {
    if (way === null) problem = 'locked';
    else if (cost > state.money.cash) problem = 'cash';
    else if (seals > state.daily.seals) problem = 'seals';
  }
  return { id, x, y, way, cost, seals, problem };
}

const SPOT_ERROR = {
  offMap: 'That does not fit on your land.',
  blocked: 'Something is in the way. It needs empty ground.',
} as const;

/**
 * Place a decoration: one from storage if there is one, which is free, and
 * otherwise bought from its shelf. Changes the state it is given. Returns
 * what it cost, or why not.
 */
export function placeDecor(state: GameState, id: string, x: number, y: number, flip = false): { placed: Placed; way: DecorWay; cost: number; seals: number } | string {
  const offer = decorOffer(state, id);
  if (!offer) return 'There is no such decoration.';
  const preview = previewDecor(state, id, x, y);
  if (preview.problem === 'offMap' || preview.problem === 'blocked') return SPOT_ERROR[preview.problem];
  if (preview.problem === 'locked') return `${offer.spec.name}: ${offer.locked}.`;
  if (preview.problem === 'cash') return `That costs ${dollars(preview.cost)}. You have ${dollars(state.money.cash)}.`;
  if (preview.problem === 'seals') return `That takes ${preview.seals} Gold Seals. You have ${state.daily.seals}.`;
  const way = preview.way!;
  const decor = state.decor;
  if (way === 'storage') decor.stored[id] = (decor.stored[id] ?? 0) - 1;
  else if (way === 'cash') {
    state.money.cash -= preview.cost;
    state.money.yearSpent += preview.cost;
    bump(decor, 'bought');
  } else {
    state.daily.seals -= preview.seals;
    bump(decor, 'sealsSpent', preview.seals);
    bump(decor, 'boughtSeals');
  }
  const placed = addPlaced(state.map, 'decor', x, y, state.clock.tick);
  placed.decor = id;
  if (flip && offer.spec.turns) placed.flip = true;
  bump(decor, 'placed');
  ordersCount(state, 'decorPlaced');
  return { placed, way, cost: preview.cost, seals: preview.seals };
}

function decorAt(state: GameState, placedId: number): Placed | null {
  const placed = state.map.placed[placedId];
  return placed && placed.type === 'decor' && placed.decor ? placed : null;
}

/** Move a decoration to another spot. It is free. Changes the state it is given. Returns why not, or null when done. */
export function moveDecor(state: GameState, placedId: number, x: number, y: number): string | null {
  const placed = decorAt(state, placedId);
  if (!placed) return 'That is not a decoration.';
  if (placed.x === x && placed.y === y) return null;
  const spot = previewPlace(state, 'decor', x, y).problem;
  if (spot === 'offMap' || spot === 'blocked') return SPOT_ERROR[spot];
  const { decor, flip } = placed;
  removePlaced(state.map, placedId);
  const moved = addPlaced(state.map, 'decor', x, y, state.clock.tick);
  if (decor) moved.decor = decor;
  if (flip) moved.flip = true;
  return null;
}

/** Put a decoration away. It goes to storage, and can be placed again for nothing. */
export function storeDecor(state: GameState, placedId: number): string | null {
  const placed = decorAt(state, placedId);
  if (!placed) return 'That is not a decoration.';
  state.decor.stored[placed.decor!] = (state.decor.stored[placed.decor!] ?? 0) + 1;
  removePlaced(state.map, placedId);
  return null;
}

/** Turn a decoration that runs one way to run the other. */
export function turnDecor(state: GameState, placedId: number): string | null {
  const placed = decorAt(state, placedId);
  if (!placed) return 'That is not a decoration.';
  if (!decorSpec(placed.decor)?.turns) return 'That one looks the same from every side.';
  if (placed.flip) delete placed.flip;
  else placed.flip = true;
  return null;
}

// --------------------------------------------------------------- the town --

/**
 * The decoration a town order would pay now: the one of the town's own that
 * the campus holds fewest of. null once it holds `TOWN_DECOR_EACH` of every
 * one, when the town goes back to paying experience.
 */
export function townGift(state: GameState): string | null {
  let pick: string | null = null;
  let fewest = TOWN_DECOR_EACH;
  for (const spec of DECOR) {
    if (spec.home.kind !== 'town') continue;
    const have = decorOwned(state, spec.id);
    if (have < fewest) {
      fewest = have;
      pick = spec.id;
    }
  }
  return pick;
}

/** A decoration given, by an order: it goes to storage. */
export function giveDecor(state: GameState, id: string): void {
  if (!decorSpec(id)) return;
  state.decor.stored[id] = (state.decor.stored[id] ?? 0) + 1;
  bump(state.decor, 'given');
}

// ----------------------------------------------------------- the Workshop --

/** The Workshop is in the Makerspace: a campus with none has no Workshop until it builds one. */
export function hasMakerspace(state: GameState): boolean {
  return state.map.placed.some((placed) => placed && placed.type === 'makerspace');
}

/** The recipes this campus's level has brought. */
export function recipesOpen(state: GameState): DecorSpec[] {
  if (!hasDaily(state)) return [];
  return DECOR.filter((spec) => spec.home.kind === 'workshop' && state.daily.level >= spec.home.level);
}

/** True when the Workshop can make something: there is a Makerspace, and a level has brought a recipe. */
export function workshopOpen(state: GameState): boolean {
  return hasDaily(state) && hasMakerspace(state) && recipesOpen(state).length > 0;
}

function recipeOf(id: string | null): (DecorSpec & { home: { kind: 'workshop'; level: number; hours: number; cost: number } }) | null {
  const spec = decorSpec(id);
  return spec && spec.home.kind === 'workshop' ? (spec as DecorSpec & { home: { kind: 'workshop'; level: number; hours: number; cost: number } }) : null;
}

/** Begin the bench's standing recipe, if it has one, nothing is on it and the campus can pay. Returns why not. */
function startCraft(state: GameState, index: number): string | null {
  const bench = state.decor.benches[index];
  if (!bench || bench.making !== null) return null;
  const recipe = recipeOf(bench.recipe);
  if (!recipe) return null;
  if (!hasMakerspace(state)) return 'The Workshop is in the Makerspace. Build one first.';
  const cost = recipe.home.cost * scaleOf(state);
  if (cost > state.money.cash) return `${recipe.name} costs ${dollars(cost)} to make. You have ${dollars(state.money.cash)}.`;
  state.money.cash -= cost;
  state.money.yearSpent += cost;
  bench.making = recipe.id;
  bench.done = state.clock.tick + recipe.home.hours * TICKS_PER_HOUR;
  addTimer(state, bench.done, 'craftDone', index);
  return null;
}

/**
 * Choose what a bench makes, or null to stop it. It is a standing choice:
 * the bench makes that until told otherwise, one at a time, and a new one
 * begins when the finished one is collected. Whatever is on the bench now is
 * finished first.
 */
export function setRecipe(state: GameState, index: number, recipe: string | null): string | null {
  const bench = state.decor.benches[index];
  if (!bench) return 'The Workshop has no such bench.';
  if (recipe !== null) {
    const spec = recipeOf(recipe);
    if (!spec) return 'The Workshop cannot make that.';
    if (state.daily.level < spec.home.level) return `${spec.name} is a recipe for Level ${spec.home.level}.`;
    if (!hasMakerspace(state)) return 'The Workshop is in the Makerspace. Build one first.';
  }
  bench.recipe = recipe;
  return startCraft(state, index);
}

/** True when what is on a bench is finished and waiting. It waits for ever. */
export function craftReady(state: GameState, bench: Bench): boolean {
  return bench.making !== null && bench.done !== null && state.clock.tick >= bench.done;
}

/**
 * Collect what a bench has finished: it goes to storage, with a little
 * experience, and the bench begins its recipe again. Returns what was made,
 * or why not.
 */
export function collectCraft(state: GameState, index: number): { id: string; xp: number; next: string | null } | string {
  const bench = state.decor.benches[index];
  if (!bench || bench.making === null) return 'Nothing is on that bench.';
  if (!craftReady(state, bench)) return `That is ready in ${duration(bench.done! - state.clock.tick)}.`;
  const id = bench.making;
  state.decor.stored[id] = (state.decor.stored[id] ?? 0) + 1;
  bump(state.decor, 'crafted');
  bench.making = null;
  bench.done = null;
  ordersCount(state, 'crafts');
  gainXp(state, CRAFT_XP);
  // The standing choice: the next one begins at once, if the campus can pay for it.
  const next = startCraft(state, index);
  return { id, xp: CRAFT_XP, next };
}

/** Finish what is on a bench on the next tick. The caller has taken the Seals. */
export function hurryCraft(state: GameState, index: number): void {
  const bench = state.decor.benches[index];
  if (!bench || bench.making === null) return;
  cancelTimers(state, 'craftDone', index);
  bench.done = state.clock.tick + 1;
  addTimer(state, bench.done, 'craftDone', index);
}

/** The Workshop's second bench, for Gold Seals, once. */
export function buyBench(state: GameState): string | null {
  const decor = state.decor;
  if (decor.benches.length >= WORKSHOP_BENCHES) return `The Workshop has ${WORKSHOP_BENCHES} benches, which is all it holds.`;
  if (state.daily.seals < WORKSHOP_SECOND_SEALS) return `A second bench takes ${WORKSHOP_SECOND_SEALS} Gold Seals. You have ${state.daily.seals}.`;
  state.daily.seals -= WORKSHOP_SECOND_SEALS;
  bump(decor, 'sealsSpent', WORKSHOP_SECOND_SEALS);
  decor.benches.push({ recipe: null, making: null, done: null });
  return null;
}

/** A craft's timer has come due: the paper says it is ready. Nothing else changes, and it waits for ever. */
export function onCraftDone(state: GameState, index: number, due: number, log: LogEntry[]): void {
  const bench = state.decor?.benches[index];
  if (!bench || bench.making === null || bench.done !== due) return;
  const spec = decorSpec(bench.making);
  if (!spec) return;
  const words = spec.a.charAt(0).toUpperCase() + spec.a.slice(1);
  log.push({ tick: state.clock.tick, kind: 'craft', text: `${words} ${isPlural(spec) ? 'are' : 'is'} ready at the Workshop.`, data: { bench: index } });
}

/** "Stepping stones are ready", not "is". */
function isPlural(spec: DecorSpec): boolean {
  return !/^an? /.test(spec.a);
}

export interface BenchView {
  index: number;
  /** What it makes as a standing choice. '' while idle. */
  recipe: string;
  /** What is on it now. '' with nothing on it. */
  making: string;
  ready: boolean;
  /** "Ready in 1 d 2 h", "Ready to collect", or "Idle". */
  line: string;
  ticksLeft: number;
}

export interface RecipeView {
  id: string;
  name: string;
  sprite: string;
  /** "1 d · $22,400". */
  line: string;
  /** '' when it can be made, or "Level 19". */
  locked: string;
  owned: number;
}

export interface WorkshopView {
  /** False on a campus with no Makerspace: the page then says to build one. */
  makerspace: boolean;
  benches: BenchView[];
  recipes: RecipeView[];
  /** Gold Seals for the second bench, or 0 when it has both. */
  secondBench: number;
}

/** The Workshop page. null on a game without the layer. */
export function workshopView(state: GameState): WorkshopView | null {
  if (!hasDaily(state)) return null;
  const tick = state.clock.tick;
  const scale = scaleOf(state);
  const benches = state.decor.benches.map((bench, index): BenchView => {
    const ready = craftReady(state, bench);
    const left = bench.making !== null && bench.done !== null ? Math.max(0, bench.done - tick) : 0;
    return {
      index,
      recipe: decorSpec(bench.recipe)?.name ?? '',
      making: decorSpec(bench.making)?.name ?? '',
      ready,
      line: bench.making === null ? 'Idle' : ready ? 'Ready to collect' : `Ready in ${duration(left)}`,
      ticksLeft: left,
    };
  });
  const recipes = DECOR.filter((spec) => spec.home.kind === 'workshop').map((spec): RecipeView => {
    const home = spec.home as { kind: 'workshop'; level: number; hours: number; cost: number };
    return {
      id: spec.id,
      name: spec.name,
      sprite: decorSprite(state, spec.id),
      line: `${duration(home.hours * TICKS_PER_HOUR)} · ${dollars(home.cost * scale)}`,
      locked: state.daily.level >= home.level ? '' : `Level ${home.level}`,
      owned: decorOwned(state, spec.id),
    };
  });
  return { makerspace: hasMakerspace(state), benches, recipes, secondBench: state.decor.benches.length < WORKSHOP_BENCHES ? WORKSHOP_SECOND_SEALS : 0 };
}

/** How many benches hold something finished: for the marker over the Makerspace and the button. */
export function craftsReady(state: GameState): number {
  if (!hasDaily(state)) return 0;
  return state.decor.benches.filter((bench) => craftReady(state, bench)).length;
}
