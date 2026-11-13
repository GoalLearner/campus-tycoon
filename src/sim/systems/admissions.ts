import { calendarAt } from '../calendar';
import { FOUNDING_SHARES } from '../config/demand';
import { FIRST_INTAKE_TICK, WAITLIST_TICKS } from '../config/time';
import { headCount } from '../format';
import { enrollment, openCapacity } from '../selectors';
import { type ClassRecord, type GameState, type LogEntry, type Season, type Zone } from '../types';
import { classSize, dormStudents, localsAmong } from './demand';
import { enrollmentCap, landSizeGoals, roomUnderCap } from './goals';
import { leavingMore, unlockPolicies } from './policies';
import { earn } from './daily';
import { hiresBehind as hiresBehindNow, planStaff, staffSemester } from './staffing';
import { freeTownPlaces } from './town';
import { campusHappiness } from './happiness';
import { markRatesDirty } from './money';
import { closeSemester, stressLoss } from './season';

/**
 * Intakes, the waitlist, retention, graduation and promotion.
 * Enrollment is capped by the scarcest zone. See DESIGN.md section 7.
 */

const ZONE_NAME: Record<Zone, string> = { housing: 'Housing', academic: 'Academics' };
const ZONE_UNIT: Record<Zone, string> = { housing: 'beds', academic: 'classroom seats' };

export interface Admit {
  /** How many of the group get a place now. */
  admitted: number;
  /** Locals among them. */
  locals: number;
  /** Of those locals, how many will live in town. The rest take beds. */
  off: number;
  /** What caps the group: beds, or classroom seats. */
  tightest: Zone;
}

/**
 * How many of a group can be let in now. Everyone needs a seat. `locals` of
 * the `count` live in town if a place there is free, and everyone else needs
 * a bed. The group is let in at its own mix of locals, so an intake short of
 * seats does not fill up with locals alone. On a game with a cap nobody is
 * let in past it, whatever room there is.
 */
export function admitPlan(state: GameState, count: number, locals: number): Admit {
  const seats = Math.max(0, openCapacity(state, 'academic') - enrollment(state));
  const beds = Math.max(0, openCapacity(state, 'housing') - dormStudents(state));
  const places = freeTownPlaces(state);
  const localsIn = (admitted: number): number => (count <= 0 ? 0 : Math.round((locals * admitted) / count));
  const bedsFor = (admitted: number): number => admitted - Math.min(localsIn(admitted), places);

  // Beds needed never fall as more are let in, so the most that fit can be found by halving.
  let low = 0;
  let high = Math.max(0, Math.min(count, seats, roomUnderCap(state)));
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (bedsFor(mid) <= beds) low = mid;
    else high = mid - 1;
  }
  const admitted = low;
  const housingBinds = admitted < count && bedsFor(admitted + 1) > beds;
  return { admitted, locals: localsIn(admitted), off: Math.min(localsIn(admitted), places), tightest: housingBinds ? 'housing' : 'academic' };
}

