import { describe, expect, it } from 'vitest';
import {
  advance,
  CLOSING_SOON_TICKS,
  newGame,
  NOTICE_AWAKE_HOURS,
  NOTICE_DAYS,
  NOTICE_LEAST_LEFT_TICKS,
  NOTICES_DEFAULT,
  NOTICES_MOST,
  planNotices,
  TICK_MS,
  timeOfTick,
  toneProblem,
  type GameState,
  type InboxItem,
  type Notice,
  type NoticeOptions,
} from '../src/sim';
import { DAY, T0 } from './helpers';

const whole = (scale?: number): GameState => newGame({ seed: 11, name: 'Larkspur University', now: T0, campus: 'model', ...(scale ? { scale } : {}) });
const at = (state: GameState, days: number): GameState => advance(state, state.clock.lastSimulatedAt, T0 + days * DAY).state;

/** Minutes into the player's own day a notice falls: 0 is the hour their day starts. */
function minuteOfTheirDay(notice: Notice, options: NoticeOptions): number {
  const local = Math.floor(notice.at / TICK_MS) + options.offsetMinutes - options.wakeHour * 60;
  return ((local % 1440) + 1440) % 1440;
}
const theirDay = (notice: Notice, options: NoticeOptions): number => Math.floor((Math.floor(notice.at / TICK_MS) + options.offsetMinutes - options.wakeHour * 60) / 1440);

const PLAYERS: NoticeOptions[] = [
  { perDay: 2, wakeHour: 7, offsetMinutes: -480 },
  { perDay: 2, wakeHour: 6, offsetMinutes: -300 },
  { perDay: 1, wakeHour: 9, offsetMinutes: 60 },
  { perDay: 3, wakeHour: 5, offsetMinutes: 540 },
  { perDay: 2, wakeHour: 22, offsetMinutes: 0 },
];

/** A campus with nothing waiting but one item on the desk, closing so many minutes from now. */
function withOne(title: string, closesIn: number): { state: GameState; closes: number } {
  const state = structuredClone(at(whole(1), 2));
  const closes = state.clock.tick + closesIn;
  const item: InboxItem = { id: 77, key: 'concert', kind: 'event', advisor: 'dean', title, body: '', opens: state.clock.tick - 100, closes, options: [], fallback: 'none', advised: 'none' };
  state.inbox.open = [item];
  state.decisions.open = [];
  return { state, closes };
}

