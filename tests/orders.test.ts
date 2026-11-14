import { newGreek } from '../src/sim/systems/greek';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  awayLines,
  budget,
  donorName,
  enrollment,
  gainXp,
  GIVERS,
  giverName,
  hasDaily,
  LEVEL_UNLOCKS,
  levelCost,
  newGame,
  newOrders,
  ORDER_CASH_YEAR,
  ORDER_KINDS,
  ORDER_LEAST_HOURS,
  ORDER_REST_HOURS,
  ORDER_SLOTS,
  ORDER_UPKEEP_KEPT,
  orderCashCeiling,
  orderCashLeft,
  orderCounts,
  orderRewards,
  ordersCount,
  ordersMark,
  orderSlots,
  orderStatus,
  orderViews,
  ownedAt,
  parseSave,
  readyToCollect,
  rewardWords,
  SAVE_VERSION,
  scaleOf,
  serialize,
  TICKS_PER_HOUR,
  toneProblem,
  validate,
  type GameState,
  type GiverSpec,
  type LogEntry,
  type Order,
  type OrderKind,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { footballStat, inboxStat, policyStat, shortLeft } from '../src/ui/chips';
import { ordersChip, ordersView, paidWords } from '../src/ui/ordersUi';
import { advanceInSteps, DAY, freshGame, HOUR, MIN, T0 } from './helpers';

/**
 * The orders board (DESIGN.md 42.3, as built from 42.16). Things to do, where
 * the Inbox is things to decide: an order asks for a number the game already
 * has, pays a little, and can never hurt a campus.
 */

const model = (seed = 35): GameState => newGame({ seed, name: 'Test University', now: T0, campus: 'model' });
const BASE = model();
const fresh = (): GameState => structuredClone(BASE);

function act(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const later = (state: GameState, ms: number): GameState => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + ms).state;
const facts = (state: GameState) => ({ minutes: 600, cashBefore: state.money.cash, cashAfter: state.money.cash, studentsBefore: enrollment(state), studentsAfter: enrollment(state) });
const kindOf = (id: string | undefined): OrderKind => ORDER_KINDS.find((kind) => kind.id === id)!;
const stub = (state: GameState, id: number, giver: Order['giver'], roll = 0): Order => ({ id, giver, roll, offered: state.clock.tick });
const FAR = 1e9;

/** Bare ground the campus owns: where a tree, a bench or a quad can go. */
function bare(state: GameState, n: number): Array<[number, number]> {
  const { cells, width } = state.map;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < cells.length && out.length < n; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (cells[i]!.kind === 'empty' && ownedAt(state.map, x, y)) out.push([x, y]);
  }
  if (out.length < n) throw new Error('no bare ground');
  return out;
}

/**
 * A board with one order of the kind wanted, first seen now. Every other kind
 * of its giver is resting, so the giver has only this one to ask. A long kind
 * brings a second order with it, as the rule has it: that one is left alone.
 */
function asked(kindId: string, base: GameState = BASE): { state: GameState; order: Order } {
  const kind = kindOf(kindId);
  const state = structuredClone(base);
  state.daily.level = Math.max(state.daily.level, 40);
  state.orders.open = [stub(state, 900, kind.giver)];
  for (const other of ORDER_KINDS) if (other.giver === kind.giver && other.id !== kindId) state.orders.rest[other.id] = state.clock.tick + FAR;
  const seen = act(state, { type: 'seeOrders' });
  const order = seen.orders.open.find((one) => one.id === 900)!;
  if (order.kind !== kindId) throw new Error(`asked for ${kindId} and got ${order.kind}`);
  return { state: seen, order };
}

const view = (state: GameState, id: number) => orderViews(state).find((one) => one.id === id)!;
const status = (state: GameState, id: number) => orderStatus(state, state.orders.open.find((one) => one.id === id)!);
/** Everything but the board itself and its own stream of numbers. */
const rest = (state: GameState): unknown => {
  const copy = structuredClone(state) as unknown as Record<string, unknown> & { rng: Record<string, unknown> };
  delete copy.orders;
  delete copy.rng.orders;
  return copy;
};