/** How many more students could be let in right now, at the mix of a normal class, and what would stop the next one. */
export function roomForNewStudents(state: GameState): { room: number; tightest: Zone } {
  const many = 1_000_000;
  const plan = admitPlan(state, many, localsAmong(many));
  return { room: plan.admitted, tightest: plan.tightest };
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

/** True for a record of students who began here as freshmen. The founding upper classes began elsewhere. */
export function startedHere(record: ClassRecord): boolean {
  return record.entryYear >= 1;
}

/**
 * True for a record that counts toward this campus's graduation rate. On a
 * game begun on the model campus the four classes it opened with count as
 * begun there (DESIGN.md 37.4): it is a school that was already standing.
 */
export function begunHere(state: GameState, record: ClassRecord): boolean {
  return state.goals !== null || startedHere(record);
}


/**
 * Add one to whichever class year is furthest below its share. Done a student
 * at a time, so the mix is right however the founders trickle in.
 */
function nextFounderYear(have: readonly number[], limit?: readonly number[]): number {
  const total = have[0]! + have[1]! + have[2]! + have[3]! + 1;
  let best = -1;
  let most = -Infinity;
  for (let classYear = 0; classYear < 4; classYear++) {
    if (limit && have[classYear]! >= limit[classYear]!) continue;
    const short = FOUNDING_SHARES[classYear]! * total - have[classYear]!;
    if (short > most + 1e-9) {
      most = short;
      best = classYear;
    }
  }
  return best;
}

/**
 * Let newcomers in. `founders` is true for the founding class, at move-in and
 * for as long as its waitlist is open: everyone admitted from it is spread
 * across the four class years. Every later class comes in as freshmen.
 */
function enrol(state: GameState, count: number, offCampus: number, founders: boolean): void {
  const off = Math.min(count, offCampus);
  if (count > 0 && founders && state.fourYears) {
    // The founding class: freshmen through seniors, and those living in town in the same shares.
    const year = Math.max(1, calendarAt(state.clock).year);
    for (let n = 0; n < count; n++) {
      const classYear = nextFounderYear(state.cohorts);
      state.cohorts[classYear]! += 1;
      classRecord(state, year - classYear).entered += 1;
    }
    for (let n = 0; n < off; n++) {
      const classYear = nextFounderYear(state.offCampus, state.cohorts);
      if (classYear < 0) break;
      state.offCampus[classYear]! += 1;
    }
  } else {
    state.cohorts[0] += count;
    state.offCampus[0] += off;
    if (count > 0) classRecord(state, Math.max(1, calendarAt(state.clock).year)).entered += count;
  }
  state.stats.peakEnrollment = Math.max(state.stats.peakEnrollment, enrollment(state));
  markRatesDirty(state);
}

/**
 * A save from before campuses opened with all four class years. At its next
 * fall intake, once classes have moved up, its continuing students are spread
 * so that no class year is empty: the oldest become seniors, the next juniors,
 * and nobody moves down a year. Nobody is added or removed, those living in
 * town move with their class, and each class's record moves with its students.
 * A campus four years old has every class already and is left alone.
 */
export function spreadClassYears(state: GameState, log: LogEntry[]): void {
  if (state.fourYears) return;
  state.fourYears = true;
  const { year } = calendarAt(state.clock);
  const c = state.cohorts;
  const continuing = c[1] + c[2] + c[3];
  if (continuing <= 0 || (c[1] > 0 && c[2] > 0 && c[3] > 0)) return;

  // What each upper class would hold at the founding shares, to the nearest student.
  const upper = FOUNDING_SHARES[1] + FOUNDING_SHARES[2] + FOUNDING_SHARES[3];
  const seniors = Math.round((continuing * FOUNDING_SHARES[3]) / upper);
  const juniors = Math.round((continuing * FOUNDING_SHARES[2]) / upper);

  let moved = 0;
  /** Move students up from one class year to another, with their share of those living in town and of their record. */
  const moveUp = (from: number, to: number, want: number): number => {
    const n = Math.max(0, Math.min(want, state.cohorts[from]!));
    if (n === 0 || from === to) return n;
    const off = Math.min(state.offCampus[from]!, Math.round((state.offCampus[from]! * n) / state.cohorts[from]!));
    state.cohorts[from]! -= n;
    state.cohorts[to]! += n;
    state.offCampus[from]! -= off;
    state.offCampus[to]! += off;
    const source = classRecord(state, year - from);
    const taken = Math.min(n, source.entered);
    source.entered -= taken;
    classRecord(state, year - to).entered += taken;
    moved += n;
    return n;
  };
  // Seniors first, from the oldest students there are. Then juniors. Whoever is left stays where they are.
  let need = Math.max(0, seniors - state.cohorts[3]);
  need -= moveUp(2, 3, need);
  moveUp(1, 3, need);
  need = Math.max(0, juniors - state.cohorts[2]);
  moveUp(1, 2, need);

  if (moved > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'classes',
      text: `The student body now has all four class years: ${headCount(moved)} students moved up to fill them. Nobody left, and income is unchanged. Seniors graduate this spring.`,
      data: { moved },
    });
  }
}

/**
 * A class arrives. On a game with a cap, applicants past the room the cap
 * leaves are turned away for good (DESIGN.md 38.4). Of the rest, whoever does
 * not fit goes on the waitlist for a bed or a seat.
 */
