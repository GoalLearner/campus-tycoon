import { GRADUATION_TICK_IN_YEAR, SPRING_INTAKE_TICK_IN_YEAR, yearLength } from '../calendar';
import { LEVEL_UNLOCKS } from '../config/daily';
import { ADVISORS } from '../config/inbox';
import {
  GIVERS,
  ORDER_CASH_YEAR,
  ORDER_KINDS,
  ORDER_LEAST_HOURS,
  ORDER_MARKS_KEPT,
  ORDER_REST_HOURS,
  ORDER_SECOND_FOR_TODAY,
  ORDER_SLOTS,
  ORDER_UPKEEP_KEPT,
  ROW_ADVISOR,
  ROW_UNIT,
  SELL_OUT_SHARE,
  type GiverId,
  type OrderKind,
  type OrderMetric,
  type OrderPoint,
  type OrderReward,
  type OrderWhen,
} from '../config/orders';
import { TOWN_DECOR_XP } from '../config/decor';
import { PLACED } from '../config/placed';
import { FIRST_INTAKE_TICK, TICKS_PER_HOUR, TICKS_PER_YEAR } from '../config/time';
import { dollars, duration, headCount } from '../format';
import { nextU32 } from '../rng';
import { scaleOf } from '../scale';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, LogEntry, Order, Orders, PlacedType } from '../types';
import { capacity, type NeedId } from './capacity';
import { growthShortage } from './demand';
import { budget } from './budget';
import { decorSpec, giveDecor, townGift, workshopOpen } from './decor';
import { gainXp, hasDaily, readyToCollect } from './daily';
import { enrollmentCap, rewardName, rewardsWaiting } from './goals';
import { campusClean } from './grounds';
import { campusHappiness, type CampusHappiness } from './happiness';
import { donorName } from './policies';
import { hoodWalks, ownedAt } from './town';

/**
 * The orders board (DESIGN.md 42.3, as built in 42.16).
 *
 * An order is offered as a stub: who gives it, and a number from the game's
 * seeded stream. That is all that happens on a tick, once a real day. What
 * it asks for is chosen from that number the first time the player sees it,
 * and its clock starts then, so nothing runs out while they are away.
 *
 * How far along an order is, is read from the campus when somebody asks:
 * the board, the button, a claim. Nothing here walks the lots on a tick.
 * Three kinds of number: one read from the campus as it stands, one counted
 * from when the order was first seen (a running count the sim already
 * keeps, bumped where the thing happens), and one measured once at a point
 * of the calendar (a mark left there).
 *
 * Only a game with goals has the board.
 */

export function newOrders(): Orders {
  return { open: [], nextId: 1, tally: {}, marks: [], news: [], note: '', rest: {}, paidYear: 0, paid: 0 };
}

const kindOf = (id: string | undefined): OrderKind | undefined => ORDER_KINDS.find((kind) => kind.id === id);

/** A giver's name on this campus: the donors are the game's own made-up family. */
export function giverName(state: GameState, giver: GiverId, sentence = false): string {
  const spec = GIVERS[giver];
  return (sentence ? spec.called : spec.name).replace('{donor}', donorName(state));
}

// ----------------------------------------------------------------- levels --

/** True when a level has opened something on the board: a kind of order by its id, or 'orders' for one more slot. */
function unlockedBy(level: number, what: 'order' | 'slot', id: string): boolean | null {
  let listed = false;
  for (const [at, gifts] of Object.entries(LEVEL_UNLOCKS)) {
    for (const gift of gifts) {
      if (gift.kind !== 'unlock' || gift.what !== what || gift.id !== id) continue;
      listed = true;
      if (level >= Number(at)) return true;
    }
  }
  return listed ? false : null;
}

/** How many orders may be open at once: three, and one more for each slot a level has opened. */
export function orderSlots(state: GameState): number {
  let slots = ORDER_SLOTS;
  for (const [at, gifts] of Object.entries(LEVEL_UNLOCKS)) {
    if (state.daily.level < Number(at)) continue;
    for (const gift of gifts) if (gift.kind === 'unlock' && gift.what === 'slot') slots += 1;
  }
  return slots;
}

/** A kind is open from the start unless a level is listed as opening it. */
function kindOpen(state: GameState, kind: OrderKind): boolean {
  return unlockedBy(state.daily.level, 'order', kind.id) !== false;
}

// ---------------------------------------------------------- what is so now --

