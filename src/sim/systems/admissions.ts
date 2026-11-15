import { calendarAt } from '../calendar';
import { deansListShare, probationShare } from './grades';
import { teachingQuality } from './students';
import { FOUNDING_SHARES } from '../config/demand';
import { CLASS_YEARS, LATE_FROM, LEAVE_WHYS, LEAVE_WORDS, RETURN_SHARE, type LeaveWhy } from '../config/population';
import { FIRST_INTAKE_TICK, WAITLIST_TICKS } from '../config/time';
import { headCount } from '../format';
import { enrollment, openCapacity } from '../selectors';
import { type ClassRecord, type GameState, type LogEntry, type Season, type Zone } from '../types';
import { classSize, dormStudents, localsAmong } from './demand';
import { enrollmentCap, landSizeGoals, roomUnderCap } from './goals';
import { leavingMore, unlockPolicies } from './policies';
import { earn } from './daily';
import { ordersMark, ordersOnIntake } from './orders';
import { rhythmOnGraduation } from './rhythm';
import { traditionsOnGraduation } from './traditions';
import { greekOnGraduation } from './greek';
import { alumniOnGraduation, alumniOnSemester } from './alumni';
import { mcOnSemester } from './mc';
import { hiresBehind as hiresBehindNow, planStaff, staffSemester } from './staffing';
import { freeTownPlaces } from './town';
import { friendsStay } from './friends';
import { campusHappiness } from './happiness';
import { markRatesDirty } from './money';
import { closeSemester, stressLoss } from './season';
import { callTimes, partiesOn, partyScene } from './parties';
import { WRITE_UPS_IN_DORMS, WRITE_UPS_PER_THOUSAND } from '../config/fourYears';
import { addWhy, anchorAt, lateFrom, leaveShares, semesterStays, splitCount, standingOf, survivalTo } from './population';

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
    // Fifth- and sixth-year seniors who opened with the campus are a run from LATE_FROM (DESIGN.md 65.2).
    if (calendarAt(state.clock).year - entryYear >= 4) record.from = LATE_FROM;
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
  const total = have.reduce((sum, n) => sum + n, 0) + 1;
  let best = -1;
  let most = -Infinity;
  for (let classYear = 0; classYear < CLASS_YEARS; classYear++) {
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

/** The founding shares of four class years, as they were when saves from before them were spread (2026-11-11). */
const SPREAD_SHARES = [0.27, 0.26, 0.25, 0.22] as const;

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

  // What each upper class would hold at the founding shares of the day this was written, to the nearest student.
  const upper = SPREAD_SHARES[1] + SPREAD_SHARES[2] + SPREAD_SHARES[3];
  const seniors = Math.round((continuing * SPREAD_SHARES[3]) / upper);
  const juniors = Math.round((continuing * SPREAD_SHARES[2]) / upper);

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
  // The orders board reads this point of the calendar: was anyone left waiting, and did a fall class fill the campus.
  ordersOnIntake(state, season, turnedAway);
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

/** Index of a reason in LEAVE_WHYS. */
const WHY = (why: LeaveWhy): number => LEAVE_WHYS.indexOf(why);

/** Add leavers by reason, and those who came back, to this academic year's tally (DESIGN.md 65.2). */
function tallyYear(state: GameState, why: readonly number[], returned = 0): void {
  const year = (state.admissions.whyYear ??= { why: LEAVE_WHYS.map(() => 0), returned: 0 });
  for (let i = 0; i < LEAVE_WHYS.length; i++) year.why[i] = (year.why[i] ?? 0) + (why[i] ?? 0);
  year.returned += returned;
}

/** Stop-outs who will come back next fall, to their own class (DESIGN.md 65.2). */
function goAway(state: GameState, entryYear: number, count: number): void {
  if (count <= 0) return;
  const away = (state.admissions.away ??= []);
  const entry = away.find((one) => one.entryYear === entryYear);
  if (entry) entry.count += count;
  else away.push({ entryYear, count });
}

/**
 * The end of a semester (DESIGN.md 65.2): some of every class year do not come back. How many follows the campus's
 * standing, its rank and its Happiness, read for each class year: first-years leave most. Each leaver has a reason,
 * and the log says them. `fall` is true at the end of the fall, false at the end of the spring.
 */
export function semesterEnd(state: GameState, log?: LogEntry[], fall = true): void {
  const before = enrollment(state);
  const mood = campusHappiness(state);
  // A semester of sustained high Stress costs a few more students: a hundredth at the very worst.
  const stress = closeSemester(state);
  ordersMark(state, 'semesterStress', stress);
  // A policy may ask a few more to leave: tough grading does (DESIGN.md 41.7).
  const harder = leavingMore(state);
  const standing = standingOf(state.field.rank, mood.base);
  const shares = anchorAt(standing.q);
  const loss = stressLoss(stress);
  const c = state.cohorts;
  const { year } = calendarAt(state.clock);
  const why = LEAVE_WHYS.map(() => 0);
  let byPolicy = 0;
  let friendsKept = 0;
  for (let classYear = 0; classYear < CLASS_YEARS; classYear++) {
    const was = c[classYear]!;
    if (was <= 0) continue;
    const plain = semesterStays(shares, classYear, fall);
    // Friends keep a few more, and having nobody close sends a few more home (DESIGN.md 63.10): within 0.3 points.
    const friends = friendsStay(state, plain);
    const base = Math.min(1, plain + friends);
    const stays = base * (1 - loss) * (1 - harder.share);
    const now = Math.round(was * stays);
    const left = was - now;
    c[classYear] = now;
    // Those living in town leave at the same rate as everyone else.
    state.offCampus[classYear] = Math.min(now, Math.round(state.offCampus[classYear]! * stays));
    friendsKept += friends * was;
    if (left <= 0) continue;
    // A policy's extra leavers leave for grades, Stress's stop out, and the rest go for the campus's reasons.
    const policy = Math.min(left, Math.round(was * base * (1 - loss) * harder.share));
    const stressed = Math.min(left - policy, Math.round(was * base * loss));
    const counts = splitCount(left - policy - stressed, leaveShares(state, standing, classYear));
    counts[WHY('grades')]! += policy;
    counts[WHY('stoppedOut')]! += stressed;
    const record = classRecord(state, year - classYear);
    record.left += left;
    addWhy(record, counts);
    for (let i = 0; i < why.length; i++) why[i]! += counts[i]!;
    byPolicy += policy;
    // Some of those who stop out come back next fall (BPS:12/17): not from a sixth year, which has no year after it.
    if (classYear < CLASS_YEARS - 1) goAway(state, year - classYear, Math.round(counts[WHY('stoppedOut')]! * RETURN_SHARE));
  }

  // Dorm students with no bed do not come back. Room only limits who is admitted, so this is what
  // stops a full dorm being cleared and its students kept. Those living in town are not affected.
  let homeless = dormStudents(state) - openCapacity(state, 'housing');
  for (let classYear = 0; classYear < CLASS_YEARS && homeless > 0; classYear++) {
    const go = Math.min(homeless, state.cohorts[classYear]! - state.offCampus[classYear]!);
    if (go <= 0) continue;
    state.cohorts[classYear]! -= go;
    const record = classRecord(state, year - classYear);
    record.left += go;
    const counts = LEAVE_WHYS.map(() => 0);
    counts[WHY('housing')] = go;
    addWhy(record, counts);
    why[WHY('housing')]! += go;
    homeless -= go;
  }
  tallyYear(state, why);
  const stayed = enrollment(state);
  const left = before - stayed;
  const friends = before > 0 ? friendsKept / before : 0;
  const returned = state.admissions.lastSemester?.returned;
  // Under-21 drinking, counted (R2, DESIGN.md 66.2, the owner's decision 8): the semester's liquor-law write-ups, most
  // in the dorms, at the real rate, moved by the party scene and the party policies as calls from parties are.
  const writeUps = partiesOn(state) ? Math.round(((WRITE_UPS_PER_THOUSAND / 1000) * before * partyScene(state) * callTimes(state, 0).safety) / 2) : 0;
  state.admissions.lastSemester = {
    tick: state.clock.tick,
    stayed,
    left,
    happiness: Math.round(mood.base),
    ...(Math.abs(friends) > 1e-9 ? { friends } : {}),
    why,
    ...(fall && returned ? { returned } : {}),
    ...(writeUps > 0 ? { writeUps } : {}),
  };
  // The semester's Happiness is part of its classes' affinity (DESIGN.md 54.1).
  alumniOnSemester(state, calendarAt(state.clock).year, mood.base);
  // The Main Character's grades for the semester (DESIGN.md 53.2).
  mcOnSemester(state, log);
  ordersMark(state, 'semesterLeft', left);
  if (!hiresBehindNow(state)) planStaff(state);
  markRatesDirty(state);
  if (log && before > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'semester',
      text:
        left === 0
          ? 'The semester ended and every student is staying on.'
          : `The semester ended. ${headCount(left)} ${left === 1 ? 'student' : 'students'} did not come back: ${whyWords(why)}. Happiness was ${Math.round(mood.base)}.${byPolicy > 0 ? ` ${harder.by.join(' and ')}: ${headCount(byPolicy)} of them.` : ''}`,
      data: { left, stayed, happiness: Math.round(mood.base), worst: mood.worst ?? '', stress: Math.round(stress), policy: byPolicy, ...Object.fromEntries(LEAVE_WHYS.map((one, i) => [one, why[i]!])) },
    });
  }
  // Then the grades are in (DESIGN.md 65.4): the Dean's list and probation at the campus's teaching, and who was suspended.
  if (log && stayed > 0) {
    const teaching = teachingQuality(state);
    const deans = Math.round(stayed * deansListShare(teaching));
    const probation = Math.round(stayed * probationShare(teaching));
    const suspended = why[WHY('grades')]!;
    log.push({
      tick: state.clock.tick,
      kind: 'grades',
      text: `Grades are in: ${headCount(deans)} on the Dean's list and ${headCount(probation)} on academic probation${suspended > 0 ? `; ${headCount(suspended)} were suspended for grades` : ''}.`,
      data: { deans, probation, suspended },
    });
  }
  if (log && writeUps > 0) {
    const dorms = Math.round(writeUps * WRITE_UPS_IN_DORMS);
    log.push({
      tick: state.clock.tick,
      kind: 'writeUps',
      text: `Campus Safety and the resident advisors wrote up ${headCount(writeUps)} ${writeUps === 1 ? 'student' : 'students'} this semester for drinking under 21, ${headCount(dorms)} of them in the dorms.`,
      data: { writeUps, dorms },
    });
  }
}

