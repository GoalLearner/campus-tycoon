import { newGreek } from '../src/sim/systems/greek';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  awayLines,
  COMMENCEMENT_SHARE,
  decorOffers,
  decorOwned,
  edition,
  GIFT_CARD,
  GIFT_DAY_EARLY,
  giftDecor,
  giftDayNow,
  LEVEL_MOST,
  LEVEL_MOST_BEFORE_21,
  levelAt,
  levelCost,
  relevelXp,
  giftReady,
  giftView,
  MOMENT_LEAST_HOURS,
  MOMENTS,
  momentViews,
  newGame,
  newRhythm,
  ORDER_KINDS,
  orderCashLeft,
  orderSlots,
  parseSave,
  planNotices,
  SAVE_VERSION,
  scaleOf,
  serialize,
  TICKS_PER_HOUR,
  toneProblem,
  validate,
  YEAR_KINDS,
  YEAR_PAY,
  yearView,
  yearWords,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

/**
 * The daily and seasonal rhythm (DESIGN.md 42.8, as built in section 44):
 * the day's gift, the goals for the year and the moments of the calendar.
 * Bonus only: nothing is taken for being away, no streak resets, no rank.
 */

const ANCHOR = 900;
const model = (seed = 11): GameState => newGame({ seed, name: 'Test University', now: T0, anchor: ANCHOR, campus: 'model' });

function act(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const to = (state: GameState, ms: number): { state: GameState; log: LogEntry[] } => advance(state, state.clock.lastSimulatedAt, ms);
const left = (ticks: number): string => `${Math.round(ticks / 60)} h`;

/** The real moment the player's day starts, on the day of `ms`: two hours before the anchor. */
function morning(ms: number): number {
  const day = Math.floor((ms / MIN - (ANCHOR - GIFT_DAY_EARLY)) / (24 * 60));
  return (day * 24 * 60 + ANCHOR - GIFT_DAY_EARLY) * MIN;
}

/** A model campus played a real week and a day, taking the gift and claiming what goes well on each morning's look. */
const WEEK = (() => {
  let state = model();
  const log: LogEntry[] = [];
  const gifts: number[] = [];
  for (let d = 0; d <= 8; d++) {
    const step = to(state, morning(T0) + d * DAY + 3 * HOUR);
    state = step.state;
    log.push(...step.log);
    const took = applyAction(state, { type: 'takeGift' });
    if (took.ok) {
      state = took.state;
      gifts.push(took.gift!.box);
    }
    for (const row of momentViews(state, left)) if (row.done) state = act(state, { type: 'claimMoment', id: row.id });
  }
  return { state, log, gifts };
})();

describe('the day\'s gift', () => {
  it('is a card of seven boxes, and the seventh is the better gift', () => {
    expect(GIFT_CARD).toHaveLength(7);
    const seventh = GIFT_CARD[6]!;
    expect(seventh.seals).toBeGreaterThan(0);
    expect(seventh.decor).toBe(true);
    for (const box of GIFT_CARD.slice(0, 6)) {
      expect(seventh.xp).toBeGreaterThan(box.xp);
      expect(box.seals ?? 0).toBe(0);
    }
    // The card says what each box holds, in plain words.
    const words = giftView(model())!.boxes[6]!.words;
    expect(words).toMatch(seventh.seals === 1 ? /a Gold Seal\b/ : /\d Gold Seals/);
    expect(words).not.toMatch(/\b1 Gold Seals/);
  });

  it('fills one box each of the player\'s days, and the card starts again after the seventh', () => {
    expect(WEEK.gifts).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2]);
    expect(WEEK.state.rhythm.tally.cards).toBe(1);
  });

  it('gives once a day: a second look the same day finds it taken, and the next morning it is back', () => {
    let state = act(model(), { type: 'takeGift' });
    expect(giftReady(state)).toBe(false);
    expect(applyAction(state, { type: 'takeGift' })).toMatchObject({ ok: false, error: "Today's gift is taken. The next comes tomorrow." });
    // The player's day starts two hours before the anchor: a minute before it, still today; a minute after, tomorrow.
    const next = morning(T0) + DAY;
    expect(giftReady(to(state, next - 2 * MIN).state)).toBe(false);
    state = to(state, next + MIN).state;
    expect(giftReady(state)).toBe(true);
    expect(giftDayNow(state)).toBe(state.rhythm.giftDay + 1);
  });

  it('waits through a day missed, or a week: nothing resets, and the next box is the next one', () => {
    let state = act(model(), { type: 'takeGift' });
    state = act(to(state, morning(T0) + DAY + HOUR).state, { type: 'takeGift' });
    expect(state.rhythm.box).toBe(2);
    // Away three days: one gift waits, the third box, and the card has not gone back to the start.
    state = to(state, morning(T0) + 5 * DAY + HOUR).state;
    const took = applyAction(state, { type: 'takeGift' });
    expect(took.ok && took.gift).toMatchObject({ box: 3 });
  });

  it('pays experience, a little cash out of the orders\' yearly allowance, Seals on the seventh, and decorations into storage', () => {
    let state = model();
    const cash = state.money.cash;
    const allowance = orderCashLeft(state);
    // Box 1, then box 2 the next day, which has cash on the campus's own count.
    state = act(state, { type: 'takeGift' });
    state = to(state, morning(T0) + DAY + HOUR).state;
    const before = to(state, state.clock.lastSimulatedAt).state.money.cash;
    const second = applyAction(state, { type: 'takeGift' });
    if (!second.ok) throw new Error(second.error);
    expect(second.gift!.cash).toBe(GIFT_CARD[1]!.cash! * scaleOf(state));
    expect(second.state.money.cash - before).toBe(second.gift!.cash);
    expect(orderCashLeft(second.state)).toBe(allowance - second.gift!.cash);
    expect(cash).toBeGreaterThan(0);
    // The fourth box gives a decoration the shelf has opened, the kind the campus has fewest of, into storage.
    const week = WEEK.state;
    // Nine gifts in: the fourth and the seventh boxes gave one each.
    expect(week.rhythm.tally.giftDecor).toBe(2);
    expect(week.rhythm.tally.giftSeals).toBe(GIFT_CARD[6]!.seals);
    const stored = Object.values(week.decor.stored).reduce((sum, n) => sum + n, 0);
    expect(stored).toBeGreaterThanOrEqual(1);
    // A campus that already has one of every opened kind in storage still gets one: the kind it has fewest of.
    const full = structuredClone(week);
    const opened = decorOffers(full).filter((offer) => offer.spec.home.kind === 'shelf' && full.daily.level >= offer.spec.home.level);
    expect(opened.length).toBeGreaterThan(1);
    for (const offer of opened) full.decor.stored[offer.spec.id] = 3;
    full.decor.stored[opened[1]!.spec.id] = 1;
    expect(giftDecor(full)).toBe(opened[1]!.spec.id);
  });

  it('is not on a small campus, and taking it never moves the rank', () => {
    const small = freshGame();
    expect(giftReady(small)).toBe(false);
    expect(giftView(small)).toBeNull();
    expect(applyAction(small, { type: 'takeGift' }).ok).toBe(false);
    const state = model();
    const took = act(state, { type: 'takeGift' });
    expect(took.field).toEqual(state.field);
  });
});