/** One look at the campus, shared by everything asked in the same breath: the heavy numbers are worked out once. */
interface Look {
  mood: () => CampusHappiness;
  needs: () => ReturnType<typeof capacity>['needs'];
  /** What the campus keeps of every $100 that comes in. */
  kept: () => number;
  /** How many buildings hold something to collect, with their marker showing. */
  ready: () => number;
}

function look(state: GameState): Look {
  let mood: CampusHappiness | null = null;
  let needs: ReturnType<typeof capacity>['needs'] | null = null;
  let kept: number | null = null;
  let ready: number | null = null;
  return {
    mood: () => (mood ??= campusHappiness(state)),
    needs: () => (needs ??= capacity(state).needs),
    kept: () => (kept ??= budget(state).kept),
    ready: () => (ready ??= readyToCollect(state).length),
  };
}

const causeLevel = (seen: Look, id: string): number => Math.round(100 * (seen.mood().causes.find((cause) => cause.id === id)?.level ?? 0));

/**
 * The line of the Capacity page that is furthest from OK and that a visit
 * can lift, or null when there is none. Beds and seats count only while the
 * campus would build on a new lot: with room to spare, zoning one does
 * nothing. Faculty and staff arrive a semester on, so they are never asked.
 */
function weakestRow(state: GameState, seen: Look): { id: NeedId; name: string } | null {
  const rank = { ok: 0, tight: 1, short: 2 } as const;
  let worst: { id: NeedId; name: string; rank: number } | null = null;
  for (const need of seen.needs()) {
    if (need.fix.kind === 'none' || need.fix.kind === 'slider') continue;
    if (need.id === 'beds' && growthShortage(state, 'housing') <= 0) continue;
    if (need.id === 'seats' && growthShortage(state, 'academic') <= 0) continue;
    if (rank[need.status] > (worst?.rank ?? 0)) worst = { id: need.id, name: need.name, rank: rank[need.status] };
  }
  return worst;
}

/** The streets of the town whose students can walk to class. */
function streetsWalking(state: GameState): number {
  return state.map.town.neighbourhoods.filter((hood) => hoodWalks(state.map, hood)).length;
}

/** Bare ground the campus owns: where a tree or a bench could go. Counted up to what is asked and no further. */
function bareGround(state: GameState, enough: number): number {
  const { cells, width } = state.map;
  let found = 0;
  for (let i = 0; i < cells.length && found < enough; i++) {
    if (cells[i]!.kind === 'empty' && ownedAt(state.map, i % width, Math.floor(i / width))) found += 1;
  }
  return found;
}

/** A number read from the campus as it stands. `param` is the row or the building an order is about. */
function readNow(state: GameState, metric: OrderMetric, param: string | undefined, seen: Look): number {
  switch (metric) {
    case 'happiness':
      return Math.round(seen.mood().base);
    case 'safety':
      return causeLevel(seen, 'safety');
    case 'life':
      return causeLevel(seen, 'life');
    case 'clean':
      return Math.floor(100 * campusClean(state));
    case 'seats':
      return openCapacity(state, 'academic');
    case 'walkIn':
      return streetsWalking(state);
    case 'level':
      return state.daily.level;
    case 'rowOk':
      return seen.needs().find((need) => need.id === param)?.status === 'ok' ? 1 : 0;
    case 'rowHave':
      return seen.needs().find((need) => need.id === param)?.have ?? 0;
    case 'rewardPlaced':
      return state.map.placed.some((placed) => placed && placed.type === param) ? 1 : 0;
    default:
      return 0;
  }
}

const COUNTED: ReadonlySet<OrderMetric> = new Set(['trees', 'quads', 'furniture', 'collects', 'homeWins', 'sellOuts', 'crafts', 'decorPlaced']);
const MARKED: ReadonlySet<OrderMetric> = new Set(['graduates', 'fullFall', 'cleanIntake', 'calmSemester', 'semesterLeft']);

/** The mark of the calendar each measured number is read from, and whether less of it is better. */
const MARK_OF: Partial<Record<OrderMetric, { what: string; less?: true }>> = {
  graduates: { what: 'graduation' },
  fullFall: { what: 'fallFull' },
  cleanIntake: { what: 'intakeClean' },
  calmSemester: { what: 'semesterStress', less: true },
  semesterLeft: { what: 'semesterLeft', less: true },
};

