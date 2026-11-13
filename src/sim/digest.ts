import { TICKS_PER_YEAR } from './config/time';
import { TOP_WEIGHTS } from './config/inbox';
import { dollars, duration, headCount } from './format';
import type { LogEntry } from './types';

/**
 * Turns the log from a catch-up into the short list the player reads on return.
 * The first playable shows it as a plain list. The newspaper replaces it in layer 4.
 */

export interface AwayFacts {
  /** Real minutes the player was gone, including any paused weeks. */
  minutes: number;
  cashBefore: number;
  cashAfter: number;
  studentsBefore: number;
  studentsAfter: number;
}

/** What happened on one date of the game's calendar, in the order it happened. */
export interface AwayDay {
  /** "Sep 7", or "Year 3" for a whole earlier year told in a line or two. */
  date: string;
  lines: string[];
}

export interface AwaySummary {
  headline: string;
  lines: string[];
  /** The calendar's days, football and decisions, grouped by date, oldest first. Empty when nothing dated happened. */
  days: AwayDay[];
  /** How many dated lines were left out because the list was long. */
  earlier: number;
}

const MAX_LINES = 10;
/** The most dated lines shown. A week away is about sixty. */
const MAX_DATED = 60;
/** What is told by date: the calendar, exams, the weather, football, decisions and rankings. */
const DATED: ReadonlySet<LogEntry['kind']> = new Set(['calendar', 'exam', 'weather', 'anchor', 'game', 'football', 'decision', 'inbox', 'rankings', 'goal']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The dated part of the away list. The last real week, which is one game
 * year, is told day by day. Anything older is told in the few lines that
 * still matter: a season's record, a title, a decision that was made for the
 * player.
 */
export function datedDays(log: readonly LogEntry[]): { days: AwayDay[]; earlier: number } {
  const said = log.filter((entry) => DATED.has(entry.kind) && entry.date !== undefined);
  if (said.length === 0) return { days: [], earlier: 0 };
  const latest = said[said.length - 1]!.year ?? 0;
  const cut = said[said.length - 1]!.tick - TICKS_PER_YEAR;
  // A game's result is said at the final whistle and belongs to the day of its kickoff, so it is put back in its place.
  const when = (entry: LogEntry): number => (typeof entry.data?.at === 'number' ? entry.data.at : entry.tick);
  const dated = said.map((entry, index) => ({ entry, index })).sort((a, b) => when(a.entry) - when(b.entry) || a.index - b.index).map((item) => item.entry);
  const days: AwayDay[] = [];
  const push = (date: string, text: string): void => {
    const last = days[days.length - 1];
    if (last && last.date === date) last.lines.push(text);
    else days.push({ date, lines: [text] });
  };
  for (const entry of dated) {
    if (entry.tick < cut) {
      // More than a week ago: only what was marked as worth keeping, under its year.
      if (entry.data?.keep === 1) push(`Year ${entry.year ?? latest}`, entry.text);
      continue;
    }
    const date = entry.date!;
    push(`${MONTHS[Math.floor(date / 100) - 1] ?? ''} ${date % 100}`, entry.text);
  }
  // A long list keeps its most recent lines.
  let total = days.reduce((sum, day) => sum + day.lines.length, 0);
  let earlier = 0;
  while (total > MAX_DATED && days.length > 0) {
    const first = days[0]!;
    first.lines.shift();
    if (first.lines.length === 0) days.shift();
    total -= 1;
    earlier += 1;
  }
  return { days, earlier };
}

/** The most recent entry of a kind. After a long absence only the latest of each is worth reading. */
function latestText(log: readonly LogEntry[], kind: LogEntry['kind']): string[] {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]!.kind === kind) return [log[i]!.text];
  }
  return [];
}

/** One undated line of the away list, with how much it matters and what kind of news it is. */
export interface AwayLine {
  text: string;
  weight: number;
  kind: 'money' | 'intake' | 'problem' | 'news';
}

/**
 * The undated lines of the away list, in the order the plain list tells
 * them, each with how much it matters. The newspaper puts the weightiest at
 * its top. The plain list tells them all in this order.
 */