describe('goals for the year', () => {
  it('are three kinds, one easy, one medium and one a stretch, set when the fall class moves in', () => {
    const set = WEEK.log.filter((entry) => entry.kind === 'rhythm' && entry.data?.year === 1);
    expect(set.length).toBeGreaterThanOrEqual(1);
    const fresh = to(model(), T0 + DAY + 12 * HOUR).state;
    const year = fresh.rhythm.year!;
    expect(year.goals.map((goal) => goal.level)).toEqual(['easy', 'medium', 'stretch']);
    expect(new Set(year.goals.map((goal) => goal.kind)).size).toBe(3);
    for (const goal of year.goals) {
      expect(YEAR_KINDS.some((kind) => kind.id === goal.kind)).toBe(true);
      expect(yearWords(goal)).not.toMatch(/\{n\}|undefined|NaN/);
    }
    // A school year is one real week: they run to commencement, more than a day and a half away.
    expect(year.until - fresh.clock.tick).toBeGreaterThan(36 * TICKS_PER_HOUR);
  });

  it('are paid at commencement, each one met, and say how the year went', () => {
    const done = WEEK.log.filter((entry) => entry.kind === 'rhythm' && entry.data?.yearDone === 1);
    expect(done).toHaveLength(1);
    const last = WEEK.state.rhythm.lastYear!;
    expect(last.of).toBe(3);
    // What was paid is what the goals met pay, and nothing is taken for those missed.
    expect(last.xp).toBeLessThanOrEqual(YEAR_PAY.easy.xp + YEAR_PAY.medium.xp + YEAR_PAY.stretch.xp);
    expect(WEEK.state.rhythm.tally.goalsMet ?? 0).toBe(last.met);
    expect(done[0]!.text).toMatch(/^Goals for the year: /);
    // The next year's goals are set with the next fall class.
    expect(WEEK.state.rhythm.year?.year).toBe(WEEK.state.clock.week.year);
  });

  it('show on the board as a Year row with progress, and between commencement and move-in say how last year went', () => {
    const fresh = to(model(), T0 + DAY + 12 * HOUR).state;
    const view = yearView(fresh, left)!;
    expect(view.rows).toHaveLength(3);
    for (const row of view.rows!) {
      expect(row.share).toBeGreaterThanOrEqual(0);
      expect(row.share).toBeLessThanOrEqual(1);
      expect(toneProblem(`${row.words} ${row.progress} ${row.pays}`)).toBeNull();
    }
    expect(view.note).toMatch(/^Paid at commencement, in /);
    const summer = structuredClone(fresh);
    summer.rhythm.year = null;
    summer.rhythm.lastYear = { year: 1, met: 2, of: 3, xp: 400, seals: 1 };
    expect(yearView(summer, left)).toEqual({ rows: null, note: 'Last year: 2 of 3 goals met. Three new ones come with the fall class.' });
  });
});