/** Whether a kind's own condition holds on this campus now. */
function eligible(state: GameState, kind: OrderKind, seen: Look): boolean {
  const when: OrderWhen | undefined = kind.when;
  switch (when) {
    case undefined:
      return true;
    case 'rowNotOk':
      return weakestRow(state, seen) !== null;
    case 'parkingNotOk':
      return seen.needs().some((need) => need.id === 'parking' && need.status !== 'ok');
    case 'rewardWaiting':
      return rewardsWaiting(state).length > 0;
    case 'roomToPlant':
      return bareGround(state, 12) >= 12;
    case 'streetNotWalking':
      return streetsWalking(state) < state.map.town.neighbourhoods.length;
    case 'hasStadiumPlot':
      return state.football.stadium.plot !== null && !!state.map.placed[state.football.stadium.plot];
    case 'homeGamesAhead': {
      // Enough of a fall left to win in: three home games still to play, or none at all, when the next fall is whole.
      const ahead = (state.football.season?.games ?? []).filter((game) => game.home && !game.done).length;
      return ahead === 0 || ahead >= 3;
    }
    case 'seatsWanted':
      // The campus builds a lecture hall on a new lot only while it wants the seats.
      return growthShortage(state, 'academic') > 0;
    case 'collects':
      return state.map.placed.some((placed) => placed && (PLACED[placed.type].family === 'dining' || PLACED[placed.type].family === 'store'));
    case 'readyToCollect':
      // As many as it asks for are ready now, so it is done in this sitting.
      return seen.ready() >= (kind.target.n ?? 1);
    case 'workshopOpen':
      // There is a Makerspace, and a level has brought a recipe.
      return workshopOpen(state);
  }
}

/**
 * Whether a kind can be asked now: the player did not dismiss it lately, its
 * condition holds, the campus keeps enough for one that means a yearly cost,
 * and its number is not already as high as it is ever asked to go.
 */
function canAsk(state: GameState, kind: OrderKind, seen: Look): boolean {
  if ((state.orders.rest[kind.id] ?? 0) > state.clock.tick) return false;
  if (!eligible(state, kind, seen)) return false;
  if (kind.upkeep && seen.kept() < ORDER_UPKEEP_KEPT) return false;
  const most = kind.target.most;
  return most === undefined || readNow(state, kind.metric, undefined, seen) < most;
}

// ------------------------------------------------------------ the calendar --

/** The tick of the next such point of the calendar that is later than `after`. */
export function nextPoint(state: GameState, point: OrderPoint, after: number): number {
  const week = state.clock.week;
  const starts = [week.start, week.start + yearLength(week), week.start + yearLength(week) + TICKS_PER_YEAR, week.start + yearLength(week) + 2 * TICKS_PER_YEAR];
  const ticks: number[] = [];
  starts.forEach((start, n) => {
    const fall = n === 0 && week.year === 1 ? FIRST_INTAKE_TICK : start;
    const spring = start + SPRING_INTAKE_TICK_IN_YEAR;
    const graduation = start + GRADUATION_TICK_IN_YEAR;
    if (point === 'fallIntake') ticks.push(fall);
    else if (point === 'intake') ticks.push(fall, spring);
    else if (point === 'graduation') ticks.push(graduation);
    // The fall's football is over when the spring class moves in.
    else if (point === 'fallEnd') ticks.push(spring);
    else ticks.push(spring, graduation);
  });
  return ticks.sort((a, b) => a - b).find((tick) => tick > after) ?? after + TICKS_PER_YEAR;
}

// --------------------------------------------------------- what the sim tells --

/** Bump a running count. Called where the thing happens: a tree planted, a home game won. */
export function ordersCount(state: GameState, what: string, by = 1): void {
  if (!hasDaily(state) || !state.orders || by <= 0) return;
  state.orders.tally[what] = (state.orders.tally[what] ?? 0) + by;
}

/** Leave a mark at a point of the calendar: what was measured there. The last few are kept. */
export function ordersMark(state: GameState, what: string, value: number): void {
  if (!hasDaily(state) || !state.orders) return;
  state.orders.marks.push({ at: state.clock.tick, what, value });
  if (state.orders.marks.length > ORDER_MARKS_KEPT) state.orders.marks.splice(0, state.orders.marks.length - ORDER_MARKS_KEPT);
}

