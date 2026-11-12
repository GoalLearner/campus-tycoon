import { describe, expect, it } from 'vitest';
import {
  advance,
  advisorLines,
  ANNUAL_PAUSE,
  APPLICANTS_CAP,
  applicantsLift,
  applyAction,
  campusHappiness,
  enrollment,
  everyWrittenItem,
  fanDemand,
  FANS_CAP,
  fansLift,
  HAPPY_CAP,
  happyParts,
  INBOX_MIN_STUDENTS,
  inboxBlocked,
  MIN_WINDOW_TICKS,
  NEW_PER_DAY,
  newGame,
  newspaperLines,
  openRoutine,
  parseSave,
  ROUTINE_CAP,
  SAVE_VERSION,
  scaleOf,
  seatsNow,
  serialize,
  STRESS_OFF_CAP,
  stressOff,
  TICKS_PER_DAY,
  toneProblem,
  validate,
  type GameState,
  type InboxItem,
  type LogEntry,
} from '../src/sim';
import { DAY, freshGame, T0 } from './helpers';

/** A whole campus the size of the small game's, and the same one standing for 46,000. */
const whole = (scale?: number): GameState => newGame({ seed: 11, name: 'Larkspur University', now: T0, campus: 'model', ...(scale ? { scale } : {}) });

interface Seen {
  state: GameState;
  /** Every routine item and annual decision that opened: its key or kind, and its window. */
  opened: Array<{ key: string; opens: number; closes: number; annual: boolean }>;
  /** The tick of every visit. */
  visits: number[];
  /** The most routine items ever open at a visit, and every item as it was when first seen. */
  most: number;
  items: InboxItem[];
  log: LogEntry[];
}

/** Play `days` real days, looking in every `every` hours. A visitor takes the advisor's pick on everything open. */
function play(start: GameState, days: number, every: number | null): Seen {
  let state = start;
  const seen: Seen = { state, opened: [], visits: [], most: 0, items: [], log: [] };
  const step = (every ?? 24) * (DAY / 24);
  const known = new Set<number>();
  for (let now = T0 + step; now <= T0 + days * DAY; now += step) {
    const result = advance(state, state.clock.lastSimulatedAt, now);
    state = result.state;
    seen.log.push(...result.log);
    for (const entry of result.log) {
      if (entry.data?.closes === undefined) continue;
      if (entry.kind === 'inbox') seen.opened.push({ key: String(entry.data.key), opens: entry.tick, closes: Number(entry.data.closes), annual: false });
      else if (entry.kind === 'decision') seen.opened.push({ key: String(entry.data.kind), opens: entry.tick, closes: Number(entry.data.closes), annual: true });
    }
    seen.most = Math.max(seen.most, state.inbox.open.length);
    for (const item of state.inbox.open) {
      if (known.has(item.id)) continue;
      known.add(item.id);
      seen.items.push(structuredClone(item));
    }
    if (every === null) continue;
    seen.visits.push(state.clock.tick);
    for (const item of [...state.inbox.open]) {
      const picked = applyAction(state, { type: 'inbox', id: item.id, option: item.advised });
      if (picked.ok) state = picked.state;
    }
    for (const decision of state.decisions.open) {
      if (decision.chosen !== null) continue;
      const picked = applyAction(state, { type: 'decide', id: decision.id, option: decision.advised });
      if (picked.ok) state = picked.state;
    }
  }
  seen.state = state;
  return seen;
}