describe('the kinds of order, as data', () => {
  it('has about twenty kinds from four givers, each a number, a length and a reward', () => {
    expect(ORDER_KINDS.length).toBeGreaterThanOrEqual(18);
    expect(ORDER_KINDS.length).toBeLessThanOrEqual(26);
    expect(new Set(ORDER_KINDS.map((kind) => kind.id)).size).toBe(ORDER_KINDS.length);
    expect(Object.keys(GIVERS).sort()).toEqual(['advisors', 'donors', 'state', 'town']);
    for (const giver of Object.keys(GIVERS)) {
      const mine = ORDER_KINDS.filter((kind) => kind.giver === giver);
      expect(mine.length).toBeGreaterThanOrEqual(4);
      // Each has a kind it can always fall back on, one for a sitting and one that runs to the calendar or longer.
      expect(mine.some((kind) => kind.always)).toBe(true);
      expect(mine.some((kind) => kind.sitting)).toBe(true);
      expect(mine.some((kind) => !kind.sitting)).toBe(true);
    }
    for (const kind of ORDER_KINDS) {
      // Short, or to a point of the calendar: one or the other, and never under 36 hours.
      expect((kind.hours !== undefined) !== (kind.point !== undefined)).toBe(true);
      if (kind.hours !== undefined) expect(kind.hours).toBeGreaterThanOrEqual(ORDER_LEAST_HOURS);
      // A short order runs two days at most, except one that waits on the Workshop, which takes a day or two to make a thing,
      // or on a research lab's next discovery, which is only asked for when one is due well inside its four days.
      if (kind.hours !== undefined) expect(kind.hours).toBeLessThanOrEqual(kind.metric === 'crafts' || kind.metric === 'discoveries' ? 96 : 48);
      // What can be done in one sitting does not wait on the calendar.
      if (kind.sitting) expect(kind.point).toBeUndefined();
      expect(kind.reward.length).toBeGreaterThan(0);
      for (const reward of kind.reward) {
        // Experience, Gold Seals or cash. No rank points, ever.
        expect(['xp', 'seals', 'cash', 'decor']).toContain(reward.kind);
        expect(reward.amount).toBeGreaterThan(0);
      }
    }
    expect(ORDER_LEAST_HOURS).toBe(36);
    expect(ORDER_SLOTS).toBe(3);
  });

  it('gives each giver its usual reward: experience, a grant, a decoration, and Gold Seals', () => {
    const pays = (giver: string, what: string): boolean => ORDER_KINDS.filter((kind) => kind.giver === giver).every((kind) => kind.reward.some((reward) => reward.kind === what));
    const only = (giver: string, what: string): boolean => ORDER_KINDS.filter((kind) => kind.giver === giver).every((kind) => kind.reward.every((reward) => reward.kind === what));
    expect(only('advisors', 'xp')).toBe(true);
    expect(pays('state', 'cash')).toBe(true);
    // The town pays a decoration of its own on most orders (tests/decor.test.ts), and some experience on every one.
    expect(pays('town', 'xp')).toBe(true);
    expect(ORDER_KINDS.filter((kind) => kind.giver === 'town' && kind.reward.some((reward) => reward.kind === 'decor')).length).toBeGreaterThanOrEqual(4);
    for (const kind of ORDER_KINDS) if (kind.giver !== 'town') expect(kind.reward.some((reward) => reward.kind === 'decor')).toBe(false);
    expect(pays('donors', 'seals')).toBe(true);
    // Cash comes from the state alone, and Seals from donors alone.
    for (const kind of ORDER_KINDS) {
      if (kind.giver !== 'state') expect(kind.reward.some((reward) => reward.kind === 'cash')).toBe(false);
      if (kind.giver !== 'donors') expect(kind.reward.some((reward) => reward.kind === 'seals')).toBe(false);
    }
  });

  it('keeps every word inside the tone guide, and says Happiness and Stress', () => {
    const lines = [
      ...Object.values(GIVERS).flatMap((giver) => [giver.name, giver.called]),
      ...ORDER_KINDS.flatMap((kind) => [kind.title.replace('{n}', '8').replace('{what}', 'Beds').replace('{unit}', 'beds'), kind.ask]),
      ...Object.values(LEVEL_UNLOCKS).flatMap((gifts) => gifts.map((gift) => (gift.kind === 'unlock' ? gift.name : ''))),
    ];
    for (const line of lines) expect(toneProblem(line), line).toBeNull();
    const all = lines.join(' ');
    expect(all).not.toMatch(/morale|mood\b|satisfaction/i);
    expect(all).toContain('Happiness');
    expect(all).toContain('Stress');
  });

  it('opens some kinds, and two more places, by level', () => {
    const opened = Object.values(LEVEL_UNLOCKS).flat();
    const slots = opened.filter((gift) => gift.kind === 'unlock' && gift.what === 'slot');
    expect(slots).toHaveLength(2);
    const kinds = opened.filter((gift) => gift.kind === 'unlock' && gift.what === 'order');
    expect(kinds.length).toBeGreaterThanOrEqual(6);
    for (const gift of kinds) if (gift.kind === 'unlock') expect(ORDER_KINDS.some((kind) => kind.id === gift.id), gift.id).toBe(true);
    // A kind each giver falls back on is open from the start.
    for (const kind of ORDER_KINDS.filter((one) => one.always)) expect(kinds.some((gift) => gift.kind === 'unlock' && gift.id === kind.id)).toBe(false);
    const at = (level: number): number => {
      const state = fresh();
      state.daily.level = level;
      return orderSlots(state);
    };
    expect(at(1)).toBe(3);
    const [fourth, fifth] = Object.entries(LEVEL_UNLOCKS)
      .filter(([, gifts]) => gifts.some((gift) => gift.kind === 'unlock' && gift.what === 'slot'))
      .map(([level]) => Number(level));
    expect(at(fourth! - 1)).toBe(3);
    expect(at(fourth!)).toBe(4);
    expect(at(fifth! - 1)).toBe(4);
    expect(at(fifth!)).toBe(5);
    expect(at(500)).toBe(5);
  });

  it('asks only what a level has opened', () => {
    const locked = new Set(Object.values(LEVEL_UNLOCKS).flatMap((gifts) => gifts.flatMap((gift) => (gift.kind === 'unlock' && gift.what === 'order' ? [gift.id] : []))));
    const kindsAt = (level: number): Set<string> => {
      const found = new Set<string>();
      for (let roll = 0; roll < 24; roll++) {
        const state = fresh();
        state.daily.level = level;
        state.orders.open = (['advisors', 'state', 'town', 'donors'] as const).slice(0, orderSlots(state)).map((giver, n) => stub(state, 50 + n, giver, roll * 7 + n));
        for (const order of act(state, { type: 'seeOrders' }).orders.open) found.add(order.kind!);
      }
      return found;
    };
    const early = kindsAt(1);
    for (const id of early) expect(locked.has(id), id).toBe(false);
    const late = kindsAt(60);
    expect([...late].some((id) => locked.has(id))).toBe(true);
    expect(late.size).toBeGreaterThan(early.size);
  });

  it('takes a new kind of order, and a new giver, as one more entry each', () => {
    const kinds = ORDER_KINDS as OrderKind[];
    const givers = GIVERS as Record<string, GiverSpec>;
    const added: OrderKind = { id: 'testLawn', giver: 'alumni' as OrderKind['giver'], title: 'Lay {n} cells of quad by the gate', ask: 'We met on a lawn like that.', metric: 'quads', target: { n: 2 }, hours: 36, reward: [{ kind: 'xp', amount: 55 }], sitting: true };
    kinds.push(added);
    givers.alumni = { name: 'The class of year one', called: 'the class of year one', weight: 1 };
    try {
      const state = fresh();
      state.orders.open = [stub(state, 900, 'alumni' as Order['giver'])];
      const seen = act(state, { type: 'seeOrders' });
      expect(seen.orders.open).toHaveLength(1);
      expect(seen.orders.open[0]!.kind).toBe('testLawn');
      expect(view(seen, 900)).toMatchObject({ from: 'The class of year one', title: 'Lay 2 cells of quad by the gate', ask: 'We met on a lawn like that.', progress: '0 of 2', reward: '55 experience', sitting: true });
      const laid = act(seen, { type: 'paint', tool: 'quad', cells: bare(seen, 2) });
      expect(view(laid, 900).done).toBe(true);
      const xp = laid.daily.xp;
      const claimed = act(laid, { type: 'claimOrder', id: 900 });
      expect(claimed.daily.xp).toBe(xp + 55);
      expect(claimed.orders.news[0]).toBe('Order done for the class of year one: Lay 2 cells of quad by the gate. It paid 55 experience.');
    } finally {
      kinds.pop();
      delete givers.alumni;
    }
    expect(ORDER_KINDS.some((kind) => kind.id === 'testLawn')).toBe(false);
  });
});