/** Leavers by reason in words, the most first: "412 transferred to other schools, 96 left for money and 40 more". */
export function whyWords(why: readonly number[]): string {
  const parts = LEAVE_WHYS.map((one, i) => ({ one, n: why[i] ?? 0 })).filter((part) => part.n > 0).sort((a, b) => b.n - a.n);
  const said = parts.slice(0, 2).map((part) => `${headCount(part.n)} ${LEAVE_WORDS[part.one].verb}`);
  const rest = parts.slice(2).reduce((sum, part) => sum + part.n, 0);
  if (rest > 0) said.push(`${headCount(rest)} for other reasons`);
  return said.length <= 1 ? (said[0] ?? '') : `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`;
}

/**
 * Day 6: the spring semester ends and commencement is held (DESIGN.md 65.2). Most seniors finish; the rest stay on as
 * fifth-year seniors, as do some of those, as sixth-year seniors. A sixth year is the last: who has not finished by
 * its end stops out.
 */
export function graduate(state: GameState, log: LogEntry[]): void {
  semesterEnd(state, log, false);
  const { year } = calendarAt(state.clock);
  const mood = campusHappiness(state);
  const shares = anchorAt(standingOf(state.field.rank, mood.base).q);
  const c = state.cohorts;
  let finished = 0;
  let onTime = 0;
  for (const classYear of [3, 4, 5] as const) {
    const was = c[classYear];
    if (was <= 0) continue;
    const record = classRecord(state, year - classYear);
    const done = classYear === 5 ? was : Math.round(was * shares.finish[classYear - 3]!);
    const finishing = classYear === 5 ? Math.round(was * shares.finish[2]) : done;
    const late = was - done;
    // Those living in town go with the rest, in proportion.
    const off = state.offCampus[classYear]!;
    state.offCampus[classYear] = Math.min(late, Math.round(off * (late / was)));
    c[classYear] = late;
    if (classYear === 3) {
      record.finishedOnTime += finishing;
      onTime += finishing;
      // Those who stay on are a run of the class, after its first LATE_FROM: the named regulars finish on time.
      record.from = lateFrom(was, late);
    } else {
      record.finishedLate += finishing;
      if (classYear === 4) record.inFive = (record.inFive ?? 0) + finishing;
    }
    finished += finishing;
    // A sixth year that ends unfinished: they stop out, and the class's record counts them as leaving.
    const unfinished = classYear === 5 ? was - finishing : 0;
    if (unfinished > 0) {
      record.left += unfinished;
      const counts = LEAVE_WHYS.map(() => 0);
      counts[WHY('stoppedOut')] = unfinished;
      addWhy(record, counts);
      tallyYear(state, counts);
    }
  }
  state.stats.graduates += finished;
  if (!hiresBehindNow(state)) planStaff(state);
  markRatesDirty(state);
  if (finished > 0) {
    const later = finished - onTime;
    log.push({
      tick: state.clock.tick,
      kind: 'graduation',
      text: `${headCount(finished)} seniors graduated${later > 0 ? `, ${headCount(later)} of them in their fifth or sixth year` : ''}. ${c[3] > 0 ? `${headCount(c[3])} stay on for a fifth year. ` : ''}${headCount(state.stats.graduates)} alumni so far.`,
      data: { seniors: finished, late: later, staying: c[3], alumni: state.stats.graduates },
    });
    earn(state, 'graduation', log);
  }
  ordersMark(state, 'graduation', finished);
  // Commencement is a moment of the calendar, and the goals for the year are paid (DESIGN.md 44).
  rhythmOnGraduation(state, finished, log);
  traditionsOnGraduation(state);
  // The class's numbers are fixed and the yearly drive is held, before its chapter members leave (DESIGN.md 54).
  alumniOnGraduation(state, year, finished, log);
  // The seniors among Greek Row's members graduate with the rest (DESIGN.md 51).
  greekOnGraduation(state);
}

