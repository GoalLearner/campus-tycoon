import { advance } from './advance';
import { timeOfTick } from './calendar';
import { CLOSING_SOON_TICKS, TOP_WEIGHTS } from './config/inbox';
import { TICK_MS, TICKS_PER_DAY } from './config/time';
import type { GameState, LogEntry } from './types';

/**
 * Notifications (DESIGN.md 2.3 and 36.6). iPhone app only.
 *
 * This file only plans them. Given the campus as the player leaves it, it
 * plays the next few days forward on a copy and says which moments are worth
 * a notice: a decision about to close, and the day's headline result. It is a
 * pure function of the save, so the same campus always plans the same
 * notices. Handing them to the phone is the app's job (`src/app/notices.ts`).
 *
 * The rules:
 * - At most so many in one of the player's days. Two by default.
 * - Never in the player's night. A result waits for the morning. A closing
 *   decision is told in the morning if that still leaves time to act, and the
 *   evening before if not.
 * - One notice about decisions in a day, however many are closing.
 * - Nothing about a moment the player was in the app for.
 */

/** How many days ahead notices are planned. A player away longer than this hears no more. */
export const NOTICE_DAYS = 3;
/** The most in a day unless the player says otherwise, and the most they can ask for. */
export const NOTICES_DEFAULT = 2;
export const NOTICES_MOST = 3;
/** The player's day: this many hours from the hour it starts. Outside it nothing is sent. */
export const NOTICE_AWAKE_HOURS = 15;
/** A notice about a closing decision is worth sending only with this much time left to act. */
export const NOTICE_LEAST_LEFT_TICKS = 2 * 60;

export interface Notice {
  /** The real moment it shows, in milliseconds. */
  at: number;
  kind: 'closing' | 'result';
  title: string;
  body: string;
}

export interface NoticeOptions {
  /** The most in one of the player's days. 0 plans none. */
  perDay: number;
  /** The hour of the player's own clock their day starts. */
  wakeHour: number;
  /** Minutes to add to UTC for the player's own clock. */
  offsetMinutes: number;
  /** Days ahead to plan. Left out: `NOTICE_DAYS`. */
  days?: number;
}

interface Closing {
  title: string;
  closes: number;
}

interface Result {
  tick: number;
  weight: number;
  title: string;
  body: string;
}

const MINUTE = TICK_MS;
const DAY_MINUTES = TICKS_PER_DAY;