export function runIntake(state: GameState, season: Season, log: LogEntry[]): void {
  const tick = state.clock.tick;
  const expected = classSize(state, season, tick === FIRST_INTAKE_TICK);
  const cap = enrollmentCap(state);
  // Everyone who applied, and how many of them the cap leaves a place for.
  const places = Math.min(expected, roomUnderCap(state));
  const capped = expected - places;
  const locals = localsAmong(places);
  const plan = admitPlan(state, places, locals);
  const admitted = plan.admitted;
  const turnedAway = places - admitted;
  const bottleneck = turnedAway > 0 ? plan.tightest : null;

  enrol(state, admitted, plan.off, tick === FIRST_INTAKE_TICK);
  state.admissions.lastIntake = { tick, season, expected, admitted, turnedAway, bottleneck, ...(cap === null ? {} : { capped }) };
  // The year's applicants and places, for selectivity: both classes of a year count, from the fall on.
  if (season === 'fall') state.admissions.year = { applied: 0, admitted: 0 };
  state.admissions.year.applied += expected;
  state.admissions.year.admitted += admitted;
  // The first class arriving puts safety and medical staff on the payroll, whoever was admitted.
  markRatesDirty(state);
  state.admissions.waitlist = turnedAway;
  state.admissions.waitlistLocals = locals - plan.locals;
  state.admissions.waitlistUntilTick = turnedAway > 0 ? tick + WAITLIST_TICKS : 0;
  state.admissions.waitlistAdmitted = 0;

  const { year } = calendarAt(state.clock);
  const label = season === 'fall' ? `The fall class of year ${year}` : `The spring class of year ${year}`;
  const full = capped > 0 && cap !== null ? ` The campus is full at ${headCount(cap)}: ${headCount(capped)} more who applied were turned away.` : '';
  log.push({
    tick,
    kind: 'intake',
    text:
      (bottleneck === null
        ? `${label} moved in: ${headCount(admitted)} students${capped > 0 ? '.' : ', and everyone found a place.'}`
        : `${label} moved in: ${headCount(admitted)} students. ${headCount(turnedAway)} more are on the waitlist for want of ${ZONE_UNIT[bottleneck]}.`) + full,
    data: { season, year, expected, admitted, turnedAway, bottleneck: bottleneck ?? '', capped },
  });
  // A semester begins: faculty and staff hired a semester ago arrive, and those no longer needed have left.
  staffSemester(state, season, log);
  // A class has moved in: a policy changed since the last one may be changed again (DESIGN.md 41.7).
  unlockPolicies(state);
  // And it is experience toward the University Level (DESIGN.md 42.2).
  if (admitted > 0) earn(state, 'classIn', log);
  // A size goal lands here, at an intake, and nowhere else (DESIGN.md 37.2).
  landSizeGoals(state, log);
}

/**
 * A campus that opens with its students already there: up to `count` of them,
 * in all four class years, locals living in town where a way to class exists,
 * exactly as a founding class would be let in. Returns how many got a place.
 */
export function openWithStudents(state: GameState, count: number): number {
  const plan = admitPlan(state, count, localsAmong(count));
  enrol(state, plan.admitted, plan.off, true);
  state.admissions.lastIntake = { tick: state.clock.tick, season: 'fall', expected: plan.admitted, admitted: plan.admitted, turnedAway: 0, bottleneck: null };
  state.admissions.year = { applied: plan.admitted, admitted: plan.admitted };
  // It opens with the faculty and staff its students need: they were hired for the opening.
  staffSemester(state, 'fall');
  markRatesDirty(state);
  return plan.admitted;
}

/** While a waitlist is open, any room that appears fills at once. */
export function fillFromWaitlist(state: GameState, log: LogEntry[]): void {
  const a = state.admissions;
  if (a.waitlist <= 0 || state.clock.tick >= a.waitlistUntilTick) return;
  const plan = admitPlan(state, a.waitlist, Math.min(a.waitlist, a.waitlistLocals));
  const count = plan.admitted;
  if (count <= 0) return;
  enrol(state, count, plan.off, a.lastIntake?.tick === FIRST_INTAKE_TICK);
  a.waitlist -= count;
  a.waitlistLocals = Math.max(0, Math.min(a.waitlist, a.waitlistLocals - plan.locals));
  a.waitlistAdmitted += count;
  a.year.admitted += count;
  // Where faculty follow the students at once, they do so now. Elsewhere this changes nothing until the list closes.
  if (!hiresBehindNow(state)) planStaff(state);
  log.push({
    tick: state.clock.tick,
    kind: 'waitlist',
    text: count === 1 ? '1 student came off the waitlist.' : `${headCount(count)} students came off the waitlist.`,
    data: { count },
  });
}

