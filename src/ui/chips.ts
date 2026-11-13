import { ME, hasSeason, liveGame, policiesOpen, policyOn, TICKS_PER_DAY, TICKS_PER_HOUR, type GameState } from '../sim';

/**
 * The row of small buttons under the top bar. Each is a number over a word,
 * as the student count and Happiness are above them: "5-5 / football",
 * "1 · 2 d / to decide". Five of them fit a phone 375 wide, which five
 * buttons of words in a line did not (DESIGN.md 42.16).
 */

export interface StatChip {
  /** The top line, or '' for a button that is its word alone. */
  value: string;
  label: string;
  /** 'good' for something waiting to be claimed, 'urgent' for something with a clock on it. */
  tone: '' | 'good' | 'urgent';
}

/** Time left in its largest unit alone, for a button: "2 d", "18 h", "45 m". */
export function shortLeft(ticks: number): string {
  if (ticks >= TICKS_PER_DAY) return `${Math.floor(ticks / TICKS_PER_DAY)} d`;
  if (ticks >= TICKS_PER_HOUR) return `${Math.floor(ticks / TICKS_PER_HOUR)} h`;
  return `${Math.max(1, ticks)} m`;
}

/** Football: the record, or the score while a game is on. null with no season behind it. */
export function footballStat(state: GameState): StatChip | null {
  if (!hasSeason(state) || !state.football.season) return null;
  const live = liveGame(state);
  if (live) return { value: `${live.us}-${live.them}`, label: 'live', tone: 'urgent' };
  const mine = state.football.season.table[String(ME)]!;
  return { value: `${mine.w}-${mine.l}`, label: 'football', tone: '' };
}

/** The Inbox: how many things wait to be decided and how long the first has left. Its word alone with nothing waiting. */
export function inboxStat(state: GameState): StatChip {
  const waiting = [...state.decisions.open.filter((item) => item.chosen === null).map((item) => item.closes), ...state.inbox.open.map((item) => item.closes)];
  if (waiting.length === 0) return { value: '', label: 'inbox', tone: '' };
  return { value: `${waiting.length} · ${shortLeft(Math.max(1, Math.min(...waiting) - state.clock.tick))}`, label: 'to decide', tone: 'urgent' };
}

/** Policies: how many are on. null before an era has opened the page. */
export function policyStat(state: GameState): StatChip | null {
  const open = policiesOpen(state);
  if (open.length === 0) return null;
  return { value: `${open.filter((spec) => policyOn(state, spec.id)).length} on`, label: 'policies', tone: '' };
}