/** "3:15 PM" on the player's own clock. */
function localTime(ms: number, offsetMinutes: number): string {
  const minutes = (((Math.floor(ms / MINUTE) + offsetMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Which of the player's days a moment falls in, and how many minutes into that day. A day starts at the wake hour. */
function dayOf(ms: number, options: NoticeOptions): { day: number; minute: number } {
  const local = Math.floor(ms / MINUTE) + options.offsetMinutes - options.wakeHour * 60;
  const day = Math.floor(local / DAY_MINUTES);
  return { day, minute: local - day * DAY_MINUTES };
}

/** The real moment a day of the player's begins. */
function dayStart(day: number, options: NoticeOptions): number {
  return (day * DAY_MINUTES - options.offsetMinutes + options.wakeHour * 60) * MINUTE;
}

const awake = (minute: number): boolean => minute < NOTICE_AWAKE_HOURS * 60;

/** A line short enough for a lock screen. */
function short(text: string, most = 150): string {
  if (text.length <= most) return text;
  const cut = text.slice(0, most - 1);
  const stop = cut.lastIndexOf('. ');
  return stop > 60 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

function results(log: readonly LogEntry[]): Result[] {
  const out: Result[] = [];
  for (const entry of log) {
    if (entry.kind === 'game') {
      const big = Number(entry.data?.slot ?? 0) >= 9;
      out.push({ tick: entry.tick, weight: big ? TOP_WEIGHTS.bigGame : TOP_WEIGHTS.game, title: 'Final score', body: short(entry.text) });
    } else if (entry.kind === 'intake') {
      out.push({ tick: entry.tick, weight: TOP_WEIGHTS.intake, title: 'Move-in day', body: short(entry.text) });
    } else if (entry.kind === 'goal') {
      out.push({ tick: entry.tick, weight: TOP_WEIGHTS.goal, title: 'A goal reached', body: short(entry.text) });
    } else if (entry.kind === 'rankings') {
      out.push({ tick: entry.tick, weight: TOP_WEIGHTS.goodNews, title: 'Rankings day', body: short(entry.text) });
    } else if (entry.kind === 'graduation') {
      out.push({ tick: entry.tick, weight: TOP_WEIGHTS.graduation, title: 'Commencement', body: short(entry.text) });
    }
  }
  return out;
}

/**
 * The notices to hand to the phone as the player leaves, soonest first.
 * Nothing here touches `state`.
 */
export function planNotices(state: GameState, options: NoticeOptions): Notice[] {
  const perDay = Math.max(0, Math.min(NOTICES_MOST, Math.floor(options.perDay)));
  if (perDay === 0) return [];
  const now = state.clock.lastSimulatedAt;
  const end = now + (options.days ?? NOTICE_DAYS) * DAY_MINUTES * MINUTE;
  const ahead = advance(state, now, end);
  const when = (tick: number): number => timeOfTick(state.clock, tick);

  // Everything that will close without the player: what is open and unanswered now, and what opens while away.
  const closings: Closing[] = [];
  for (const item of state.decisions.open) if (item.chosen === null) closings.push({ title: item.title, closes: item.closes });
  for (const item of state.inbox.open) closings.push({ title: item.title, closes: item.closes });
  for (const entry of ahead.log) {
    if ((entry.kind !== 'decision' && entry.kind !== 'inbox') || entry.data?.closes === undefined || entry.data?.title === undefined) continue;
    closings.push({ title: String(entry.data.title), closes: Number(entry.data.closes) });
  }

  // One notice about decisions for each of the player's days, at the first moment one is worth telling.
  const byDay = new Map<number, { at: number; items: Closing[] }>();
  const least = NOTICE_LEAST_LEFT_TICKS * MINUTE;
  for (const closing of closings) {
    const closesAt = when(closing.closes);
    if (closesAt > end + DAY_MINUTES * MINUTE) continue;
    let at = closesAt - CLOSING_SOON_TICKS * MINUTE;
    // The player was in the app after that moment: they have seen it with less than half a day left.
    if (at <= now) continue;
    const spot = dayOf(at, options);
    if (!awake(spot.minute)) {
      // In the night. The morning, if that leaves time to act. If not, the end of the evening before.
      const morning = dayStart(spot.day + 1, options);
      const evening = dayStart(spot.day, options) + (NOTICE_AWAKE_HOURS * 60 - 1) * MINUTE;
      if (closesAt - morning >= least) at = morning;
      else if (evening > now) at = evening;
      else continue;
    }
    if (at >= end) continue;
    const day = dayOf(at, options).day;
    const group = byDay.get(day);
    if (!group) byDay.set(day, { at, items: [closing] });
    else {
      group.at = Math.min(group.at, at);
      group.items.push(closing);
    }
  }

  // The day's results, the weightiest first. One that lands in the night waits for the morning.
  const news = new Map<number, Array<Result & { at: number }>>();
  for (const result of results(ahead.log)) {
    let at = when(result.tick);
    if (at <= now) continue;
    const spot = dayOf(at, options);
    if (!awake(spot.minute)) at = dayStart(spot.day + 1, options);
    if (at >= end) continue;
    const day = dayOf(at, options).day;
    const list = news.get(day) ?? [];
    list.push({ ...result, at });
    news.set(day, list);
  }

  const out: Notice[] = [];
  const days = new Set<number>([...byDay.keys(), ...news.keys()]);
  for (const day of days) {
    let room = perDay;
    const group = byDay.get(day);
    if (group && room > 0) {
      const items = [...group.items].sort((a, b) => a.closes - b.closes);
      const first = items[0]!;
      const at = localTime(when(first.closes), options.offsetMinutes);
      out.push({
        at: group.at,
        kind: 'closing',
        title: items.length === 1 ? 'A decision closes soon' : `${items.length} decisions close soon`,
        body: short(items.length === 1 ? `${first.title} closes at ${at}. Left alone, its default happens.` : `The first closes at ${at}: ${first.title}. Left alone, each takes its default.`),
      });
      room -= 1;
    }
    const list = (news.get(day) ?? []).sort((a, b) => b.weight - a.weight || a.at - b.at);
    for (const result of list.slice(0, room)) out.push({ at: result.at, kind: 'result', title: result.title, body: result.body });
  }
  return out.sort((a, b) => a.at - b.at);
}