describe('the board', () => {
  it('opens a new game with three orders nobody has seen, and says nothing of them', () => {
    const state = fresh();
    expect(hasDaily(state)).toBe(true);
    expect(state.orders.open).toHaveLength(3);
    for (const order of state.orders.open) {
      expect(order.kind).toBeUndefined();
      expect(order.seen).toBeUndefined();
      expect(order.until).toBeUndefined();
      expect(Object.keys(GIVERS)).toContain(order.giver);
    }
    // Three different givers to begin with.
    expect(new Set(state.orders.open.map((order) => order.giver)).size).toBe(3);
    expect(state.orders.news).toEqual([]);
    expect(orderCounts(state)).toEqual({ open: 3, fresh: 3, done: 0 });
    for (const one of orderViews(state)) expect(one).toMatchObject({ fresh: true, title: 'A new order', reward: '', done: false });
    expect(advance(state, T0, T0 + HOUR).log.filter((entry) => entry.kind === 'order')).toEqual([]);
  });

  it('is the same board for the same seed, however the time is cut', () => {
    expect(model(35).orders).toEqual(BASE.orders);
    expect(model(36).orders.open.map((order) => order.roll)).not.toEqual(BASE.orders.open.map((order) => order.roll));
    const emptied = fresh();
    emptied.orders.open = [];
    const whole = advance(emptied, T0, T0 + 6 * DAY).state;
    const pieces = advanceInSteps(emptied, T0 + 6 * DAY, 9).state;
    expect(pieces.orders).toEqual(whole.orders);
    expect(pieces.rng.orders).toEqual(whole.rng.orders);
    expect(whole.orders.open).toHaveLength(orderSlots(whole));
    expect(whole.orders.open.every((order) => order.seen === undefined)).toBe(true);
  });

  it('has no board on a game with no goals', () => {
    const small = freshGame();
    expect(small.orders).toEqual(newOrders());
    expect(orderViews(small)).toEqual([]);
    expect(orderCounts(small)).toBeNull();
    expect(ordersChip(small)).toBeNull();
    expect(ordersView(small)).toBeNull();
    expect(applyAction(small, { type: 'seeOrders' }).ok).toBe(false);
    const week = advance(small, T0, T0 + 9 * DAY);
    expect(week.state.orders).toEqual(newOrders());
    expect(week.log.filter((entry) => entry.kind === 'order')).toEqual([]);
    // Nothing is counted for it either.
    ordersCount(small, 'trees', 3);
    ordersMark(small, 'graduation', 100);
    expect(small.orders).toEqual(newOrders());
  });

  it('starts an order when it is first seen: what it asks, and its clock', () => {
    const waited = later(fresh(), 3 * DAY);
    expect(waited.orders.open.every((order) => order.seen === undefined)).toBe(true);
    const seen = act(waited, { type: 'seeOrders' });
    const tick = seen.clock.tick;
    expect(seen.orders.open.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen.orders.open.map((order) => order.kind)).size).toBe(seen.orders.open.length);
    for (const order of seen.orders.open) {
      const kind = kindOf(order.kind);
      expect(kind).toBeDefined();
      expect(order.seen).toBe(tick);
      // No window is under 36 hours, counted from the first look and not from the offer.
      expect(order.until! - tick).toBeGreaterThanOrEqual(ORDER_LEAST_HOURS * TICKS_PER_HOUR);
      if (kind.hours !== undefined) expect(order.until! - tick).toBe(kind.hours * TICKS_PER_HOUR);
      expect(order.target).toBeGreaterThan(0);
    }
    // A second look changes nothing.
    const again = act(later(seen, HOUR), { type: 'seeOrders' });
    expect(again.orders.open.map((order) => [order.id, order.kind, order.seen, order.until, order.target])).toEqual(seen.orders.open.map((order) => [order.id, order.kind, order.seen, order.until, order.target]));
    for (const one of orderViews(seen)) {
      expect(one.fresh).toBe(false);
      expect(one.title).not.toMatch(/[{}]/);
      expect(one.reward).not.toBe('');
      expect(one.left).toMatch(/ left$/);
      expect(toneProblem(one.title), one.title).toBeNull();
    }
  });

  it('lets nothing run out unseen, however long the player is away', () => {
    const away = advance(fresh(), T0, T0 + 30 * DAY);
    // The campus levels a little by itself in a month, and a level opened a fourth place: one more order came for it.
    expect(orderSlots(away.state)).toBe(4);
    expect(away.state.orders.open).toHaveLength(4);
    expect(away.state.orders.open.every((order) => order.seen === undefined && order.kind === undefined)).toBe(true);
    expect(away.state.orders.tally.missed).toBeUndefined();
    // A full board takes no new order: one line in a month, for the one the new place let in.
    expect(away.log.filter((entry) => entry.kind === 'order')).toHaveLength(1);
    const seen = act(away.state, { type: 'seeOrders' });
    expect(seen.orders.note).toBe('');
    for (const order of seen.orders.open) expect(order.until! - seen.clock.tick).toBeGreaterThanOrEqual(ORDER_LEAST_HOURS * TICKS_PER_HOUR);
  });

  it('brings one new order each real day while there is room, with a line in the paper', () => {
    let state = act(fresh(), { type: 'seeOrders' });
    const gone = state.orders.open[0]!;
    state = act(state, { type: 'dismissOrder', id: gone.id });
    const left = state.orders.open.length;
    const day = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + DAY);
    const lines = day.log.filter((entry) => entry.kind === 'order');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toMatch(/^A new order from .+ is on the board\.$/);
    expect(lines[0]!.data).toMatchObject({ new: 1 });
    expect(day.state.orders.open).toHaveLength(left + 1);
    expect(day.state.orders.open[day.state.orders.open.length - 1]!.seen).toBeUndefined();
    // One a day, and never more than the board has places for.
    let many = fresh();
    many.orders.open = [];
    for (let n = 1; n <= 6; n++) {
      many = later(many, DAY);
      expect(many.orders.open).toHaveLength(Math.min(n, orderSlots(many)));
    }
    expect(many.orders.open.length).toBe(orderSlots(many));
  });

  it('always has an order that can be finished in one sitting', () => {
    // On a new board, whatever the numbers drawn.
    for (let roll = 0; roll < 30; roll++) {
      const state = fresh();
      state.orders.open.forEach((order, n) => (order.roll = roll * 13 + n));
      const seen = act(state, { type: 'seeOrders' });
      expect(orderViews(seen).some((one) => one.sitting && !one.done), `roll ${roll}`).toBe(true);
      expect(seen.orders.open.length).toBeLessThanOrEqual(orderSlots(seen));
    }
    // The order that fills the last place of a full board is one, when no other is.
    const full = asked('graduateClass').state;
    full.daily.level = 1;
    full.orders.open = full.orders.open.filter((order) => order.id === 900);
    full.orders.open.push({ ...full.orders.open[0]!, id: 901, kind: 'levelUp', giver: 'donors', target: 99, from: 1 });
    full.orders.open.push(stub(full, 902, 'state', 3));
    full.orders.rest = {};
    full.orders.tally = {};
    const filled = act(full, { type: 'seeOrders' });
    expect(filled.orders.open).toHaveLength(3);
    expect(kindOf(filled.orders.open.find((order) => order.id === 902)!.kind).sitting).toBe(true);
    expect(filled.orders.tally.second).toBeUndefined();
  });

  it('brings a second order for today when the day\'s new one is a long one', () => {
    // A board with one long order on it and room: the day's new order is long too, so one for a sitting comes with it.
    const { state } = asked('graduateClass');
    const second = state.orders.open.find((order) => order.id !== 900)!;
    expect(state.orders.open).toHaveLength(2);
    expect(state.orders.tally.second).toBe(1);
    expect(kindOf(second.kind).sitting).toBe(true);
    expect(second.seen).toBe(state.clock.tick);
    // It is an order like any other: no second comes while it is open, or when the player only looks again.
    const again = act(state, { type: 'seeOrders' });
    expect(again.orders.open).toHaveLength(2);
    expect(again.orders.tally.second).toBe(1);
    // With one for a sitting already open, the day's new order comes alone.
    const { state: sitting } = asked('plantTrees');
    expect(sitting.orders.open).toHaveLength(1);
    expect(sitting.orders.tally.second).toBeUndefined();
    sitting.orders.open.push(stub(sitting, 905, 'state', 1));
    sitting.orders.rest.moreSeats = sitting.clock.tick + FAR;
    const next = act(sitting, { type: 'seeOrders' });
    expect(next.orders.open).toHaveLength(2);
    expect(kindOf(next.orders.open.find((order) => order.id === 905)!.kind).sitting).toBeUndefined();
    expect(next.orders.tally.second).toBeUndefined();
  });

  it('brings one for today when time runs out on the only order that could be finished in a sitting', () => {
    // A long order, and one for a sitting whose time has passed with nothing done.
    const { state } = asked('graduateClass');
    const short = state.orders.open.find((order) => order.id !== 900)!;
    expect(kindOf(short.kind!).sitting).toBe(true);
    expect(status(state, short.id).done).toBe(false);
    short.until = state.clock.tick - 1;
    const seconds = state.orders.tally.second ?? 0;
    const seen = act(state, { type: 'seeOrders' });
    // The one that ran out is off the board with a kind word, and another for a sitting has its place.
    expect(seen.orders.note).toMatch(/^Time ran out on /);
    expect(seen.orders.tally.missed).toBe(1);
    expect(seen.orders.tally.second).toBe(seconds + 1);
    expect(seen.orders.open).toHaveLength(2);
    expect(seen.orders.open.some((order) => order.id === short.id)).toBe(false);
    expect(orderViews(seen).some((one) => one.sitting && !one.done)).toBe(true);
    // Looking again brings no more.
    const again = act(seen, { type: 'seeOrders' });
    expect(again.orders.open).toHaveLength(2);
    expect(again.orders.tally.second).toBe(seconds + 1);
  });
});