/** A home game ended: a win and a full house are both counted. */
export function ordersOnHomeGame(state: GameState, won: boolean, crowd: number, seats: number): void {
  if (won) ordersCount(state, 'homeWins');
  if (seats > 0 && crowd >= seats * SELL_OUT_SHARE) ordersCount(state, 'sellOuts');
}

/** A class moved in: whether anyone was left waiting for a bed or a seat, and whether a fall class filled the campus. */
export function ordersOnIntake(state: GameState, season: 'fall' | 'spring', turnedAway: number): void {
  ordersMark(state, 'intakeClean', turnedAway === 0 ? 1 : 0);
  const cap = enrollmentCap(state);
  if (season === 'fall') ordersMark(state, 'fallFull', cap !== null && enrollment(state) >= cap ? 1 : 0);
}

/** Pick a giver for a new order: by their weights, and one not on the board already where there is one. */
function pickGiver(state: GameState, roll: number): GiverId {
  const all = Object.keys(GIVERS) as GiverId[];
  const here = new Set(state.orders.open.map((order) => order.giver));
  const fresh = all.filter((giver) => !here.has(giver));
  const pool = fresh.length > 0 ? fresh : all;
  const total = pool.reduce((sum, giver) => sum + GIVERS[giver].weight, 0);
  let at = roll % total;
  for (const giver of pool) {
    at -= GIVERS[giver].weight;
    if (at < 0) return giver;
  }
  return pool[0]!;
}

/** Offer one order: a stub with its giver and a number from the seeded stream. Nothing about the campus is read. */
function offer(state: GameState): Order {
  const orders = state.orders;
  const giver = pickGiver(state, nextU32(state.rng, 'orders'));
  const order: Order = { id: orders.nextId, giver, roll: nextU32(state.rng, 'orders'), offered: state.clock.tick };
  orders.nextId += 1;
  orders.open.push(order);
  ordersCountRaw(orders, 'offered');
  return order;
}

function ordersCountRaw(orders: Orders, what: string): void {
  orders.tally[what] = (orders.tally[what] ?? 0) + 1;
}

/** A game begins, or meets the board for the first time: its first three orders, with nothing said. */
export function firstOrders(state: GameState): void {
  if (!hasDaily(state)) return;
  while (state.orders.open.length < orderSlots(state)) offer(state);
}

/** Once a real day: one new order, if the board has room. It gets a line in the paper. */
export function offerDaily(state: GameState, log: LogEntry[]): void {
  if (!hasDaily(state) || state.orders.open.length >= orderSlots(state)) return;
  const order = offer(state);
  log.push({ tick: state.clock.tick, kind: 'order', text: `A new order from ${giverName(state, order.giver, true)} is on the board.`, data: { id: order.id, new: 1 } });
}

/** A line waiting from an action is told on the next tick: an order claimed. */
export function tellOrders(state: GameState, log: LogEntry[]): void {
  const news = state.orders?.news;
  if (!news || news.length === 0) return;
  for (const text of news) log.push({ tick: state.clock.tick, kind: 'order', text, data: { done: 1 } });
  state.orders.news = [];
}

// ------------------------------------------------------------- first seen --

const isSeason = (kind: OrderKind | undefined): boolean => !!kind?.point;

/** True while an order that can be finished in one sitting is open and not yet finished. `but` is one to leave out. */
function sittingOpen(state: GameState, but = -1): boolean {
  return state.orders.open.some((other) => other.id !== but && other.done === undefined && !!kindOf(other.kind)?.sitting);
}

/**
 * Choose what an order asks for, the first time it is seen. The giver's
 * kinds that a level has opened and that can be asked of this campus now,
 * less any kind already on the board, and one of them by the order's own
 * number, short and season alike.
 *
 * One rule on top: the board always has an order that can be finished in
 * one sitting. So the order that fills the last place is a one-sitting kind
 * when no other open order is, and so is the second order of a day (`today`):
 * from this giver if they have one, and from any giver if not.
 */