describe('planned notifications', () => {
  it('are two a day unless the player says otherwise, three at the most, and none when the number is 0', () => {
    expect(NOTICES_DEFAULT).toBe(2);
    expect(NOTICES_MOST).toBe(3);
    expect(planNotices(at(whole(1), 2), { perDay: 0, wakeHour: 7, offsetMinutes: -480 })).toEqual([]);
  });

  it('never pass the number in one of their days, never fall in their night, and are never in the past', () => {
    let planned = 0;
    for (const day of [1, 2, 4, 6, 8]) {
      const state = at(whole(1), day);
      for (const options of PLAYERS) {
        const notices = planNotices(state, options);
        planned += notices.length;
        const perDay = new Map<number, number>();
        for (const notice of notices) {
          expect(notice.at).toBeGreaterThan(state.clock.lastSimulatedAt);
          expect(notice.at).toBeLessThan(state.clock.lastSimulatedAt + NOTICE_DAYS * DAY);
          expect(minuteOfTheirDay(notice, options)).toBeLessThan(NOTICE_AWAKE_HOURS * 60);
          perDay.set(theirDay(notice, options), (perDay.get(theirDay(notice, options)) ?? 0) + 1);
          expect(notice.title.length).toBeGreaterThan(3);
          expect(notice.body.length).toBeLessThanOrEqual(150);
          expect(toneProblem(notice.body), notice.body).toBeNull();
        }
        for (const count of perDay.values()) expect(count).toBeLessThanOrEqual(options.perDay);
        // Soonest first.
        expect([...notices].sort((a, b) => a.at - b.at)).toEqual(notices);
      }
    }
    expect(planned).toBeGreaterThan(20);
  });

  it('send one notice about decisions in a day, however many are closing', () => {
    for (const day of [2, 3, 5]) {
      const state = at(whole(1), day);
      for (const options of PLAYERS) {
        const closing = planNotices(state, options).filter((notice) => notice.kind === 'closing');
        expect(new Set(closing.map((notice) => theirDay(notice, options))).size).toBe(closing.length);
      }
    }
  });

  it('tell of a decision before it closes, by name, with time left to act and never more than twelve hours ahead', () => {
    const options: NoticeOptions = { perDay: 2, wakeHour: 0, offsetMinutes: 0 };
    const { state, closes } = withOne('The spring concert', 30 * 60);
    const mine = planNotices(state, options).filter((notice) => notice.kind === 'closing' && notice.body.includes('The spring concert'));
    expect(mine.length).toBe(1);
    const closesAt = timeOfTick(state.clock, closes);
    expect(mine[0]!.at).toBeLessThanOrEqual(closesAt - NOTICE_LEAST_LEFT_TICKS * TICK_MS);
    expect(mine[0]!.at).toBeGreaterThanOrEqual(closesAt - CLOSING_SOON_TICKS * TICK_MS);
    expect(mine[0]!.body).toMatch(/closes at \d+:\d\d (AM|PM)/);
  });

  it('say nothing of a decision the player has just seen with less than twelve hours left', () => {
    const { state } = withOne('A thing closing tonight', 5 * 60);
    expect(planNotices(state, { perDay: 2, wakeHour: 0, offsetMinutes: 0 }).some((notice) => notice.body.includes('A thing closing tonight'))).toBe(false);
  });

  it('move a closing decision out of the night to the morning, when that still leaves time to act', () => {
    // A player whose day starts at 7 AM is in their night from 10 PM to 7 AM.
    const options: NoticeOptions = { perDay: 3, wakeHour: 7, offsetMinutes: 720 };
    const probe = at(whole(1), 2);
    const localNow = (((Math.floor(probe.clock.lastSimulatedAt / TICK_MS) + 720) % 1440) + 1440) % 1440;
    // It closes at 3 PM their time, more than a day from now: twelve hours before is 3 AM. Morning leaves eight hours.
    const untilThreePm = ((15 * 60 - localNow + 1440) % 1440) + 1440;
    const { state, closes } = withOne('Night item', untilThreePm);
    // One notice about decisions that day, at the hour their day starts. Others closing that day share it.
    const closesAt = timeOfTick(state.clock, closes);
    const closeDay = theirDay({ at: closesAt, kind: 'closing', title: '', body: '' }, options);
    const notice = planNotices(state, options).find((n) => n.kind === 'closing' && theirDay(n, options) === closeDay)!;
    expect(notice).toBeDefined();
    expect(minuteOfTheirDay(notice, options)).toBeLessThanOrEqual(1);
    expect(closesAt - notice.at).toBeGreaterThanOrEqual(NOTICE_LEAST_LEFT_TICKS * TICK_MS);
  });

  it('carry the headline result of the day, and fewer when the player asks for fewer', () => {
    const state = at(whole(1), 1);
    const many = planNotices(state, { perDay: 3, wakeHour: 0, offsetMinutes: 0 });
    const results = many.filter((notice) => notice.kind === 'result');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((notice) => notice.title === 'Final score')).toBe(true);
    const one = planNotices(state, { perDay: 1, wakeHour: 0, offsetMinutes: 0 });
    expect(one.length).toBeLessThan(many.length);
    expect(one.length).toBeLessThanOrEqual(NOTICE_DAYS + 1);
  });

  it('change nothing: the save is exactly as it was afterwards, and the same notices are planned again', () => {
    const state = at(whole(1), 3);
    const copy = structuredClone(state);
    const options: NoticeOptions = { perDay: 2, wakeHour: 7, offsetMinutes: -480 };
    const first = planNotices(state, options);
    expect(state).toEqual(copy);
    expect(planNotices(state, options)).toEqual(first);
  });

  it('plan quickly at 46,000 students, with every number written so it can be read', () => {
    const state = at(whole(), 2);
    const started = performance.now();
    const notices = planNotices(state, { perDay: 2, wakeHour: 7, offsetMinutes: -480 });
    expect(performance.now() - started).toBeLessThan(500);
    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) expect(notice.body, notice.body).not.toMatch(/\d{5,}/);
  });
});