/** A day and a half after an intake, whoever is still waiting gives up. */
export function closeWaitlist(state: GameState, log: LogEntry[]): void {
  const a = state.admissions;
  if (a.waitlistUntilTick === 0) return;
  const lost = a.waitlist;
  const admitted = a.waitlistAdmitted;
  const zone = a.lastIntake?.bottleneck ?? null;
  a.waitlist = 0;
  a.waitlistLocals = 0;
  a.waitlistUntilTick = 0;
  // The search for next semester's faculty follows the students who actually came.
  if (admitted > 0) planStaff(state);
  if (lost > 0 || admitted > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'waitlistClosed',
      text:
        lost === 0
          ? `The waitlist closed. All ${headCount(admitted)} who waited got in.`
          : `The waitlist closed. ${admitted > 0 ? `${headCount(admitted)} got in and ` : ''}${headCount(lost)} went elsewhere${zone ? `, for want of ${ZONE_UNIT[zone]}` : ''}.`,
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
  // A semester of sustained high Stress costs a few more students: a hundredth at the very worst.
  const stress = closeSemester(state);
  // A policy may ask a few more to leave: tough grading does (DESIGN.md 41.7).
  const harder = leavingMore(state);
  const stays = mood.retention * (1 - stressLoss(stress)) * (1 - harder.share);
  const c = state.cohorts;
  const { year } = calendarAt(state.clock);
  const next: [number, number, number, number] = [0, 0, 0, 0];
  for (let classYear = 0; classYear < 4; classYear++) {
    const was = c[classYear]!;
    next[classYear] = Math.round(was * stays);
    // Those living in town leave at the same rate as everyone else.
    state.offCampus[classYear] = Math.min(next[classYear]!, Math.round(state.offCampus[classYear]! * stays));
    if (was > next[classYear]!) classRecord(state, year - classYear).left += was - next[classYear]!;
  }
  state.cohorts = next;

  // Dorm students with no bed do not come back. Room only limits who is admitted, so this is what
  // stops a full dorm being cleared and its students kept. Those living in town are not affected.
  let homeless = dormStudents(state) - openCapacity(state, 'housing');
  for (let classYear = 0; classYear < 4 && homeless > 0; classYear++) {
    const go = Math.min(homeless, state.cohorts[classYear]! - state.offCampus[classYear]!);
    if (go <= 0) continue;
    state.cohorts[classYear]! -= go;
    classRecord(state, year - classYear).left += go;
    homeless -= go;
  }
  const stayed = enrollment(state);
  const left = before - stayed;
  state.admissions.lastSemester = { tick: state.clock.tick, stayed, left, happiness: Math.round(mood.base) };
  if (!hiresBehindNow(state)) planStaff(state);
  markRatesDirty(state);
  // How many of those who left a policy sent: the share it asks, of those who would otherwise have stayed.
  const byPolicy = Math.min(left, Math.round(before * mood.retention * (1 - stressLoss(stress)) * harder.share));
  if (log && before > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'semester',
      text:
        left === 0
          ? 'The semester ended and every student is staying on.'
          : `The semester ended. ${headCount(left)} ${left === 1 ? 'student' : 'students'} did not come back. Happiness was ${Math.round(mood.base)}.${byPolicy > 0 ? ` ${harder.by.join(' and ')}: ${headCount(byPolicy)} of them.` : ''}`,
      data: { left, stayed, happiness: Math.round(mood.base), worst: mood.worst ?? '', stress: Math.round(stress), policy: byPolicy },
    });
  }
}

/** Day 6: the spring semester ends and the seniors graduate. */
export function graduate(state: GameState, log: LogEntry[]): void {
  semesterEnd(state, log);
  const seniors = state.cohorts[3];
  state.cohorts[3] = 0;
  state.offCampus[3] = 0;
  if (seniors > 0) classRecord(state, calendarAt(state.clock).year - 3).finishedOnTime += seniors;
  state.stats.graduates += seniors;
  if (!hiresBehindNow(state)) planStaff(state);
  markRatesDirty(state);
  if (seniors > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'graduation',
      text: `${headCount(seniors)} seniors graduated. ${headCount(state.stats.graduates)} alumni so far.`,
      data: { seniors, alumni: state.stats.graduates },
    });
    earn(state, 'graduation', log);
  }
}

/** A new year begins: every class moves up one year. */
export function promote(state: GameState): void {
  const c = state.cohorts;
  state.cohorts = [0, c[0], c[1], c[2] + c[3]];
  const o = state.offCampus;
  state.offCampus = [0, o[0], o[1], o[2] + o[3]];
}

/**
 * The share of this year's applicants who got a place, the fall class and
 * the spring class together, counting those who came off a waitlist. The
 * academic rating reads selectivity from it. null before the first class.
 */
export function yearAcceptance(state: GameState): number | null {
  const year = state.admissions.year;
  if (!state.admissions.lastIntake || year.applied <= 0) return null;
  return Math.min(1, year.admitted / year.applied);
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