function chooseKind(state: GameState, order: Order, seen: Look, today = false): OrderKind {
  const open = state.orders.open;
  const taken = new Set(open.map((other) => other.kind).filter((id): id is string => !!id));
  // The last place to fill: every other order on a full board already has its kind.
  const last = open.length >= orderSlots(state) && open.every((other) => other.id === order.id || other.kind !== undefined);
  const needSitting = (last || today) && !sittingOpen(state, order.id);
  const free = (kind: OrderKind): boolean => kindOpen(state, kind) && !taken.has(kind.id);
  const mine = ORDER_KINDS.filter((kind) => kind.giver === order.giver && free(kind) && canAsk(state, kind, seen));
  let pool = needSitting ? mine.filter((kind) => kind.sitting) : mine;
  if (pool.length === 0 && needSitting) pool = ORDER_KINDS.filter((kind) => kind.sitting && free(kind) && canAsk(state, kind, seen));
  if (pool.length === 0) pool = mine;
  // Nothing of this giver's can be asked: the kind each giver falls back on, then anybody's.
  if (pool.length === 0) pool = ORDER_KINDS.filter((kind) => kind.giver === order.giver && kind.always && !taken.has(kind.id) && canAsk(state, kind, seen));
  if (pool.length === 0) pool = ORDER_KINDS.filter((kind) => kind.always && !taken.has(kind.id) && canAsk(state, kind, seen));
  if (pool.length === 0) pool = ORDER_KINDS.filter((kind) => kind.always);
  return pool[order.roll % pool.length]!;
}

/** True when some kind that can be finished in one sitting could be asked of this campus now. */
function sittingToAsk(state: GameState, seen: Look): boolean {
  const taken = new Set(state.orders.open.map((other) => other.kind));
  return ORDER_KINDS.some((kind) => kind.sitting && kindOpen(state, kind) && !taken.has(kind.id) && canAsk(state, kind, seen));
}

/** Fix what a newly seen order asks: its kind, where the number stands, its target and its last hour. */
function begin(state: GameState, order: Order, seen: Look, today = false): void {
  const kind = chooseKind(state, order, seen, today);
  const tick = state.clock.tick;
  order.kind = kind.id;
  order.giver = kind.giver;
  order.seen = tick;
  // A decoration it pays is the one of the town's own the campus holds fewest of, fixed now.
  if (kind.reward.some((reward) => reward.kind === 'decor')) {
    const gift = townGift(state);
    if (gift) order.gift = gift;
  }
  ordersCountRaw(state.orders, `seen:${kind.id}`);
  const least = ORDER_LEAST_HOURS * TICKS_PER_HOUR;
  order.until = kind.point ? nextPoint(state, kind.point, tick + least) : tick + Math.max(ORDER_LEAST_HOURS, kind.hours ?? ORDER_LEAST_HOURS) * TICKS_PER_HOUR;
  const t = kind.target;
  if (kind.metric === 'rowOk') {
    order.param = kind.when === 'parkingNotOk' ? 'parking' : (weakestRow(state, seen)?.id ?? 'beds');
    order.from = 0;
    order.target = 1;
  } else if (kind.metric === 'rowHave') {
    // One step along the weakest line: a share of what its students ask of it, on top of what it has.
    const row = seen.needs().find((need) => need.id === (weakestRow(state, seen)?.id ?? 'beds'))!;
    order.param = row.id;
    order.from = row.have;
    order.target = row.have + Math.max(1, Math.ceil(row.want * (t.share ?? 0.02)));
  } else if (kind.metric === 'rewardPlaced') {
    order.param = rewardsWaiting(state)[0] ?? '';
    order.from = 0;
    order.target = 1;
  } else if (COUNTED.has(kind.metric)) {
    order.from = state.orders.tally[kind.metric] ?? 0;
    order.target = t.n ?? 1;
  } else if (kind.metric === 'graduates') {
    order.from = 0;
    order.target = Math.max(1, Math.floor((state.cohorts[3] * (t.share ?? 1)) / 100) * 100);
  } else if (kind.metric === 'semesterLeft') {
    order.from = 0;
    // No more than left last semester, with a little room, or two in a hundred on a campus with no semester behind it.
    const last = state.admissions.lastSemester?.left ?? Math.round(enrollment(state) * 0.02);
    order.target = Math.max(10, Math.ceil((last * 1.05) / 10) * 10);
  } else if (kind.metric === 'calmSemester') {
    order.from = 0;
    // No calmer than the semester before, and never asked under a middling one.
    order.target = Math.max(20, Math.round(state.term.lastAverage) + (t.add ?? 0));
  } else if (MARKED.has(kind.metric)) {
    order.from = 0;
    order.target = t.n ?? 1;
  } else {
    const now = readNow(state, kind.metric, undefined, seen);
    order.from = now;
    order.target = Math.min(t.most ?? Infinity, now + (t.add ?? 1) * (t.scaled ? scaleOf(state) : 1));
    // Already as high as it is ever asked: one more point is still something to do.
    if (order.target <= now) order.target = now + 1;
  }
}

