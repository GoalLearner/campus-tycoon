import { calendarAt } from '../calendar';
import { FIRST_INTAKE_TICK, WAITLIST_TICKS } from '../config/time';
import { enrollment, openCapacity } from '../selectors';
import { ZONES, type ClassRecord, type GameState, type LogEntry, type Season, type Zone } from '../types';
import { classSize, NEED } from './demand';
import { campusHappiness } from './happiness';
import { markRatesDirty } from './money';

/**
 * Intakes, the waitlist, retention, graduation and promotion.
 * Enrollment is capped by the scarcest zone. See DESIGN.md section 7.
 */

const ZONE_NAME: Record<Zone, string> = { housing: 'Housing', academic: 'Academics' };
const ZONE_UNIT: Record<Zone, string> = { housing: 'beds', academic: 'classroom seats' };

/** New students each zone still has room for, and the tightest of them. */
export function roomForNewStudents(state: GameState): { room: number; tightest: Zone } {
  const students = enrollment(state);
  let room = Infinity;
  let tightest: Zone = 'academic';
  for (const zone of ZONES) {
    const free = openCapacity(state, zone) - students * NEED[zone];
    const fits = Math.floor(free / NEED[zone] + 1e-9);
    if (fits < room) {
      room = fits;
      tightest = zone;
    }
  }
  return { room: Math.max(0, room), tightest };
}

/** The record of the class that entered in a given year, made on first use. */
export function classRecord(state: GameState, entryYear: number): ClassRecord {
  let record = state.classes.find((r) => r.entryYear === entryYear);
  if (!record) {
    record = { entryYear, entered: 0, finishedOnTime: 0, finishedLate: 0, left: 0 };
    state.classes.push(record);
    state.classes.sort((a, b) => a.entryYear - b.entryYear);
  }
  return record;
}

function enrol(state: GameState, count: number): void {
  state.cohorts[0] += count;
  if (count > 0) classRecord(state, Math.max(1, calendarAt(state.clock.tick).year)).entered += count;
  state.stats.peakEnrollment = Math.max(state.stats.peakEnrollment, enrollment(state));
  markRatesDirty(state);
}

/** A class arrives. Whoever does not fit goes on the waitlist. */
export function runIntake(state: GameState, season: Season, log: LogEntry[]): void {
  const tick = state.clock.tick;
  const expected = classSize(state, season, tick === FIRST_INTAKE_TICK);
  const { room, tightest } = roomForNewStudents(state);
  const admitted = Math.min(expected, room);
  const turnedAway = expected - admitted;
  const bottleneck = turnedAway > 0 ? tightest : null;

  enrol(state, admitted);
  state.admissions.lastIntake = { tick, season, expected, admitted, turnedAway, bottleneck };
  state.admissions.waitlist = turnedAway;
  state.admissions.waitlistUntilTick = turnedAway > 0 ? tick + WAITLIST_TICKS : 0;
  state.admissions.waitlistAdmitted = 0;

  const { year } = calendarAt(tick);
  const label = season === 'fall' ? `The fall class of year ${year}` : `The spring class of year ${year}`;
  log.push({
    tick,
    kind: 'intake',
    text:
      bottleneck === null
        ? `${label} moved in: ${admitted} students, and everyone found a place.`
        : `${label} moved in: ${admitted} students. ${turnedAway} more are on the waitlist for want of ${ZONE_UNIT[bottleneck]}.`,
    data: { season, year, expected, admitted, turnedAway, bottleneck: bottleneck ?? '' },
  });
}

/** While a waitlist is open, any room that appears fills at once. */
export function fillFromWaitlist(state: GameState, log: LogEntry[]): void {
  const a = state.admissions;
  if (a.waitlist <= 0 || state.clock.tick >= a.waitlistUntilTick) return;
  const { room } = roomForNewStudents(state);
  const count = Math.min(a.waitlist, room);
  if (count <= 0) return;
  enrol(state, count);
  a.waitlist -= count;
  a.waitlistAdmitted += count;
  log.push({
    tick: state.clock.tick,
    kind: 'waitlist',
    text: count === 1 ? '1 student came off the waitlist.' : `${count} students came off the waitlist.`,
    data: { count },
  });
}

