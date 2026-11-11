import type { LogEntry } from '../sim';

/**
 * What the app keeps beside the game in the save file: the "while you were
 * away" list until the player has seen it, and when they last exported a
 * backup. None of it is simulation, so the sim carries it without reading it.
 */

export interface AwayReport {
  minutes: number;
  weeksSkipped: number;
  log: LogEntry[];
  cashBefore: number;
  cashAfter: number;
  studentsBefore: number;
  studentsAfter: number;
}

export interface SavedApp {
  /** The away list the player has not seen yet. */
  away: AwayReport | null;
  /** When the player last exported a backup, or loaded one. null when never. */
  lastExportAt: number | null;
}

/** The most log entries an unseen list keeps. A month away on a large campus is about half of this. */
export const AWAY_LOG_LIMIT = 8000;

/** Two absences as one list: where the first began, where the second ended, and everything between. */
export function mergeAway(unseen: AwayReport | null, fresh: AwayReport): AwayReport {
  if (!unseen) return fresh;
  const log = [...unseen.log, ...fresh.log];
  return {
    minutes: unseen.minutes + fresh.minutes,
    weeksSkipped: unseen.weeksSkipped + fresh.weeksSkipped,
    log: log.length > AWAY_LOG_LIMIT ? log.slice(log.length - AWAY_LOG_LIMIT) : log,
    cashBefore: unseen.cashBefore,
    cashAfter: fresh.cashAfter,
    studentsBefore: unseen.studentsBefore,
    studentsAfter: fresh.studentsAfter,
  };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function readAway(raw: unknown): AwayReport | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (![r.minutes, r.weeksSkipped, r.cashBefore, r.cashAfter, r.studentsBefore, r.studentsAfter].every(isNumber)) return null;
  if (!Array.isArray(r.log)) return null;
  const log = r.log.filter((entry): entry is LogEntry => {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return isNumber(e.tick) && typeof e.kind === 'string' && typeof e.text === 'string';
  });
  return {
    minutes: r.minutes as number,
    weeksSkipped: r.weeksSkipped as number,
    log,
    cashBefore: r.cashBefore as number,
    cashAfter: r.cashAfter as number,
    studentsBefore: r.studentsBefore as number,
    studentsAfter: r.studentsAfter as number,
  };
}

/** Read the app's part of a save. Anything missing or malformed is dropped, never an error: the game itself still loads. */
export function readSavedApp(raw: unknown): SavedApp {
  if (typeof raw !== 'object' || raw === null) return { away: null, lastExportAt: null };
  const r = raw as Record<string, unknown>;
  return { away: readAway(r.away), lastExportAt: isNumber(r.lastExportAt) ? r.lastExportAt : null };
}

// ------------------------------------------------------- backup reminder --

const DAY_MS = 24 * 60 * 60 * 1000;
/** A backup older than this is worth a reminder. The owner's number, 2026-11-11. */
export const BACKUP_STALE_DAYS = 5;

export interface BackupFacts {
  /** True inside the iOS app, whose files the system never clears. */
  native: boolean;
  /** True when the browser has agreed never to clear the save by itself. */
  persistent: boolean;
  lastExportAt: number | null;
  /** When this game was founded. A game younger than the limit has nothing stale yet. */
  createdAt: number;
  now: number;
}

function ago(days: number): string {
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The gentle reminder in the Menu, or null when there is nothing to say. It
 * shows on the web when the browser has not agreed to keep the save, or when
 * the last backup is more than five days old. Never in the iOS app.
 */
export function backupReminder(facts: BackupFacts): string | null {
  if (facts.native) return null;
  const since = facts.lastExportAt ?? facts.createdAt;
  const days = Math.max(0, Math.floor((facts.now - since) / DAY_MS));
  const stale = facts.now - since > BACKUP_STALE_DAYS * DAY_MS;
  if (!facts.persistent) {
    const risk = 'This browser may clear a save it has not seen for a while.';
    if (facts.lastExportAt === null) return `${risk} Export a backup to be safe.`;
    if (stale) return `${risk} Your last backup was ${ago(days)}. Export a fresh one to be safe.`;
    return `${risk} Your last backup was ${ago(days)}.`;
  }
  if (!stale) return null;
  return facts.lastExportAt === null
    ? 'You have not exported a backup of this campus yet. Export one to be safe.'
    : `Your last backup was ${ago(days)}. Export a fresh one to be safe.`;
}