// ---------------------------------------------------------------- progress --

export interface OrderStatus {
  /** Where the number stands, in the order's own unit. For a measured one, what was measured, once it has been. */
  value: number;
  target: number;
  done: boolean;
  /** True when its time ran out with the target not met. Said kindly, and it costs nothing. */
  missed: boolean;
  /** How far along, 0 to 1, for the bar. */
  share: number;
}

function statusOf(state: GameState, order: Order, seen: Look): OrderStatus {
  const kind = kindOf(order.kind);
  const target = order.target ?? 1;
  if (!kind || order.seen === undefined) return { value: 0, target, done: false, missed: false, share: 0 };
  if (order.done !== undefined) return { value: target, target, done: true, missed: false, share: 1 };
  const late = state.clock.tick > (order.until ?? Infinity);
  if (MARKED.has(kind.metric)) {
    const how = MARK_OF[kind.metric]!;
    const mark = state.orders.marks.find((one) => one.what === how.what && one.at > order.seen!);
    if (!mark) return { value: 0, target, done: false, missed: late, share: 0 };
    const done = how.less ? mark.value <= target : mark.value >= target;
    return { value: mark.value, target, done, missed: !done, share: done ? 1 : 0 };
  }
  const value = COUNTED.has(kind.metric) ? (state.orders.tally[kind.metric] ?? 0) - (order.from ?? 0) : readNow(state, kind.metric, order.param, seen);
  const done = value >= target;
  const from = COUNTED.has(kind.metric) ? 0 : (order.from ?? 0);
  const share = target > from ? Math.max(0, Math.min(1, (value - from) / (target - from))) : done ? 1 : 0;
  // If the number is there when the player looks, it counts, even a little late: the board is never unkind.
  return { value, target, done, missed: !done && late, share };
}

/** How one order stands now. */
export function orderStatus(state: GameState, order: Order): OrderStatus {
  return statusOf(state, order, look(state));
}

/** Cash the orders may still pay this school year, on this campus's count. */
export function orderCashLeft(state: GameState): number {
  const orders = state.orders;
  const paid = orders.paidYear === Math.max(1, state.clock.week.year) ? orders.paid : 0;
  return Math.max(0, ORDER_CASH_YEAR * scaleOf(state) - paid);
}

/**
 * What an order would pay if it were claimed now, on this campus: a grant is
 * on the campus's own count, and no more than the year has left to give. A
 * grant with nothing left pays its experience alone.
 */
export function orderRewards(state: GameState, order: Order): OrderReward[] {
  const kind = kindOf(order.kind);
  if (!kind) return [];
  const left = orderCashLeft(state);
  const out: OrderReward[] = [];
  let xp = 0;
  for (const reward of kind.reward) {
    if (reward.kind === 'cash') out.push({ kind: 'cash', amount: Math.min(left, reward.amount * scaleOf(state)) });
    else if (reward.kind === 'xp') xp += reward.amount;
    // A decoration, or experience in its place once the town has no more of its own to give.
    else if (reward.kind === 'decor') {
      if (order.gift) out.push({ kind: 'decor', amount: 1, id: order.gift });
      else xp += TOWN_DECOR_XP;
    } else out.push(reward);
  }
  if (xp > 0) out.push({ kind: 'xp', amount: xp });
  return out.filter((reward) => reward.amount > 0);
}