/**
 * A new year begins: every class moves up one year. Those still enrolled at the end of their first year began a
 * second, which is where first-year retention is read (DESIGN.md 65.2).
 */
export function promote(state: GameState): void {
  const c = state.cohorts;
  const year = calendarAt(state.clock).year;
  if (c[0] > 0) {
    const record = classRecord(state, year - 1);
    record.second = (record.second ?? 0) + c[0];
  }
  state.cohorts = [0, c[0], c[1], c[2], c[3], c[4]];
  // A new academic year: last year's leavers are kept for the Scorecard, and this year's count starts again.
  if (state.admissions.whyYear) state.admissions.whyLastYear = state.admissions.whyYear;
  state.admissions.whyYear = { why: LEAVE_WHYS.map(() => 0), returned: 0 };
  const o = state.offCampus;
  state.offCampus = [0, o[0], o[1], o[2], o[3], o[4]];
}

/**
 * Stop-outs come back at the fall intake, to their own class, as far as room allows (DESIGN.md 65.2). They are the
 * class's last places, as those who leave are, so the students who left are the ones who return.
 */
export function returnStopOuts(state: GameState, log: LogEntry[]): void {
  const away = state.admissions.away ?? [];
  state.admissions.away = [];
  const year = calendarAt(state.clock).year;
  let returned = 0;
  for (const entry of away) {
    const classYear = year - entry.entryYear;
    if (classYear < 1 || classYear >= CLASS_YEARS || state.cohorts[classYear]! <= 0) continue;
    const room = roomForNewStudents(state).room;
    const back = Math.min(entry.count, room);
    if (back <= 0) continue;
    state.cohorts[classYear]! += back;
    const record = classRecord(state, entry.entryYear);
    record.returned = (record.returned ?? 0) + back;
    returned += back;
  }
  if (returned <= 0) return;
  tallyYear(state, [], returned);
  state.admissions.lastSemester = state.admissions.lastSemester ? { ...state.admissions.lastSemester, returned } : null;
  markRatesDirty(state);
  log.push({
    tick: state.clock.tick,
    kind: 'returned',
    text: `${headCount(returned)} ${returned === 1 ? 'student who had stopped out is' : 'students who had stopped out are'} back for the fall.`,
    data: { returned },
  });
}