describe('moments of the calendar', () => {
  it('each open a day and a half or more before they come, once, with a themed line in the paper', () => {
    const opened = WEEK.log.filter((entry) => entry.kind === 'rhythm' && entry.data?.moment !== undefined && entry.data?.met === undefined);
    expect(opened.length).toBeGreaterThanOrEqual(4);
    const keys = WEEK.state.rhythm.opened;
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of opened) expect(toneProblem(entry.text)).toBeNull();
    // Every moment's own clock: opened at least 36 hours before it comes.
    const tally = WEEK.state.rhythm.tally;
    for (const kind of ['rivalry', 'finals', 'commencement'] as const) expect(tally[`opened:${kind}`] ?? 0).toBeGreaterThan(0);
    const fresh = to(model(), T0 + 2 * DAY).state;
    for (const moment of fresh.rhythm.moments) expect(moment.at - moment.opened).toBeGreaterThanOrEqual(MOMENT_LEAST_HOURS * TICKS_PER_HOUR);
  });

  it('are measured when they come, and one that goes well waits to be claimed and pays more than an ordinary order', () => {
    const tally = WEEK.state.rhythm.tally;
    const measured = Object.keys(tally).filter((key) => key.startsWith('met:') || key.startsWith('missed:'));
    expect(measured.length).toBeGreaterThan(0);
    const met = Object.keys(tally).filter((key) => key.startsWith('met:')).reduce((sum, key) => sum + tally[key]!, 0);
    const claimed = Object.keys(tally).filter((key) => key.startsWith('claimed:')).reduce((sum, key) => sum + tally[key]!, 0);
    expect(claimed).toBe(met);
    // More experience than most orders pay, and a grant besides.
    const ordinary = ORDER_KINDS.map((kind) => kind.reward.find((pay) => pay.kind === 'xp')?.amount ?? 0).sort((a, b) => a - b);
    const middle = ordinary[Math.floor(ordinary.length / 2)]!;
    for (const spec of Object.values(MOMENTS)) {
      const xp = spec.pays.find((pay) => pay.kind === 'xp')?.amount ?? 0;
      expect(xp).toBeGreaterThan(middle);
      expect(spec.pays.some((pay) => pay.kind === 'cash')).toBe(true);
    }
  });

  it('ask the seniors\' own number at commencement, and take none of the board\'s places', () => {
    const state = to(model(), T0 + 2 * DAY).state;
    const slots = orderSlots(state);
    const open = state.orders.open.length;
    expect(open).toBeLessThanOrEqual(slots);
    expect(state.rhythm.moments.length).toBeGreaterThan(0);
    expect(COMMENCEMENT_SHARE).toBeLessThan(1);
    for (const row of momentViews(state, left)) {
      expect(row.ask).not.toMatch(/undefined|NaN/);
      expect(toneProblem(`${row.name} ${row.ask} ${row.when} ${row.pays}`)).toBeNull();
    }
  });

  it('cost nothing when they go by: one missed leaves the board and nothing is taken', () => {
    let state = to(model(), T0 + 2 * DAY).state;
    const moment = state.rhythm.moments[0]!;
    moment.met = false;
    moment.result = 0;
    moment.measured = state.clock.tick;
    const before = { cash: state.money.cash, seals: state.daily.seals, xp: state.daily.xp };
    expect(applyAction(state, { type: 'claimMoment', id: moment.id })).toMatchObject({ ok: false });
    state = to(state, state.clock.lastSimulatedAt + 2 * DAY).state;
    expect(state.rhythm.moments.some((one) => one.id === moment.id)).toBe(false);
    expect(state.daily.seals).toBeGreaterThanOrEqual(before.seals);
    expect(state.daily.xp).toBeGreaterThanOrEqual(before.xp);
  });
});