describe('what the board will ask', () => {
  /** Every kind the advisors, the state and the town come up with on this campus, over many numbers drawn. */
  const kindsOn = (base: GameState): Set<string> => {
    const found = new Set<string>();
    for (let roll = 0; roll < 16; roll++) {
      const state = structuredClone(base);
      state.daily.level = 60;
      state.orders.open = (['advisors', 'state', 'town'] as const).map((giver, n) => stub(state, 60 + n, giver, roll * 5 + n));
      for (const order of act(state, { type: 'seeOrders' }).orders.open) found.add(order.kind!);
    }
    return found;
  };

  it('asks for something with a yearly cost only while the campus keeps enough of every $100', () => {
    const upkeep = new Set(ORDER_KINDS.filter((kind) => kind.upkeep).map((kind) => kind.id));
    expect(upkeep.size).toBeGreaterThanOrEqual(5);
    // Nothing that is only planted, collected or measured by the calendar counts as a yearly cost.
    for (const id of ['plantTrees', 'layQuads', 'benches', 'collectRound', 'graduateClass', 'calmSemester', 'levelUp']) expect(upkeep.has(id), id).toBe(false);
    expect(ORDER_UPKEEP_KEPT).toBeGreaterThanOrEqual(14);
    expect(ORDER_UPKEEP_KEPT).toBeLessThanOrEqual(17);
    // A new campus keeps $16.60, and is asked.
    expect(budget(BASE).kept).toBeGreaterThanOrEqual(ORDER_UPKEEP_KEPT);
    expect([...kindsOn(BASE)].some((id) => upkeep.has(id))).toBe(true);
    // One that spends more keeps less than that, and is never asked to spend again.
    let poor = act(fresh(), { type: 'marketing', step: 4 });
    for (let step = 0; step <= 10; step++) {
      const tried = applyAction(poor, { type: 'instruction', step });
      if (tried.ok && budget(tried.state).kept < budget(poor).kept) poor = tried.state;
    }
    expect(budget(poor).kept).toBeLessThan(ORDER_UPKEEP_KEPT);
    const asked = kindsOn(poor);
    expect(asked.size).toBeGreaterThan(2);
    for (const id of asked) expect(upkeep.has(id), id).toBe(false);
    // It still has an order for one sitting.
    expect([...asked].some((id) => kindOf(id).sitting)).toBe(true);
  });

  it('asks for a round of collecting only when it can be done now', () => {
    const kind = kindOf('collectRound');
    expect(kind).toMatchObject({ giver: 'town', sitting: true, when: 'readyToCollect' });
    expect(kind.reward.every((reward) => reward.kind === 'xp')).toBe(true);
    // A new game finds its food places full, so there is a round to make.
    expect(readyToCollect(BASE).length).toBeGreaterThanOrEqual(kind.target.n!);
    const { state, order } = asked('collectRound');
    expect(view(state, order.id)).toMatchObject({ from: 'The town', title: `Collect from ${kind.target.n} buildings`, progress: `0 of ${kind.target.n}`, sitting: true });
    const done = act(state, { type: 'collectAll' });
    expect(view(done, order.id).done).toBe(true);
    // With everything just collected there is nothing to go round for, and the town asks for something else.
    expect(readyToCollect(done).length).toBe(0);
    for (let roll = 0; roll < 12; roll++) {
      const empty = structuredClone(done);
      empty.orders.rest = {};
      empty.orders.open = [stub(empty, 70, 'town', roll)];
      expect(act(empty, { type: 'seeOrders' }).orders.open.find((one) => one.id === 70)!.kind).not.toBe('collectRound');
    }
  });
});

