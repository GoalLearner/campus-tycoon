import { calendarAt } from '../calendar';
import { hashInts } from '../rng';
import type { GameState, Regular } from '../types';
import { classYearOf, type StudentRef } from './students';

/**
 * Named regulars (DESIGN.md 13.5, as built in 63.9): the students the player can follow day by day. Two in every
 * class are named by the seed and stay named for their four years; anyone the player follows joins them, with the
 * history the social web already holds; and the Main Character is always one. A regular's day is worked out when it
 * is looked at (src/app/regularDay.ts); what is kept is who was followed, since when, and a short memory of what the
 * map showed happening to them. Nothing here moves a campus number.
 */

export const NAMED_PER_CLASS = 2;
/** Named from the first of a class, who stay: those who leave are the last of it. */
export const NAMED_FROM = 150;
/** Lines of memory kept for each regular, and followed students kept at most. */
export const MEMORY_KEPT = 12;
export const FOLLOWED_KEPT = 30;
/** A line of memory, at most this long. */
export const MEMORY_LINE_MOST = 120;

const same = (a: StudentRef, b: StudentRef): boolean => a.entryYear === b.entryYear && a.index === b.index;
const enrolled = (state: GameState, ref: StudentRef): boolean => classYearOf(state, ref) !== null;

/** The named regulars of every class enrolled: the same students for their four years. */
export function namedRegulars(state: GameState): StudentRef[] {
  const year = calendarAt(state.clock).year;
  const out: StudentRef[] = [];
  for (let c = 0; c < 4; c++) {
    const entryYear = year - c;
    const size = Math.min(NAMED_FROM, state.cohorts[c] ?? 0);
    const picks: Array<{ index: number; luck: number }> = [];
    for (let index = 0; index < size; index++) picks.push({ index, luck: hashInts(state.seed, 9300, entryYear, index) >>> 0 });
    picks.sort((a, b) => a.luck - b.luck);
    for (const one of picks.slice(0, NAMED_PER_CLASS)) out.push({ entryYear, index: one.index });
  }
  return out;
}

/** Why someone is a regular, or null for anyone else. */
export function regularWhy(state: GameState, ref: StudentRef): 'main' | 'followed' | 'named' | null {
  if (!enrolled(state, ref)) return null;
  const main = state.story?.mc?.ref;
  if (main && same(main, ref)) return 'main';
  if ((state.web.regulars ?? []).some((one) => one.followed && same(one.ref, ref))) return 'followed';
  if (namedRegulars(state).some((one) => same(one, ref))) return 'named';
  return null;
}

/** Every regular now: the Main Character, those followed (newest first), then the named. */
export function regularsNow(state: GameState): Array<{ ref: StudentRef; why: 'main' | 'followed' | 'named' }> {
  const out: Array<{ ref: StudentRef; why: 'main' | 'followed' | 'named' }> = [];
  const add = (ref: StudentRef, why: 'main' | 'followed' | 'named'): void => {
    if (enrolled(state, ref) && !out.some((one) => same(one.ref, ref))) out.push({ ref, why });
  };
  const main = state.story?.mc?.ref;
  if (main) add(main, 'main');
  for (const one of [...(state.web.regulars ?? [])].sort((a, b) => b.since - a.since)) if (one.followed) add(one.ref, 'followed');
  for (const ref of namedRegulars(state)) add(ref, 'named');
  return out;
}

/** What is kept about a regular, if anything. */
export function regularRecord(state: GameState, ref: StudentRef): Regular | null {
  return (state.web.regulars ?? []).find((one) => same(one.ref, ref)) ?? null;
}

/** Those who have left the school are let go, with their memory. */
function prune(state: GameState): void {
  state.web.regulars = (state.web.regulars ?? []).filter((one) => enrolled(state, one.ref));
}

function recordFor(state: GameState, ref: StudentRef): Regular {
  prune(state);
  const list = state.web.regulars!;
  let record = list.find((one) => same(one.ref, ref));
  if (!record) {
    record = { ref: { entryYear: ref.entryYear, index: ref.index }, since: state.clock.tick, followed: false, memory: [] };
    list.push(record);
  }
  return record;
}

/** Following a student makes them a regular (63.9), kept from then on. Their web history is theirs already. */
export function promoteRegular(state: GameState, ref: StudentRef): string | null {
  if (!enrolled(state, ref)) return 'That student is not at the school.';
  const record = recordFor(state, ref);
  if (!record.followed) {
    record.followed = true;
    record.since = state.clock.tick;
  }
  // The oldest followed give way first, past the most kept.
  const followed = state.web.regulars!.filter((one) => one.followed).sort((a, b) => a.since - b.since);
  for (const one of followed.slice(0, Math.max(0, followed.length - FOLLOWED_KEPT))) one.followed = false;
  state.web.regulars = state.web.regulars!.filter((one) => one.followed || one.memory.length > 0);
  return null;
}

/** Remember something that happened to a regular on the map: a greeting, a talk, someone passed. */
export function rememberRegular(state: GameState, ref: StudentRef, text: string): string | null {
  if (regularWhy(state, ref) === null) return 'Only a regular is remembered.';
  const line = text.trim().slice(0, MEMORY_LINE_MOST);
  if (!line) return 'Nothing to remember.';
  const record = recordFor(state, ref);
  // The same thing twice in a row is once.
  if (record.memory[record.memory.length - 1]?.text === line) return null;
  record.memory.push({ tick: state.clock.tick, text: line });
  if (record.memory.length > MEMORY_KEPT) record.memory.splice(0, record.memory.length - MEMORY_KEPT);
  return null;
}
