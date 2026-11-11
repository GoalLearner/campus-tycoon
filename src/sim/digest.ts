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

export interface AwaySummary {
  headline: string;
  lines: string[];
}

const MAX_LINES = 10;

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

  lines.push(...latestText(log, 'graduation'));
  lines.push(...latestText(log, 'yearEnd'));

  let grants = 0;
  for (const entry of log) {
    if (entry.kind === 'grant') grants += Number(entry.data?.amount ?? 0);
  }
  if (grants > 0) lines.push(`The state covered ${dollars(grants)} in shortfalls.`);

  if (lines.length === 0) lines.push('A quiet stretch. Nothing changed on campus.');

  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) shown.push(`And ${lines.length - MAX_LINES} more.`);
  return { headline: `While you were away: ${duration(facts.minutes)}`, lines: shown };
}
