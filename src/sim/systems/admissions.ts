import { calendarAt } from '../calendar';
import { FOUNDING_SHARES } from '../config/demand';
import { FIRST_INTAKE_TICK, WAITLIST_TICKS } from '../config/time';
import { headCount } from '../format';
import { enrollment, openCapacity } from '../selectors';
import { type ClassRecord, type GameState, type LogEntry, type Season, type Zone } from '../types';
import { classSize, dormStudents, localsAmong } from './demand';
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
 * seats does not fill up with locals alone.
 */
export function admitPlan(state: GameState, count: number, locals: number): Admit {
  const seats = Math.max(0, openCapacity(state, 'academic') - enrollment(state));
  const beds = Math.max(0, openCapacity(state, 'housing') - dormStudents(state));
  const places = freeTownPlaces(state);
  const localsIn = (admitted: number): number => (count <= 0 ? 0 : Math.round((locals * admitted) / count));
  const bedsFor = (admitted: number): number => admitted - Math.min(localsIn(admitted), places);

  // Beds needed never fall as more are let in, so the most that fit can be found by halving.
  let low = 0;
  let high = Math.max(0, Math.min(count, seats));
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

/** A class arrives. Whoever does not fit goes on the waitlist. */
export function runIntake(state: GameState, season: Season, log: LogEntry[]): void {
  const tick = state.clock.tick;
  const expected = classSize(state, season, tick === FIRST_INTAKE_TICK);
  const locals = localsAmong(expected);
  const plan = admitPlan(state, expected, locals);
  const admitted = plan.admitted;
  const turnedAway = expected - admitted;
  const bottleneck = turnedAway > 0 ? plan.tightest : null;

  enrol(state, admitted, plan.off, tick === FIRST_INTAKE_TICK);
  state.admissions.lastIntake = { tick, season, expected, admitted, turnedAway, bottleneck };
  // The first class arriving puts safety and medical staff on the payroll, whoever was admitted.
  markRatesDirty(state);
  state.admissions.waitlist = turnedAway;
  state.admissions.waitlistLocals = locals - plan.locals;
  state.admissions.waitlistUntilTick = turnedAway > 0 ? tick + WAITLIST_TICKS : 0;
  state.admissions.waitlistAdmitted = 0;

  const { year } = calendarAt(state.clock);
  const label = season === 'fall' ? `The fall class of year ${year}` : `The spring class of year ${year}`;
  log.push({
    tick,
    kind: 'intake',
    text:
      bottleneck === null
        ? `${label} moved in: ${headCount(admitted)} students, and everyone found a place.`
        : `${label} moved in: ${headCount(admitted)} students. ${headCount(turnedAway)} more are on the waitlist for want of ${ZONE_UNIT[bottleneck]}.`,
    data: { season, year, expected, admitted, turnedAway, bottleneck: bottleneck ?? '' },
  });
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
  const stays = mood.retention * (1 - stressLoss(stress));
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
  markRatesDirty(state);
  if (log && before > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'semester',
      text:
        left === 0
          ? 'The semester ended and every student is staying on.'
          : `The semester ended. ${headCount(left)} ${left === 1 ? 'student' : 'students'} did not come back. Happiness was ${Math.round(mood.base)}.`,
      data: { left, stayed, happiness: Math.round(mood.base), worst: mood.worst ?? '', stress: Math.round(stress) },
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
  markRatesDirty(state);
  if (seniors > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'graduation',
      text: `${headCount(seniors)} seniors graduated. ${headCount(state.stats.graduates)} alumni so far.`,
      data: { seniors, alumni: state.stats.graduates },
    });
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