describe('the written items', () => {
  const written = everyWrittenItem(whole(1));

  it('are about twenty, and each has two or more choices, a default and a pick among them', () => {
    expect(written.length).toBeGreaterThanOrEqual(20);
    for (const { key, draft } of written) {
      expect(draft.options.length, key).toBeGreaterThanOrEqual(2);
      const ids = draft.options.map((option) => option.id);
      expect(new Set(ids).size, key).toBe(ids.length);
      expect(ids, `${key} default`).toContain(draft.fallback);
      expect(ids, `${key} pick`).toContain(draft.advised);
      expect(draft.title.length, key).toBeGreaterThan(5);
      expect(draft.body.length, key).toBeGreaterThan(30);
    }
  });

  it('never cost anything left alone: a default spends no money and pays nothing into the endowment', () => {
    for (const { key, draft } of written) {
      const fallback = draft.options.find((option) => option.id === draft.fallback)!;
      expect(fallback.cash, key).toBeGreaterThanOrEqual(0);
      expect(fallback.effects.some((effect) => effect.t === 'endow'), key).toBe(false);
    }
  });

  it('say what each choice does in words, and every paid choice says its price', () => {
    for (const { key, draft } of written) {
      for (const option of draft.options) {
        expect(option.detail.length, `${key} ${option.id}`).toBeGreaterThan(8);
        if (option.cash !== 0) expect(option.label, `${key} ${option.id}`).toMatch(/\$/);
      }
    }
  });

  it('keep to the tone guide: no line of any item, and no line of the paper, has a banned or retired word', () => {
    for (const { key, lines } of written) for (const line of lines) expect(toneProblem(line), `${key}: ${line}`).toBeNull();
    for (const line of newspaperLines()) expect(toneProblem(line), line).toBeNull();
    for (const advisor of advisorLines(whole(1))) expect(toneProblem(advisor.issue), advisor.issue).toBeNull();
  });

  it('move only what the game already has, a little: every push is small and dated', () => {
    for (const { key, draft } of written) {
      for (const option of draft.options) {
        for (const effect of option.effects) {
          if (effect.t !== 'boost') continue;
          expect(effect.ticks, key).toBeGreaterThan(0);
          expect(effect.ticks, key).toBeLessThanOrEqual(7 * TICKS_PER_DAY);
          if (effect.kind === 'happy') expect(Math.abs(effect.amount), key).toBeLessThanOrEqual(2);
          if (effect.kind === 'stress') expect(effect.amount, key).toBeLessThanOrEqual(STRESS_OFF_CAP);
          if (effect.kind === 'fans') expect(Math.abs(effect.amount), key).toBeLessThanOrEqual(0.15);
          if (effect.kind === 'applicants') expect(effect.amount, key).toBeLessThanOrEqual(APPLICANTS_CAP);
        }
      }
    }
  });
});

describe('the desk, for a player who looks in once a day', () => {
  const daily = play(whole(1), 28, 24);
  const routine = daily.opened.filter((item) => !item.annual);

  it('brings items, of more than a few kinds, each from something true of the campus', () => {
    expect(routine.length).toBeGreaterThan(12);
    expect(new Set(routine.map((item) => item.key)).size).toBeGreaterThanOrEqual(6);
    for (const item of daily.items) {
      // An item about a building is only ever about one the campus has.
      if (item.key === 'lateLibrary') expect(daily.state.map.placed.some((placed) => placed?.type === 'library')).toBe(true);
      if (item.key === 'filmCrew' || item.key === 'clubsFair') expect(daily.state.map.cells.some((cell) => cell.kind === 'quad')).toBe(true);
    }
  });

  it('keeps every window at 36 hours or more', () => {
    for (const item of daily.opened) expect(item.closes - item.opens, item.key).toBeGreaterThanOrEqual(MIN_WINDOW_TICKS);
  });

  it('never loses a decision unseen: every item, routine or annual, is open at one visit at least', () => {
    for (const item of daily.opened) {
      const visit = daily.visits.find((tick) => tick >= item.opens && tick < item.closes);
      // One that opened in the last day and a half of the run may still be waiting for its visit.
      if (item.opens > daily.visits[daily.visits.length - 1]! - MIN_WINDOW_TICKS) continue;
      expect(visit, `${item.key} opened at ${item.opens} and closed at ${item.closes}`).toBeDefined();
    }
  });

  it('never holds more than four routine items, and brings no more than two in a day', () => {
    expect(daily.most).toBeLessThanOrEqual(ROUTINE_CAP);
    const opens = routine.map((item) => item.opens).sort((a, b) => a - b);
    for (let n = 0; n < opens.length; n++) {
      const inDay = opens.filter((tick) => tick >= opens[n]! && tick < opens[n]! + TICKS_PER_DAY).length;
      expect(inDay).toBeLessThanOrEqual(NEW_PER_DAY);
    }
  });

  it('never opens the same item twice at once, and stores every item with its default and its pick', () => {
    for (const item of daily.items) {
      const ids = item.options.map((option) => option.id);
      expect(ids).toContain(item.fallback);
      expect(ids).toContain(item.advised);
      for (const line of [item.title, item.body, ...item.options.flatMap((option) => [option.label, option.detail])]) expect(toneProblem(line), line).toBeNull();
    }
    expect(validate(daily.state)).toBeNull();
  });

  it('gates nothing: the campus that takes every pick ends close to the one that never answers', () => {
    const alone = play(whole(1), 28, null);
    const ratio = enrollment(daily.state) / enrollment(alone.state);
    expect(ratio).toBeGreaterThan(0.97);
    expect(ratio).toBeLessThan(1.05);
    expect(daily.state.money.grants).toBe(0);
    expect(alone.state.money.grants).toBe(0);
  });
});