/**
 * A model campus is a school that was already standing (DESIGN.md 37.4): the classes it opens with had years here
 * before the player came. Each is given its history at the shares of the campus's opening standing, so its rates are
 * a standing school's from the first day: how many entered, how many have left and why, and how many finished.
 */
export function openingHistory(state: GameState): void {
  const year = calendarAt(state.clock).year;
  const standing = standingOf(state.field.rank, campusHappiness(state).base);
  const shares = anchorAt(standing.q);
  for (let classYear = 1; classYear < CLASS_YEARS; classYear++) {
    const now = state.cohorts[classYear]!;
    if (now <= 0) continue;
    const record = classRecord(state, year - classYear);
    const path = survivalTo(shares, classYear);
    const entered = Math.round(now / path.enrolled);
    const onTime = Math.round(entered * path.onTime);
    const inFive = Math.round(entered * path.inFive);
    record.entered = entered;
    record.second = Math.round(entered * (1 - shares.leave[0]));
    if (onTime + inFive > 0) record.history = { onTime, inFive };
    const left = Math.max(0, entered - now - onTime - inFive);
    record.left = left;
    // Who left, at the reasons of each year they were in, weighed by how many left that year.
    const counts = LEAVE_WHYS.map(() => 0);
    let sum = 0;
    const each: number[] = [];
    for (let y = 0; y < classYear; y++) {
      const at = survivalTo(shares, y).enrolled * shares.leave[y]!;
      each.push(at);
      sum += at;
    }
    // Whole counts each year that add up to everyone who left, then each year's by reason.
    splitCount(left, each.map((at) => at / Math.max(1e-9, sum))).forEach((inYear, y) => {
      const part = splitCount(inYear, leaveShares(state, standing, y));
      for (let i = 0; i < counts.length; i++) counts[i]! += part[i]!;
    });
    record.why = counts;
  }
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