describe('an order', () => {
  it('counts what is done from the moment it is first seen', () => {
    const before = act(fresh(), { type: 'paint', tool: 'tree', cells: bare(BASE, 3) });
    const { state, order } = asked('plantTrees', before);
    expect(view(state, order.id)).toMatchObject({ from: 'The town', title: 'Plant 8 trees', progress: '0 of 8', done: false, reward: 'a flower box and 60 experience', sitting: true, season: false });
    const some = act(state, { type: 'paint', tool: 'tree', cells: bare(state, 3) });
    expect(view(some, order.id)).toMatchObject({ progress: '3 of 8', done: false });
    expect(view(some, order.id).share).toBeCloseTo(3 / 8);
    expect(applyAction(some, { type: 'claimOrder', id: order.id })).toMatchObject({ ok: false, error: 'That order is not finished yet.' });
    const all = act(some, { type: 'paint', tool: 'tree', cells: bare(some, 5) });
    expect(view(all, order.id)).toMatchObject({ progress: 'Done', done: true, left: '', share: 1 });
    expect(orderCounts(all)).toMatchObject({ done: 1 });
  });

  it('pays when it is claimed, with one line in the paper, and leaves the board', () => {
    const { state, order } = asked('plantTrees');
    const done = act(state, { type: 'paint', tool: 'tree', cells: bare(state, 8) });
    const xp = done.daily.xp;
    const result = applyAction(done, { type: 'claimOrder', id: order.id });
    if (!result.ok) throw new Error(result.error);
    expect(result.paid).toEqual([
      { kind: 'decor', amount: 1, id: 'flowerBox' },
      { kind: 'xp', amount: 60 },
    ]);
    expect(paidWords(result.paid!)).toBe('+a flower box and 60 experience');
    const claimed = result.state;
    expect(claimed.daily.xp).toBe(xp + 60);
    // The decoration is in storage, to be placed for nothing.
    expect(claimed.decor.stored.flowerBox).toBe(1);
    expect(claimed.orders.open.some((one) => one.id === order.id)).toBe(false);
    expect(claimed.orders.tally).toMatchObject({ claimed: 1, 'claimed:plantTrees': 1, xp: 60, decor: 1 });
    expect(applyAction(claimed, { type: 'claimOrder', id: order.id })).toMatchObject({ ok: false, error: 'That order is not on the board.' });
    const told = advance(claimed, claimed.clock.lastSimulatedAt, claimed.clock.lastSimulatedAt + MIN);
    const lines = told.log.filter((entry) => entry.kind === 'order' && entry.data?.done === 1);
    expect(lines.map((entry) => entry.text)).toEqual(['Order done for the town: Plant 8 trees. It paid a flower box and 60 experience.']);
    expect(told.state.orders.news).toEqual([]);
    expect(awayLines(told.log, facts(told.state)).map((line) => line.text)).toContain('Order done for the town: Plant 8 trees. It paid a flower box and 60 experience.');
    expect(advance(told.state, told.state.clock.lastSimulatedAt, told.state.clock.lastSimulatedAt + MIN).log.filter((entry) => entry.kind === 'order')).toEqual([]);
  });

  it('reads a number from the campus as it stands', () => {
    const { state, order } = asked('levelUp');
    const level = state.daily.level;
    expect(view(state, order.id)).toMatchObject({ title: `Reach University Level ${level + 1}`, progress: `Now ${level}`, done: false });
    expect(view(state, order.id).from).toBe(`The ${donorName(state)} family`);
    const up = structuredClone(state);
    up.daily.xp = 0;
    up.daily.level = 1;
    gainXp(up, 1e7);
    expect(up.daily.level).toBeGreaterThan(level);
    expect(view(up, order.id).done).toBe(true);
    // A line of the Capacity page is asked by the advisor it belongs to, with its number and its unit.
    const row = asked('fixRow');
    const shown = view(row.state, row.order.id);
    expect(row.order.param).toBe('care');
    expect(shown.from).toMatch(/^Dean of Students /);
    expect(shown.title).toMatch(/^Safety & health: reach [\d,]+ students covered$/);
    expect(row.order.target!).toBeGreaterThan(row.order.from!);
    expect(shown.progress).toMatch(/^Now [\d,]+$/);
  });

  it('measures a season order once, at its point of the calendar', () => {
    const { state, order } = asked('graduateClass');
    expect(kindOf(order.kind).point).toBe('graduation');
    const shown = view(state, order.id);
    expect(shown).toMatchObject({ from: 'The state', progress: 'Measured at graduation', season: true, sitting: false, done: false });
    expect(shown.title).toMatch(/^Graduate [\d,]+ seniors this spring$/);
    expect(order.target! % 100).toBe(0);
    expect(order.target!).toBeLessThanOrEqual(state.cohorts[3]);
    expect(order.until! - order.seen!).toBeGreaterThanOrEqual(ORDER_LEAST_HOURS * TICKS_PER_HOUR);
    // A mark left before it was seen does not count.
    const old = structuredClone(state);
    old.orders.marks.push({ at: order.seen! - 5, what: 'graduation', value: order.target! + 500 });
    expect(status(old, order.id).done).toBe(false);
    // Enough seniors at the graduation after: done. Too few: it ends there, and costs nothing.
    const on = later(state, HOUR);
    const good = structuredClone(on);
    ordersMark(good, 'graduation', order.target!);
    expect(status(good, order.id)).toMatchObject({ done: true, missed: false });
    const short = structuredClone(on);
    ordersMark(short, 'graduation', order.target! - 1);
    expect(status(short, order.id)).toMatchObject({ done: false, missed: true });
    // For Stress, less is the better number.
    const calm = asked('calmSemester');
    const after = later(calm.state, HOUR);
    const under = structuredClone(after);
    ordersMark(under, 'semesterStress', calm.order.target!);
    expect(status(under, calm.order.id).done).toBe(true);
    const over = structuredClone(after);
    ordersMark(over, 'semesterStress', calm.order.target! + 1);
    expect(status(over, calm.order.id)).toMatchObject({ done: false, missed: true });
  });

  it('really is measured by the calendar: a graduation leaves its mark', () => {
    const { state, order } = asked('graduateClass');
    const year = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 8 * DAY).state;
    const mark = year.orders.marks.find((one) => one.what === 'graduation' && one.at > order.seen!);
    expect(mark).toBeDefined();
    expect(mark!.value).toBeGreaterThan(0);
    for (const what of ['intakeClean', 'fallFull', 'semesterStress', 'semesterLeft']) expect(year.orders.marks.some((one) => one.what === what), what).toBe(true);
    expect(status(year, order.id).done || status(year, order.id).missed).toBe(true);
  });

  it('waits to be claimed for as long as it takes, once it is finished', () => {
    const { state, order } = asked('plantTrees');
    const done = act(act(state, { type: 'paint', tool: 'tree', cells: bare(state, 8) }), { type: 'seeOrders' });
    expect(done.orders.open.find((one) => one.id === order.id)!.done).toBe(done.clock.tick);
    const months = act(later(done, 60 * DAY), { type: 'seeOrders' });
    expect(months.clock.tick).toBeGreaterThan(order.until!);
    expect(view(months, order.id)).toMatchObject({ done: true, progress: 'Done' });
    expect(months.orders.note).toBe('');
    expect(applyAction(months, { type: 'dismissOrder', id: order.id })).toMatchObject({ ok: false, error: 'That order is finished. Claim it.' });
    const claimed = act(months, { type: 'claimOrder', id: order.id });
    expect(claimed.daily.xp).toBe(months.daily.xp + 60);
  });

  it('costs nothing when it is missed, and says so kindly', () => {
    const { state, order } = asked('plantTrees');
    const late = later(state, 3 * DAY);
    expect(late.clock.tick).toBeGreaterThan(order.until!);
    // Until the player looks, it is still there.
    expect(late.orders.open.some((one) => one.id === order.id)).toBe(true);
    const looked = act(late, { type: 'seeOrders' });
    expect(looked.orders.open.some((one) => one.id === order.id)).toBe(false);
    expect(looked.orders.note).toBe('Time ran out on "Plant 8 trees". Nothing is lost, and a new order comes tomorrow.');
    expect(toneProblem(looked.orders.note)).toBeNull();
    expect(ordersView(looked)!.note).toBe(looked.orders.note);
    expect(looked.orders.tally).toMatchObject({ missed: 1, 'missed:plantTrees': 1 });
    expect(looked.money.cash).toBe(late.money.cash);
    expect(looked.daily).toEqual(late.daily);
    expect(looked.cohorts).toEqual(late.cohorts);
    // The note is said once.
    expect(act(looked, { type: 'seeOrders' }).orders.note).toBe('');
    // Finished a little late still counts, if the number is there when the player looks.
    const planted = act(late, { type: 'paint', tool: 'tree', cells: bare(late, 8) });
    const kind = act(planted, { type: 'seeOrders' });
    expect(view(kind, order.id).done).toBe(true);
  });

  it('is dismissed free, is replaced the next day, and that kind then rests a week', () => {
    const { state, order } = asked('plantTrees');
    const cash = state.money.cash;
    const gone = act(state, { type: 'dismissOrder', id: order.id });
    expect(gone.orders.open.some((one) => one.id === order.id)).toBe(false);
    expect(gone.money.cash).toBe(cash);
    expect(gone.daily).toEqual(state.daily);
    expect(gone.orders.tally).toMatchObject({ dismissed: 1, 'dismissed:plantTrees': 1 });
    expect(gone.orders.rest.plantTrees).toBe(gone.clock.tick + ORDER_REST_HOURS * TICKS_PER_HOUR);
    expect(ORDER_REST_HOURS).toBe(7 * 24);
    expect(applyAction(gone, { type: 'dismissOrder', id: order.id })).toMatchObject({ ok: false });
    // The town asks for something else meanwhile, and may ask for trees again after the week.
    const rested = structuredClone(gone);
    rested.orders.rest = { plantTrees: gone.orders.rest.plantTrees! };
    for (let roll = 0; roll < 12; roll++) {
      const soon = structuredClone(rested);
      soon.orders.open = [stub(soon, 950, 'town', roll)];
      expect(act(soon, { type: 'seeOrders' }).orders.open.find((one) => one.id === 950)!.kind).not.toBe('plantTrees');
    }
    const next = later(gone, DAY);
    expect(next.orders.open.length).toBe(gone.orders.open.length + 1);
    // An order not yet seen can be dismissed too.
    const unseen = fresh();
    const first = unseen.orders.open[0]!.id;
    expect(act(unseen, { type: 'dismissOrder', id: first }).orders.open).toHaveLength(2);
  });

  it('pays a grant on the campus\'s own count, and no more in a year than the cap', () => {
    const { state, order } = asked('graduateClass');
    const scale = scaleOf(state);
    const kind = kindOf('graduateClass');
    const grant = kind.reward.find((reward) => reward.kind === 'cash')!.amount * scale;
    const cap = ORDER_CASH_YEAR * scale;
    expect(orderCashCeiling(state)).toBe(cap);
    expect(orderCashLeft(state)).toBe(cap);
    expect(grant).toBeLessThan(cap);
    const on = later(state, HOUR);
    ordersMark(on, 'graduation', order.target!);
    const live = on.orders.open.find((one) => one.id === order.id)!;
    expect(orderRewards(on, live)).toEqual([
      { kind: 'cash', amount: grant },
      { kind: 'xp', amount: 100 },
    ]);
    expect(view(on, order.id).reward).toBe(rewardWords(orderRewards(on, live)));
    expect(view(on, order.id).reward).toMatch(/^\$[\d,.]+[KM]? and 100 experience$/);
    const claimed = act(on, { type: 'claimOrder', id: order.id });
    expect(claimed.money.cash).toBe(on.money.cash + grant);
    expect(claimed.orders.paid).toBe(grant);
    expect(orderCashLeft(claimed)).toBe(cap - grant);
    // Near the cap it pays what is left. At the cap it pays its experience alone. A new year starts it again.
    const near = structuredClone(on);
    near.orders.paidYear = Math.max(1, near.clock.week.year);
    near.orders.paid = cap - 1000;
    expect(orderRewards(near, near.orders.open.find((one) => one.id === order.id)!)[0]).toEqual({ kind: 'cash', amount: 1000 });
    const less = act(near, { type: 'claimOrder', id: order.id });
    expect(less.money.cash).toBe(near.money.cash + 1000);
    expect(less.orders.paid).toBe(cap);
    const spent = structuredClone(on);
    spent.orders.paidYear = Math.max(1, spent.clock.week.year);
    spent.orders.paid = cap;
    expect(view(spent, order.id).reward).toBe('100 experience');
    expect(act(spent, { type: 'claimOrder', id: order.id }).money.cash).toBe(spent.money.cash);
    spent.orders.paidYear -= 1;
    expect(orderCashLeft(spent)).toBe(cap);
    // The whole cap is a sliver of what a campus takes in.
    expect((100 * cap) / on.money.incomePerYear).toBeLessThan(0.1);
  });

  it('pays Gold Seals from the donors, who are the game\'s own made-up family', () => {
    expect(giverName(BASE, 'donors')).toBe(`The ${donorName(BASE)} family`);
    expect(giverName(BASE, 'donors', true)).toBe(`the ${donorName(BASE)} family`);
    expect(giverName(model(77), 'donors')).toBe(`The ${donorName(model(77))} family`);
    const { state, order } = asked('layQuads');
    const done = act(state, { type: 'paint', tool: 'quad', cells: bare(state, 6) });
    const claimed = act(done, { type: 'claimOrder', id: order.id });
    const seals = kindOf('layQuads').reward.find((reward) => reward.kind === 'seals')!.amount;
    // The Seals are the order's own, beside any a level reached on the way gives.
    expect(claimed.orders.tally.seals).toBe(seals);
    expect(claimed.daily.seals).toBeGreaterThanOrEqual(done.daily.seals + seals);
    expect(rewardWords([{ kind: 'seals', amount: 1 }, { kind: 'xp', amount: 60 }])).toBe('1 Gold Seal and 60 experience');
    expect(rewardWords([{ kind: 'seals', amount: 2 }])).toBe('2 Gold Seals');
  });

  it('changes nothing else: a board looked at and emptied leaves the campus as it was', () => {
    const untouched = later(fresh(), 5 * DAY);
    let used = act(fresh(), { type: 'seeOrders' });
    for (const order of [...used.orders.open]) used = act(used, { type: 'dismissOrder', id: order.id });
    expect(used.orders.open).toEqual([]);
    used = later(used, 5 * DAY);
    expect(rest(used)).toEqual(rest(untouched));
  });
});