describe('an item nobody answers', () => {
  const alone = play(whole(1), 21, null);

  it('takes its marked default when its window closes, and says so in the away list', () => {
    const closed = alone.log.filter((entry) => entry.kind === 'inbox' && entry.data?.byDefault === 1);
    expect(closed.length).toBeGreaterThan(5);
    for (const entry of closed) expect(entry.text).toMatch(/nobody chose, so the default applied/);
    expect(alone.state.inbox.past.length).toBeGreaterThan(0);
    for (const past of alone.state.inbox.past) expect(past.byDefault).toBe(true);
    expect(alone.most).toBeLessThanOrEqual(ROUTINE_CAP);
  });

  it('never leaves a push behind: with every default taken, nothing the desk does is in force', () => {
    // No default starts a boost that helps, so an unattended desk can only do nothing.
    for (const boost of alone.state.inbox.boosts) expect(boost.amount).toBeLessThanOrEqual(0);
  });
});

describe('choosing', () => {
  const opened = (): { state: GameState; item: InboxItem } => {
    let state = whole(1);
    for (let day = 1; day <= 14; day++) {
      state = advance(state, state.clock.lastSimulatedAt, T0 + day * DAY).state;
      const item = state.inbox.open.find((open) => open.options.some((option) => option.cash < 0));
      if (item) return { state, item };
    }
    throw new Error('no item with a price opened in two weeks');
  };

  it('takes effect at once: the money moves, the push begins and the item leaves the desk', () => {
    const { state, item } = opened();
    const paid = item.options.find((option) => option.cash < 0)!;
    const result = applyAction(state, { type: 'inbox', id: item.id, option: paid.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.money.cash).toBeCloseTo(state.money.cash + paid.cash, 0);
    expect(result.state.inbox.open.some((open) => open.id === item.id)).toBe(false);
    expect(result.state.inbox.past[result.state.inbox.past.length - 1]!.byDefault).toBe(false);
    expect(result.state.inbox.boosts.length - state.inbox.boosts.length).toBe(paid.effects.filter((effect) => effect.t === 'boost').length);
    // The state it came from is untouched.
    expect(state.inbox.open.some((open) => open.id === item.id)).toBe(true);
  });

  it('says in words why a choice cannot be made, and changes nothing', () => {
    const { state, item } = opened();
    const paid = item.options.find((option) => option.cash < 0)!;
    const poor = structuredClone(state);
    poor.money.cash = 10;
    expect(inboxBlocked(poor, item, paid.id)).toMatch(/It costs \$/);
    const result = applyAction(poor, { type: 'inbox', id: item.id, option: paid.id });
    expect(result.ok).toBe(false);
    expect(applyAction(state, { type: 'inbox', id: 9999, option: 'no' }).ok).toBe(false);
    expect(applyAction(state, { type: 'inbox', id: item.id, option: 'not-a-choice' }).ok).toBe(false);
  });
});

describe('what the desk can do is capped where it is read', () => {
  const pile = (kind: 'happy' | 'stress' | 'fans' | 'applicants', amount: number, count: number): GameState => {
    const state = structuredClone(whole(1));
    for (let n = 0; n < count; n++) state.inbox.boosts.push({ kind, amount, until: state.clock.tick + TICKS_PER_DAY, label: `Push ${n}` });
    return state;
  };

  it('moves Happiness by three points at the most, either way, however many choices pile up', () => {
    const base = campusHappiness(whole(1)).score;
    const up = pile('happy', 2, 6);
    const down = pile('happy', -2, 6);
    expect(happyParts(up).reduce((sum, part) => sum + part.points, 0)).toBeCloseTo(HAPPY_CAP, 6);
    expect(happyParts(down).reduce((sum, part) => sum + part.points, 0)).toBeCloseTo(-HAPPY_CAP, 6);
    expect(campusHappiness(up).score - base).toBeLessThanOrEqual(HAPPY_CAP + 1e-6);
    expect(base - campusHappiness(down).score).toBeLessThanOrEqual(HAPPY_CAP + 1e-6);
  });

  it('caps the help with Stress, the crowd at a game and the applicants', () => {
    expect(stressOff(pile('stress', 10, 4)).points).toBeLessThanOrEqual(STRESS_OFF_CAP);
    expect(fansLift(pile('fans', 0.15, 5))).toBe(FANS_CAP.up);
    expect(fansLift(pile('fans', -0.06, 5))).toBe(FANS_CAP.down);
    expect(applicantsLift(pile('applicants', 0.04, 5))).toBe(APPLICANTS_CAP);
  });

  it('ends by itself: a push is over when its date passes, and one that waits has not begun', () => {
    const state = pile('happy', 2, 1);
    state.inbox.boosts[0]!.until = state.clock.tick;
    expect(happyParts(state)).toEqual([]);
    const later = pile('fans', 0.15, 1);
    later.inbox.boosts[0]!.from = later.clock.tick + 10;
    expect(fansLift(later)).toBe(0);
  });
});

describe('when the desk stays quiet', () => {
  it('brings nothing to a campus too small to have one', () => {
    const small = play(freshGame(), 3, null);
    expect(enrollment(small.state)).toBeLessThan(INBOX_MIN_STUDENTS);
    expect(small.opened.filter((item) => !item.annual)).toEqual([]);
  });

  it('pauses arrivals while two of the year\'s decisions are open', () => {
    let state = whole(1);
    state = structuredClone(advance(state, state.clock.lastSimulatedAt, T0 + 2 * DAY).state);
    const blank = { id: 900, kind: 'tv' as const, title: 'A', body: 'B', advisor: 'The Athletic Director', opens: state.clock.tick, closes: state.clock.tick + 3000, options: [], fallback: 'x', advised: 'x', chosen: null };
    state.inbox.open = [];
    state.inbox.last = {};
    const free = structuredClone(state);
    const log: LogEntry[] = [];
    openRoutine(free, 3, log);
    expect(free.inbox.open.length).toBeGreaterThan(0);
    for (let n = 0; n < ANNUAL_PAUSE; n++) state.decisions.open.push({ ...blank, id: 900 + n } as never);
    openRoutine(state, 3, []);
    expect(state.inbox.open).toEqual([]);
  });
});

describe('the desk at 46,000 students', () => {
  const big = play(whole(), 14, 24);
  const one = play(whole(1), 14, 24);

  it('offers and costs in proportion: a sum is so much for each student at either size', () => {
    expect(scaleOf(big.state)).toBeGreaterThan(20);
    const perStudent = (seen: Seen): number[] => seen.items.flatMap((item) => item.options.filter((option) => option.cash !== 0).map((option) => Math.abs(option.cash) / enrollment(seen.state)));
    const large = perStudent(big);
    const small = perStudent(one);
    expect(large.length).toBeGreaterThan(5);
    for (const each of [...large, ...small]) {
      expect(each).toBeGreaterThan(0.5);
      expect(each).toBeLessThan(40);
    }
  });

  it('writes every number so it can be read: no five figures in a row without a comma', () => {
    for (const item of big.items) {
      for (const line of [item.title, item.body, ...item.options.flatMap((option) => [option.label, option.detail])]) expect(line, line).not.toMatch(/\d{5,}/);
    }
    for (const entry of big.log) if (entry.kind === 'intake' || entry.kind === 'inbox' || entry.kind === 'yearEnd' || entry.kind === 'graduation') expect(entry.text, entry.text).not.toMatch(/\d{5,}/);
    for (const advisor of advisorLines(big.state)) expect(advisor.issue, advisor.issue).not.toMatch(/\d{5,}/);
  });

  it('holds back the items that only move the crowd where every game sells out anyway', () => {
    // 46,000 students want far more tickets than the stadium has seats, so a deal that costs a few fans would be free money.
    expect(fanDemand(big.state)).toBeGreaterThan(2 * seatsNow(big.state));
    expect(big.opened.filter((item) => item.key === 'scoreboard' || item.key === 'homecoming')).toEqual([]);
    // The small campus has empty seats, and its parade is offered.
    expect(one.opened.some((item) => item.key === 'homecoming')).toBe(true);
  });

  it('keeps the same rhythm: the cap, the windows and the visits hold there too', () => {
    expect(big.most).toBeLessThanOrEqual(ROUTINE_CAP);
    for (const item of big.opened) expect(item.closes - item.opens).toBeGreaterThanOrEqual(MIN_WINDOW_TICKS);
    expect(big.opened.filter((item) => !item.annual).length).toBeGreaterThan(5);
  });
});

describe('saves', () => {
  it('give a save from before the desk four named advisors and an empty inbox, and it carries on', () => {
    const before = advance(freshGame(), T0, T0 + 2 * DAY).state;
    const text = JSON.parse(serialize(before, T0 + 2 * DAY)) as { v: number; state: Record<string, unknown> };
    text.v = 13;
    delete text.state.inbox;
    const loaded = parseSave(JSON.stringify(text));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(13);
    expect(loaded.state.inbox.open).toEqual([]);
    expect(Object.keys(loaded.state.inbox.advisors).sort()).toEqual(['athletics', 'cfo', 'dean', 'provost']);
    for (const name of Object.values(loaded.state.inbox.advisors)) expect(name).toMatch(/^\S+ \S+$/);
    expect(validate(advance(loaded.state, loaded.state.clock.lastSimulatedAt, T0 + 9 * DAY).state)).toBeNull();
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(14);
  });

  it('round-trip a desk with items open and pushes in force, and carry on identically', () => {
    const seen = play(whole(1), 9, 48);
    expect(seen.state.inbox.open.length + seen.state.inbox.boosts.length).toBeGreaterThan(0);
    const loaded = parseSave(serialize(seen.state, T0 + 9 * DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state).toEqual(seen.state);
    const straight = advance(seen.state, seen.state.clock.lastSimulatedAt, T0 + 13 * DAY).state;
    const resumed = advance(loaded.state, loaded.state.clock.lastSimulatedAt, T0 + 13 * DAY).state;
    expect(resumed).toEqual(straight);
  });

  it('names the four advisors the way students are named, the same for the same campus', () => {
    const a = whole(1).inbox.advisors;
    const b = whole(1).inbox.advisors;
    expect(a).toEqual(b);
    expect(new Set(Object.values(a)).size).toBeGreaterThanOrEqual(3);
  });
});