/** A reward list in words: "200 experience", "$56,000 and 60 experience". */
export function rewardWords(rewards: readonly OrderReward[]): string {
  const parts = rewards.map((reward) =>
    reward.kind === 'xp'
      ? `${reward.amount} experience`
      : reward.kind === 'seals'
        ? `${reward.amount} Gold ${reward.amount === 1 ? 'Seal' : 'Seals'}`
        : reward.kind === 'decor'
          ? (decorSpec(reward.id)?.a ?? 'a decoration')
          : dollars(reward.amount),
  );
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export interface OrderView {
  id: number;
  giver: GiverId;
  /** Who asks: "The town", or an advisor by title and name for a line of the Capacity page. */
  from: string;
  /** True before it has been seen: the board shows it as new, and seeing it starts its clock. */
  fresh: boolean;
  title: string;
  ask: string;
  /** "3 of 8", "Now 84", "Measured at graduation". */
  progress: string;
  share: number;
  /** "1 d 12 h left", or what it runs to. '' once it is done. */
  left: string;
  reward: string;
  done: boolean;
  season: boolean;
  sitting: boolean;
}

const POINT_WORDS: Record<OrderPoint, string> = {
  intake: 'when the next class moves in',
  fallIntake: 'when the fall class moves in',
  graduation: 'at graduation',
  semesterEnd: 'when the semester ends',
  fallEnd: 'when the fall ends',
};

/** The row or the building an order is about, as its title names it. */
function whatOf(state: GameState, order: Order, kind: OrderKind, seen: Look): string {
  if (kind.metric === 'rowOk' || kind.metric === 'rowHave') return seen.needs().find((need) => need.id === order.param)?.name ?? 'Capacity';
  if (kind.metric === 'rewardPlaced') return order.param ? rewardName(order.param as PlacedType) : 'the building you earned';
  return '';
}

/** The board: every open order, as it reads now. Worked out when asked. */
export function orderViews(state: GameState): OrderView[] {
  if (!hasDaily(state)) return [];
  const seen = look(state);
  return state.orders.open.map((order) => {
    const kind = kindOf(order.kind);
    if (!kind || order.seen === undefined) {
      return { id: order.id, giver: order.giver, from: giverName(state, order.giver), fresh: true, title: 'A new order', ask: '', progress: '', share: 0, left: '', reward: '', done: false, season: false, sitting: false };
    }
    const status = statusOf(state, order, seen);
    const show = (value: number): string => (kind.metric === 'seats' || kind.metric === 'graduates' || kind.metric === 'rowHave' || kind.metric === 'semesterLeft' ? headCount(value) : String(value));
    const n = show(status.target);
    const what = whatOf(state, order, kind, seen);
    // A line of the Capacity page is asked by the advisor it belongs to, by title and name.
    const advisor = kind.giver === 'advisors' && (kind.metric === 'rowOk' || kind.metric === 'rowHave') && order.param ? ROW_ADVISOR[order.param as NeedId] : null;
    const from = advisor ? `${ADVISORS[advisor].title} ${state.inbox.advisors[advisor]}` : giverName(state, kind.giver);
    let progress: string;
    if (status.done) progress = 'Done';
    else if (MARKED.has(kind.metric)) progress = `Measured ${POINT_WORDS[kind.point ?? 'intake']}`;
    else if (COUNTED.has(kind.metric)) progress = `${Math.min(status.value, status.target)} of ${status.target}`;
    else if (kind.metric === 'rowOk' || kind.metric === 'rewardPlaced') progress = 'Not yet';
    else progress = `Now ${show(status.value)}`;
    const ticksLeft = Math.max(1, (order.until ?? state.clock.tick) - state.clock.tick);
    return {
      id: order.id,
      giver: kind.giver,
      from,
      fresh: false,
      title: kind.title.replace('{n}', n).replace('{what}', what.charAt(0).toUpperCase() + what.slice(1)).replace('{unit}', kind.metric === 'rowHave' && order.param ? ROW_UNIT[order.param as NeedId] : ''),
      ask: kind.ask,
      progress,
      share: status.share,
      left: status.done ? '' : `${duration(ticksLeft)} left`,
      reward: rewardWords(orderRewards(state, order)),
      done: status.done,
      season: isSeason(kind),
      sitting: !!kind.sitting,
    };
  });
}

/** For the button under the top bar: how many are done and waiting to be claimed, how many are new, how many are open. */
export function orderCounts(state: GameState): { open: number; fresh: number; done: number } | null {
  if (!hasDaily(state)) return null;
  const seen = look(state);
  let fresh = 0;
  let done = 0;
  for (const order of state.orders.open) {
    if (order.seen === undefined) fresh += 1;
    else if (statusOf(state, order, seen).done) done += 1;
  }
  return { open: state.orders.open.length, fresh, done };
}

// ---------------------------------------------------------------- actions --

/**
 * The player looks at the board. Every order not yet seen is given what it
 * asks and its clock starts. One that is done is marked done, and waits to
 * be claimed for as long as it takes. One whose time ran out is taken off,
 * with a kind word. And if the day's new order left nothing on the board to
 * finish in one sitting, a second comes with it that can be. Changes the
 * state it is given.
 */
export function seeOrders(state: GameState): void {
  if (!hasDaily(state)) return;
  const orders = state.orders;
  const seen = look(state);
  orders.note = '';
  const ranOut: string[] = [];
  let begun = 0;
  for (const order of [...orders.open]) {
    if (order.seen === undefined) {
      begin(state, order, seen);
      begun += 1;
      continue;
    }
    if (order.done !== undefined) continue;
    const status = statusOf(state, order, seen);
    if (status.done) order.done = state.clock.tick;
    else if (status.missed) {
      const view = orderViews(state).find((one) => one.id === order.id);
      if (view) ranOut.push(view.title);
      orders.open = orders.open.filter((one) => one.id !== order.id);
      ordersCountRaw(orders, 'missed');
      ordersCountRaw(orders, `missed:${order.kind}`);
    }
  }
  if (ranOut.length > 0) {
    orders.note = `${ranOut.length === 1 ? `Time ran out on "${ranOut[0]}".` : `Time ran out on ${ranOut.length} orders.`} Nothing is lost, and a new order comes tomorrow.`;
  }
  // Something for today: the day's new order was a long one, or time ran out on one and left a place, and nothing
  // else here can be finished in one sitting. Each can happen once a day at most, so looking again brings no more.
  if (ORDER_SECOND_FOR_TODAY && (begun > 0 || ranOut.length > 0) && orders.open.length < orderSlots(state) && !sittingOpen(state) && sittingToAsk(state, seen)) {
    const second = offer(state);
    begin(state, second, seen, true);
    ordersCountRaw(orders, 'second');
  }
}

/** Claim a finished order: its reward is paid and it leaves the board. Returns what was paid, or why not. */
export function claimOrder(state: GameState, id: number): { rewards: OrderReward[]; title: string } | string {
  const orders = state.orders;
  const order = orders.open.find((one) => one.id === id);
  if (!order || order.seen === undefined) return 'That order is not on the board.';
  if (!orderStatus(state, order).done) return 'That order is not finished yet.';
  const view = orderViews(state).find((one) => one.id === id)!;
  const rewards = orderRewards(state, order);
  const year = Math.max(1, state.clock.week.year);
  if (orders.paidYear !== year) {
    orders.paidYear = year;
    orders.paid = 0;
  }
  let xp = 0;
  for (const reward of rewards) {
    if (reward.kind === 'xp') xp += reward.amount;
    else if (reward.kind === 'decor') {
      // It goes to storage, to be placed for nothing.
      if (reward.id) giveDecor(state, reward.id);
      orders.tally.decor = (orders.tally.decor ?? 0) + 1;
    } else if (reward.kind === 'seals') {
      state.daily.seals += reward.amount;
      orders.tally.seals = (orders.tally.seals ?? 0) + reward.amount;
    } else {
      state.money.cash += reward.amount;
      orders.paid += reward.amount;
      orders.tally.cash = (orders.tally.cash ?? 0) + reward.amount;
    }
  }
  orders.open = orders.open.filter((one) => one.id !== id);
  ordersCountRaw(orders, 'claimed');
  ordersCountRaw(orders, `claimed:${order.kind}`);
  orders.tally.xp = (orders.tally.xp ?? 0) + xp;
  orders.news.push(`Order done for ${giverName(state, view.giver, true)}: ${view.title}. It paid ${rewardWords(rewards)}.`);
  gainXp(state, xp);
  return { rewards, title: view.title };
}

/** Dismiss an order that is not wanted. It is free, and its place is filled the next day. A finished one is claimed, not dismissed. */
export function dismissOrder(state: GameState, id: number): string | null {
  const orders = state.orders;
  const order = orders.open.find((one) => one.id === id);
  if (!order) return 'That order is not on the board.';
  if (order.seen !== undefined && orderStatus(state, order).done) return 'That order is finished. Claim it.';
  orders.open = orders.open.filter((one) => one.id !== id);
  ordersCountRaw(orders, 'dismissed');
  if (order.kind) {
    ordersCountRaw(orders, `dismissed:${order.kind}`);
    // Not wanted: that kind is not asked again for a week.
    orders.rest[order.kind] = state.clock.tick + ORDER_REST_HOURS * TICKS_PER_HOUR;
  }
  return null;
}

/** The most a school year of orders can pay in cash on this campus, however the board is played. For the money tables. */
export function orderCashCeiling(state: GameState): number {
  return ORDER_CASH_YEAR * scaleOf(state);
}