describe('the paper and the buttons', () => {
  it('says each new order in one line, and several as one', () => {
    const order = (text: string, data: Record<string, number>): LogEntry => ({ tick: 10, kind: 'order', text, data });
    const one = [order('A new order from the town is on the board.', { id: 4, new: 1 })];
    expect(awayLines(one, facts(BASE)).map((line) => line.text)).toContain('A new order from the town is on the board.');
    const three = [order('A new order from the town is on the board.', { id: 4, new: 1 }), order('A new order from the state is on the board.', { id: 5, new: 1 }), order('A new order from your advisors is on the board.', { id: 6, new: 1 })];
    const lines = awayLines(three, facts(BASE)).map((line) => line.text);
    expect(lines).toContain('3 new orders are on the board.');
    expect(lines).not.toContain('A new order from the town is on the board.');
    // Finished ones are a line each.
    const done = [order('Order done for the town: Plant 8 trees. It paid 120 experience.', { done: 1 }), order('Order done for the state: Have 51,000 seats. It paid $56,000 and 60 experience.', { done: 1 })];
    const said = awayLines(done, facts(BASE)).map((line) => line.text);
    expect(said).toContain(done[0]!.text);
    expect(said).toContain(done[1]!.text);
  });

  it('shows on the Orders button what is done first, then what is new, then how many are open', () => {
    expect(ordersChip(BASE)).toEqual({ value: '3 new', label: 'orders', tone: 'urgent' });
    const { state, order } = asked('plantTrees');
    expect(ordersChip(state)).toEqual({ value: '1', label: 'orders', tone: '' });
    const done = act(state, { type: 'paint', tool: 'tree', cells: bare(state, 8) });
    expect(ordersChip(done)).toEqual({ value: '1 done', label: 'orders', tone: 'good' });
    const empty = act(done, { type: 'claimOrder', id: order.id });
    expect(ordersChip(empty)).toEqual({ value: '', label: 'orders', tone: '' });
    const page = ordersView(state)!;
    expect(page.count).toBe(`1 of ${orderSlots(state)} orders`);
    expect(page.next).toBe('A new order comes tomorrow.');
    expect(page.rows).toHaveLength(1);
    const seen = act(fresh(), { type: 'seeOrders' });
    if (seen.orders.open.length === orderSlots(seen)) expect(ordersView(seen)!.next).toBe('');
  });

  it('keeps every button of the row to a number over a word', () => {
    expect(shortLeft(3 * 24 * TICKS_PER_HOUR + 5)).toBe('3 d');
    expect(shortLeft(18 * TICKS_PER_HOUR + 40)).toBe('18 h');
    expect(shortLeft(45)).toBe('45 m');
    expect(shortLeft(0)).toBe('1 m');
    expect(inboxStat(BASE)).toEqual({ value: '', label: 'inbox', tone: '' });
    const busy = later(fresh(), 12 * DAY);
    const stat = inboxStat(busy);
    const waiting = busy.decisions.open.filter((item) => item.chosen === null).length + busy.inbox.open.length;
    if (waiting > 0) {
      expect(stat.label).toBe('to decide');
      expect(stat.value).toMatch(new RegExp(`^${waiting} · \\d+ [dhm]$`));
      expect(stat.tone).toBe('urgent');
    } else expect(stat).toEqual({ value: '', label: 'inbox', tone: '' });
    // No policies page before its era, and no football before a season.
    expect(policyStat(BASE)).toBeNull();
    const ball = footballStat(busy);
    if (ball) {
      expect(ball.value).toMatch(/^\d+-\d+$/);
      expect(['football', 'live']).toContain(ball.label);
    }
    for (const chip of [stat, ball, ordersChip(busy)]) if (chip) expect(chip.value.length + chip.label.length).toBeLessThanOrEqual(18);
  });
});