/** Nine hours after an intake, whoever is still waiting gives up. */
export function closeWaitlist(state: GameState, log: LogEntry[]): void {
  const a = state.admissions;
  if (a.waitlistUntilTick === 0) return;
  const lost = a.waitlist;
  const admitted = a.waitlistAdmitted;
  const zone = a.lastIntake?.bottleneck ?? null;
  a.waitlist = 0;
  a.waitlistUntilTick = 0;
  if (lost > 0 || admitted > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'waitlistClosed',
      text:
        lost === 0
          ? `The waitlist closed. All ${admitted} who waited got in.`
          : `The waitlist closed. ${admitted} got in and ${lost} went elsewhere${zone ? `, for want of ${ZONE_UNIT[zone]}` : ''}.`,
      data: { lost, admitted, bottleneck: zone ?? '' },
    });
  }
}

/**
 * The end of a semester: a few students from every class do not come back.
 * How many follows happiness, and the log says so.
 */
export function semesterEnd(state: GameState, log?: LogEntry[]): void {
  const before = enrollment(state);
  const mood = campusHappiness(state);
  const c = state.cohorts;
  const { year } = calendarAt(state.clock.tick);
  const next: [number, number, number, number] = [0, 0, 0, 0];
  for (let classYear = 0; classYear < 4; classYear++) {
    const was = c[classYear]!;
    next[classYear] = Math.round(was * mood.retention);
    if (was > next[classYear]!) classRecord(state, Math.max(1, year - classYear)).left += was - next[classYear]!;
  }
  state.cohorts = next;

  // Students with no bed do not come back. Room only limits who is admitted, so this is what
  // stops a full dorm being cleared and its students kept.
  const room = Math.floor(openCapacity(state, 'housing') / NEED.housing + 1e-9);
  let homeless = enrollment(state) - room;
  for (let classYear = 0; classYear < 4 && homeless > 0; classYear++) {
    const go = Math.min(homeless, state.cohorts[classYear]!);
    if (go === 0) continue;
    state.cohorts[classYear]! -= go;
    classRecord(state, Math.max(1, year - classYear)).left += go;
    homeless -= go;
  }
  const stayed = enrollment(state);
  const left = before - stayed;
  state.admissions.lastSemester = { tick: state.clock.tick, stayed, left, happiness: Math.round(mood.score) };
  markRatesDirty(state);
  if (log && before > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'semester',
      text:
        left === 0
          ? 'The semester ended and every student is staying on.'
          : `The semester ended. ${left} ${left === 1 ? 'student' : 'students'} did not come back. Happiness was ${Math.round(mood.score)}.`,
      data: { left, stayed, happiness: Math.round(mood.score), worst: mood.worst ?? '' },
    });
  }
}

/** Day 6: the spring semester ends and the seniors graduate. */
export function graduate(state: GameState, log: LogEntry[]): void {
  semesterEnd(state, log);
  const seniors = state.cohorts[3];
  state.cohorts[3] = 0;
  if (seniors > 0) classRecord(state, Math.max(1, calendarAt(state.clock.tick).year - 3)).finishedOnTime += seniors;
  state.stats.graduates += seniors;
  markRatesDirty(state);
  if (seniors > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'graduation',
      text: `${seniors} seniors graduated. ${state.stats.graduates} alumni so far.`,
      data: { seniors, alumni: state.stats.graduates },
    });
  }
}

/** A new year begins: every class moves up one year. */
export function promote(state: GameState): void {
  const c = state.cohorts;
  state.cohorts = [0, c[0], c[1], c[2] + c[3]];
}

/**
 * The share of applicants who got a place at the last intake, counting those
 * who came off the waitlist. null before the first class.
 */
export function acceptanceRate(state: GameState): number | null {
  const last = state.admissions.lastIntake;
  if (!last || last.expected <= 0) return null;
  return Math.min(1, (last.admitted + state.admissions.waitlistAdmitted) / last.expected);
}

export function zoneName(zone: Zone): string {
  return ZONE_NAME[zone];
}