export function awayLines(log: readonly LogEntry[], facts: AwayFacts): AwayLine[] {
  const out: AwayLine[] = [];
  const lines = {
    push: (...texts: string[]): void => {
      for (const text of texts) out.push({ text, weight: next.weight, kind: next.kind });
    },
  };
  // What the next lines pushed are worth, and what kind of news they are.
  const next: { weight: number; kind: AwayLine['kind'] } = { weight: 0, kind: 'news' };
  const as = (weight: number, kind: AwayLine['kind']): void => {
    next.weight = weight;
    next.kind = kind;
  };

  as(TOP_WEIGHTS.paused, 'problem');
  for (const entry of log) if (entry.kind === 'paused') lines.push(entry.text);

  as(TOP_WEIGHTS.money, 'money');
  const net = facts.cashAfter - facts.cashBefore;
  if (Math.abs(net) >= 1) {
    lines.push(net >= 0 ? `The campus earned ${dollars(net)}.` : `The campus spent ${dollars(-net)} more than it earned.`);
  }

  // A change of rule that happened while away is said once, near the top.
  as(TOP_WEIGHTS.rules, 'news');
  for (const entry of log) if (entry.kind === 'classes') lines.push(entry.text);
  // Costs phasing in: where they stand now. One line, however many steps were taken while away.
  lines.push(...latestText(log, 'costs'));

  // Levels reached (DESIGN.md 42.2): the one line, or the last of several with how many there were.
  const levels = log.filter((entry) => entry.kind === 'level');
  if (levels.length === 1) lines.push(levels[0]!.text);
  else if (levels.length > 1) lines.push(`${levels.length} levels up. ${levels[levels.length - 1]!.text}`);

  // A policy turned on or off: one line each (DESIGN.md 41.7).
  for (const entry of log) if (entry.kind === 'policy') lines.push(entry.text);

  // Faculty a semester behind the students, or still on the payroll after them: the latest word on it.
  as(TOP_WEIGHTS.staff, 'problem');
  lines.push(...latestText(log, 'staff'));

  as(TOP_WEIGHTS.enrollment, 'news');
  if (facts.studentsAfter !== facts.studentsBefore) {
    lines.push(`Enrollment went from ${headCount(facts.studentsBefore)} to ${headCount(facts.studentsAfter)}.`);
  }

  as(TOP_WEIGHTS.built, 'news');
  const built = log.filter((e) => e.kind === 'built');
  const opened = built.filter((e) => e.data?.stage === 1).length;
  const grew = built.length - opened;
  if (opened > 0 && grew > 0) {
    lines.push(`${opened} new ${opened === 1 ? 'building' : 'buildings'} opened and ${grew} grew a stage.`);
  } else if (opened > 0) {
    lines.push(opened === 1 ? '1 new building opened.' : `${opened} new buildings opened.`);
  } else if (grew > 0) {
    lines.push(grew === 1 ? '1 building grew a stage.' : `${grew} buildings grew a stage.`);
  }

  as(TOP_WEIGHTS.intake, 'intake');
  lines.push(...latestText(log, 'intake'));

  as(TOP_WEIGHTS.waitlistIn, 'intake');
  let offWaitlist = 0;
  for (const entry of log) {
    if (entry.kind === 'waitlist') offWaitlist += Number(entry.data?.count ?? 0);
  }
  if (offWaitlist > 0) {
    lines.push(offWaitlist === 1 ? '1 student came off a waitlist.' : `${offWaitlist} students came off waitlists.`);
  }
  as(TOP_WEIGHTS.waitlistLost, 'intake');
  const lostToWaitlist = log.filter((e) => e.kind === 'waitlistClosed' && Number(e.data?.lost ?? 0) > 0);
  if (lostToWaitlist.length > 0) lines.push(lostToWaitlist[lostToWaitlist.length - 1]!.text);

  // Incidents: how many were handled, and for the rest, the building that would have handled them.
  let handled = 0;
  const missed = new Map<string, number>();
  for (const entry of log) {
    if (entry.kind !== 'incident') continue;
    if (entry.data?.handled === 1) handled += 1;
    else {
      const need = entry.data?.need === 'medical' ? 'A Medical Center' : 'Campus Safety';
      const where = entry.data?.place === 'a dorm' ? 'the dorms' : `the ${String(entry.data?.place ?? 'campus')}`;
      const key = `${need} in reach of ${where}`;
      missed.set(key, (missed.get(key) ?? 0) + 1);
    }
  }
  as(TOP_WEIGHTS.handled, 'news');
  if (handled > 0) lines.push(handled === 1 ? '1 incident was handled.' : `${handled} incidents were handled.`);
  as(TOP_WEIGHTS.missed, 'problem');
  for (const [fix, count] of [...missed].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    lines.push(`${count} ${count === 1 ? 'incident' : 'incidents'} had nobody come. ${fix} would have handled ${count === 1 ? 'it' : 'them'}.`);
  }

  as(TOP_WEIGHTS.graduation, 'news');
  lines.push(...latestText(log, 'graduation'));
  as(TOP_WEIGHTS.yearEnd, 'news');
  lines.push(...latestText(log, 'yearEnd'));

  let grants = 0;
  let drawn = 0;
  for (const entry of log) {
    if (entry.kind !== 'grant') continue;
    grants += Number(entry.data?.amount ?? 0);
    drawn += Number(entry.data?.endowment ?? 0);
  }
  as(TOP_WEIGHTS.grant, 'problem');
  if (drawn > 0) lines.push(`The endowment covered ${dollars(drawn)} in shortfalls.`);
  if (grants > 0) lines.push(`The state covered ${dollars(grants)} in shortfalls.`);

  as(TOP_WEIGHTS.quiet, 'news');
  if (out.length === 0) lines.push('A quiet stretch. Nothing changed on campus.');
  return out;
}

export function summarizeAway(log: LogEntry[], facts: AwayFacts): AwaySummary {
  const lines = awayLines(log, facts).map((line) => line.text);
  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) shown.push(`And ${lines.length - MAX_LINES} more.`);
  return { headline: `While you were away: ${duration(facts.minutes)}`, lines: shown, ...datedDays(log) };
}