describe('saves', () => {
  it('keeps the board through a save and a load', () => {
    const { state } = asked('plantTrees');
    const played = act(later(act(state, { type: 'paint', tool: 'tree', cells: bare(state, 3) }), 9 * HOUR), { type: 'seeOrders' });
    const loaded = parseSave(serialize(played, T0 + 3 * DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.state.orders).toEqual(played.orders);
    expect(loaded.state).toEqual(played);
    expect(orderViews(loaded.state)).toEqual(orderViews(played));
    expect(validate(loaded.state)).toBeNull();
  });

  describe('from version 18', () => {
    const text = readFileSync(new URL('./fixtures/save-v18-model.json', import.meta.url), 'utf8');

    it("comes through with nothing else moved, and its first three orders: the owner's own kind of game", () => {
      const file = JSON.parse(text) as { v: number; savedAt: number; state: GameState };
      expect(file.v).toBe(18);
      expect(file.state.school.name).toBe('Larp University');
      expect(file.state.map.scale).toBe(28);
      expect(file.state.clock.week.year).toBe(1);
      expect(file.state.daily.level).toBe(1);
      expect(file.state.orders).toBeUndefined();
      expect((file.state.rng as Record<string, unknown>).orders).toBeUndefined();

      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      const state = loaded.state;
      expect(loaded.migratedFrom).toBe(18);
      expect(SAVE_VERSION).toBe(29);
      // A game already in play opens with its first three orders, none seen, and nothing said.
      expect(state.orders.open).toHaveLength(3);
      expect(state.orders.open.every((order) => order.seen === undefined && order.kind === undefined && order.offered === file.state.clock.tick)).toBe(true);
      expect(state.orders).toMatchObject({ news: [], note: '', marks: [], rest: {}, paid: 0 });
      expect(state.rng.orders).toBeDefined();
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.orders = state.orders;
      // Version 20 adds the decorations in storage and the Workshop (tests/decor.test.ts has those).
      expected.decor = state.decor;
      expected.rhythm = state.rhythm;
      expected.bigBuilds = state.bigBuilds;
      expected.labs = state.labs;
      expected.traditions = state.traditions;
      expected.greek = newGreek();
      expected.rng.orders = state.rng.orders;
      // Version 27 adds the alumni pool (tests/alumni.test.ts has it).
      expected.alumni = state.alumni;
      // Version 28 adds the Main Character's story (tests/mc.test.ts has it).
      expected.story = newStory();
      expect(state).toEqual(expected);
      expect(validate(state)).toBeNull();
      // Money, students and Happiness are to the cent what they were.
      expect(state.money).toEqual(file.state.money);
      expect(state.daily).toEqual(file.state.daily);
      // The same file gives the same board, and a saved one is not given three more.
      const twice = parseSave(text);
      if (!twice.ok) throw new Error(twice.reason);
      expect(twice.state.orders).toEqual(state.orders);
      const again = parseSave(serialize(state, file.savedAt));
      if (!again.ok) throw new Error(again.reason);
      expect(again.migratedFrom).toBeNull();
      expect(again.state.orders).toEqual(state.orders);
      // And the board works: a look starts them, with something for one sitting.
      const seen = act(state, { type: 'seeOrders' });
      expect(orderViews(seen).some((one) => one.sitting)).toBe(true);
      expect(advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + HOUR).log.filter((entry) => entry.kind === 'order')).toEqual([]);
    });

    it('is told what is new, once', () => {
      // Its own, and the one version 20 added after it (tests/decor.test.ts).
      const notes = upgradeNotes(18);
      expect(notes).toHaveLength(11);
      expect(notes[0]).toContain('orders board');
      expect(toneProblem(notes[0]!)).toBeNull();
      expect(upgradeNotes(SAVE_VERSION)).toEqual([]);
    });

    it('gives a small campus saved at version 18 no board', () => {
      const small = freshGame();
      const file = { v: 18, savedAt: T0, state: structuredClone(small) as unknown as Record<string, unknown> & { rng: Record<string, unknown>; version: number } };
      delete file.state.orders;
      delete file.state.rng.orders;
      file.state.version = 18;
      const loaded = parseSave(JSON.stringify(file));
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.migratedFrom).toBe(18);
      expect(loaded.state.orders).toEqual(newOrders());
      expect(loaded.state).toEqual(small);
    });
  });
});
