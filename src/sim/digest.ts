import { TICKS_PER_YEAR } from './config/time';
import { dollars, duration } from './format';
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
const DATED: ReadonlySet<LogEntry['kind']> = new Set(['calendar', 'exam', 'weather', 'anchor', 'game', 'football', 'decision', 'rankings']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The dated part of the away list. The last real week, which is one game
 * year, is told day by day. Anything older is told in the few lines that
 * still matter: a season's record, a title, a decision that was made for the
 * player.
 */
export function datedDays(log: readonly LogEntry[]): { days: AwayDay[]; earlier: number } {
  const dated = log.filter((entry) => DATED.has(entry.kind) && entry.date !== undefined);
  if (dated.length === 0) return { days: [], earlier: 0 };
  const latest = dated[dated.length - 1]!.year ?? 0;
  const cut = dated[dated.length - 1]!.tick - TICKS_PER_YEAR;
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
function latestText(log: LogEntry[], kind: LogEntry['kind']): string[] {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]!.kind === kind) return [log[i]!.text];
  }
  return [];
}

export function summarizeAway(log: LogEntry[], facts: AwayFacts): AwaySummary {
  const lines: string[] = [];

  for (const entry of log) if (entry.kind === 'paused') lines.push(entry.text);

  const net = facts.cashAfter - facts.cashBefore;
  if (Math.abs(net) >= 1) {
    lines.push(net >= 0 ? `The campus earned ${dollars(net)}.` : `The campus spent ${dollars(-net)} more than it earned.`);
  }

  // A change of rule that happened while away is said once, near the top.
  for (const entry of log) if (entry.kind === 'classes') lines.push(entry.text);
  // Costs phasing in: where they stand now. One line, however many steps were taken while away.
  lines.push(...latestText(log, 'costs'));

  if (facts.studentsAfter !== facts.studentsBefore) {
    lines.push(`Enrollment went from ${facts.studentsBefore} to ${facts.studentsAfter}.`);
  }

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

  lines.push(...latestText(log, 'intake'));

  let offWaitlist = 0;
  for (const entry of log) {
    if (entry.kind === 'waitlist') offWaitlist += Number(entry.data?.count ?? 0);
  }
  if (offWaitlist > 0) {
    lines.push(offWaitlist === 1 ? '1 student came off a waitlist.' : `${offWaitlist} students came off waitlists.`);
  }
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
  if (handled > 0) lines.push(handled === 1 ? '1 incident was handled.' : `${handled} incidents were handled.`);
  for (const [fix, count] of [...missed].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    lines.push(`${count} ${count === 1 ? 'incident' : 'incidents'} had nobody come. ${fix} would have handled ${count === 1 ? 'it' : 'them'}.`);
  }

  lines.push(...latestText(log, 'graduation'));
  lines.push(...latestText(log, 'yearEnd'));

  let grants = 0;
  let drawn = 0;
  for (const entry of log) {
    if (entry.kind !== 'grant') continue;
    grants += Number(entry.data?.amount ?? 0);
    drawn += Number(entry.data?.endowment ?? 0);
  }
  if (drawn > 0) lines.push(`The endowment covered ${dollars(drawn)} in shortfalls.`);
  if (grants > 0) lines.push(`The state covered ${dollars(grants)} in shortfalls.`);

  if (lines.length === 0) lines.push('A quiet stretch. Nothing changed on campus.');

  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) shown.push(`And ${lines.length - MAX_LINES} more.`);
  return { headline: `While you were away: ${duration(facts.minutes)}`, lines: shown, ...datedDays(log) };
}