describe('the paper and the phone', () => {
  it('put how a moment went and how the year went near the top, and the rest in the back pages', () => {
    const rhythm = WEEK.log.filter((entry) => entry.kind === 'rhythm');
    const lines = awayLines(rhythm, { minutes: 600, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    expect(lines.map((line) => line.text)).toEqual(rhythm.map((entry) => entry.text));
    const good = lines.filter((line) => line.weight >= 60);
    expect(good.length).toBeGreaterThan(0);
    const paper = edition(WEEK.state, rhythm, { minutes: 600, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
    const said = [...paper.top.map((item) => item.text), ...paper.more];
    for (const entry of rhythm) expect(said).toContain(entry.text);
  });

  it('send one notice a morning at most of what is ready, in the player\'s waking hours', () => {
    const state = act(model(), { type: 'takeGift' });
    const notices = planNotices(state, { perDay: 3, wakeHour: 8, offsetMinutes: 0 });
    const ready = notices.filter((notice) => notice.kind === 'ready');
    expect(ready.length).toBeGreaterThanOrEqual(2);
    const days = ready.map((notice) => Math.floor((notice.at / MIN - 8 * 60) / (24 * 60)));
    expect(new Set(days).size).toBe(days.length);
    for (const notice of ready) {
      const minute = (((notice.at / MIN) % (24 * 60)) + 24 * 60) % (24 * 60);
      expect(minute).toBeGreaterThanOrEqual(8 * 60);
      expect(minute).toBeLessThan(23 * 60);
      expect(notice.body).toMatch(/gift card is waiting|Workshop|orders? (is|are) done/);
    }
    // A small campus has no gift, and the notices it had are as they were.
    expect(planNotices(freshGame(), { perDay: 3, wakeHour: 8, offsetMinutes: 0 }).some((notice) => notice.kind === 'ready')).toBe(false);
  });
});

describe('saves', () => {
  it('keep the rhythm through a save and a load', () => {
    const state = WEEK.state;
    const loaded = parseSave(serialize(state, state.clock.lastSimulatedAt));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.rhythm).toEqual(state.rhythm);
    expect(SAVE_VERSION).toBe(26);
  });

  describe('from version 20', () => {
    const text = readFileSync(new URL('./fixtures/save-v20-model.json', import.meta.url), 'utf8');
    const file = JSON.parse(text) as { savedAt: number; state: GameState & { version: number } };

    it('comes through with nothing else moved: the owner\'s own kind of game, with a fresh card and no goals yet', () => {
      expect(file.state.version).toBe(20);
      expect(file.state.rhythm).toBeUndefined();
      const loaded = parseSave(text);
      if (!loaded.ok) throw new Error(loaded.reason);
      const state = loaded.state;
      expect(loaded.migratedFrom).toBe(20);
      expect(state.rhythm).toEqual(newRhythm());
      const expected = structuredClone(file.state);
      expected.version = SAVE_VERSION;
      expected.rhythm = newRhythm();
      // Version 22 adds the big builds of the eras (tests/bigBuilds.test.ts has those), and 23 the labs (tests/labs.test.ts).
      expected.bigBuilds = state.bigBuilds;
      expected.labs = state.labs;
      expected.traditions = state.traditions;
      expected.greek = newGreek();
      expect(state).toEqual(expected);
      expect(validate(state)).toBeNull();
      // Its first look gives the first box, and the next start of a day sets the year's goals.
      expect(giftReady(state)).toBe(true);
      const day = to(state, file.savedAt + DAY).state;
      expect(day.rhythm.year?.goals).toHaveLength(3);
      const notes = upgradeNotes(20);
      expect(notes).toHaveLength(6);
      expect(notes[0]).toMatch(/gift each day/);
    });

    it('keeps the level of a game far along, though a level now asks more from level 20 on', () => {
      // The fixture's own campus, as if played to level 120 and 300 experience into the next under the old costs.
      const old = (level: number): number => Math.min(LEVEL_MOST_BEFORE_21, 60 + 40 * Math.max(0, level - 1));
      let xp = 300;
      for (let level = 1; level < 120; level++) xp += old(level);
      const far = structuredClone(file.state);
      far.daily.xp = xp;
      far.daily.level = 120;
      const loaded = parseSave(JSON.stringify({ ...file, state: far }));
      if (!loaded.ok) throw new Error(loaded.reason);
      const now = levelAt(loaded.state.daily.xp);
      expect(now.level).toBe(120);
      expect(loaded.state.daily.level).toBe(120);
      expect(now.into).toBe(Math.floor((300 * LEVEL_MOST) / LEVEL_MOST_BEFORE_21));
      // A game under level 20 had the same costs, and its experience is untouched.
      expect(relevelXp(file.state.daily.xp)).toBe(file.state.daily.xp);
      for (let level = 1; level < 20; level++) expect(levelCost(level)).toBe(old(level));
    });
  });

  it('leave a small campus with an empty rhythm, and its days as they were', () => {
    const small = to(freshGame(), T0 + 3 * DAY).state;
    expect(small.rhythm).toEqual(newRhythm());
  });
});
