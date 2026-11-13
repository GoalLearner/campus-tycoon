import { calendarAt, GRADUATION_TICK_IN_YEAR } from '../calendar';
import { MAX_STAGE, stageSpec } from '../config/buildings';
import { WORK_PER_WORKER, YARD_MAX_WORKERS } from '../config/grounds';
import { STUDENTS_PER_STAFF } from '../config/money';
import { PLACED } from '../config/placed';
import { CROWDING_FROM } from '../config/season';
import { COVER_OK, COVER_SHORT, RATIO_SHORT, RATIO_TIGHT } from '../config/staffing';
import { FIRST_INTAKE_TICK } from '../config/time';
import { headCount } from '../format';
import { scaleOf } from '../scale';
import { enrollment, openCapacity } from '../selectors';
import type { GameState, Placed, Zone } from '../types';
import { bedsWanted, dormStudents, fallApplicants, localsNeedingBeds, nextIntakeSeason, seatsForRoom, studentsWanted } from './demand';
import { mealUse } from './food';
import { roomUnderCap } from './goals';
import { housedNote } from './policies';
import { workersAt, yardStatus } from './grounds';
import { coverFor } from './incidents';
import { playUse } from './play';
import { classSizeNow, facultyNeed, facultyStretched, facultyWorking, nextSemesterStaff, ratioTarget, staffNeed, staffWorking } from './staffing';
import { driversNow, offCampusNow, townPlaces } from './town';

/**
 * The Capacity page (DESIGN.md section 38): every need of a student as what
 * the campus has against what its enrollment asks of it, with one word on how
 * it stands and what that does.
 *
 * Every row is read from the same enrollment number. Nothing here is stored
 * and nothing here changes a number: each row reports a rule that lives in
 * its own system. Only beds and seats can turn a student away. A shortfall
 * anywhere else lowers one number, which the row names. It is worked out when
 * the page is opened, never in catch-up.
 */

export type NeedId = 'beds' | 'seats' | 'faculty' | 'dining' | 'recreation' | 'care' | 'parking' | 'workers' | 'staff';
export type NeedStatus = 'ok' | 'tight' | 'short';

/** Where a row's fix is: the screen or the spot the row taps through to. */
export type NeedFix =
  | { kind: 'plan'; zone: Zone }
  /** Put a zone's tool in hand: the lots to zone are the fix. */
  | { kind: 'zone'; zone: Zone }
  | { kind: 'slider' }
  | { kind: 'build'; label: string; at: { x: number; y: number } | null }
  | { kind: 'place'; type: 'parking' }
  | { kind: 'yard'; x: number; y: number }
  | { kind: 'none' };

export interface Need {
  id: NeedId;
  name: string;
  /** What the campus has and what its students ask of it now, in the same unit. */
  have: number;
  want: number;
  status: NeedStatus;
  /** The row: "30,000 of 30,240 beds in use". */
  line: string;
  /** What its status does, said on a tap. '' when it is doing nothing. */
  consequence: string;
  /** What next fall's students will ask of it, on today's campus. */
  forecast: string;
  /** What the button under it says, and where it goes. '' with no button. */
  fixLabel: string;
  fix: NeedFix;
}

export interface Capacity {
  students: number;
  /** Students expected next fall, as far as the cap and the applicants allow. */
  nextFall: number;
  needs: Need[];
  /** How many rows are short, and tight. */
  short: number;
  tight: number;
}

const STATUS_WORD: Record<NeedStatus, string> = { ok: 'OK', tight: 'Tight', short: 'Short' };
export function statusWord(status: NeedStatus): string {
  return STATUS_WORD[status];
}

export interface NextFall {
  /** Students who will still be here: everyone but the seniors yet to graduate. */
  staying: number;
  /** Everyone who will apply, as the campus stands today. */
  applicants: number;
  /** How many of them the cap leaves a place for. All of them on a game with no cap. */
  admitted: number;
  turnedAway: number;
  /** Students on campus once the class has moved in. */
  students: number;
}

/** Next fall, on today's campus: who stays, who applies, and how many of those the cap leaves room for. */
export function nextFall(state: GameState): NextFall {
  const applicants = fallApplicants(state).total;
  // Seniors still to graduate this year will be gone by then.
  const staying = state.clock.tick < FIRST_INTAKE_TICK ? 0 : enrollment(state) - (calendarAt(state.clock).tickInYear < GRADUATION_TICK_IN_YEAR ? state.cohorts[3] : 0);
  const admitted = Math.min(applicants, roomUnderCap(state, staying));
  return { staying, applicants, admitted, turnedAway: applicants - admitted, students: staying + admitted };
}

/** Students expected on campus next fall: those who stay, and as many applicants as the cap leaves room for. */
export function nextFallStudents(state: GameState): number {
  return nextFall(state).students;
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;
const plural = (n: number, one: string, many: string): string => `${headCount(n)} ${n === 1 ? one : many}`;

/** The share of students who live or study inside both a Medical Center's circle and Campus Safety's. */
function covered(state: GameState): number {
  const map = state.map;
  let people = 0;
  let inside = 0;
  for (const building of map.buildings) {
    if (!building || building.stage < 1) continue;
    // Used as a weight, so the campus scale cancels.
    const size = stageSpec(building.zone, building.stage, 1).capacity;
    people += size;
    if (coverFor(map, 'medical', building.x, building.y) && coverFor(map, 'safety', building.x, building.y)) inside += size;
  }
  return people > 0 ? inside / people : 1;
}

/** A row for faculty or staff: a head count against the one the students need, and who is on the way. */
function peopleRow(state: GameState, which: 'faculty' | 'staff', fall: number): Need {
  const faculty = which === 'faculty';
  const have = faculty ? facultyWorking(state) : staffWorking(state);
  const want = faculty ? facultyNeed(state) : staffNeed(state);
  const students = enrollment(state);
  const funded = faculty ? ratioTarget(state) : STUDENTS_PER_STAFF;
  const each = faculty ? Math.round(classSizeNow(state)) : have > 0 ? Math.round(students / have) : 0;
  const over = want > 0 && have > 0 ? want / have - 1 : want > 0 ? 1 : 0;
  const status: NeedStatus = over >= RATIO_SHORT ? 'short' : over >= RATIO_TIGHT ? 'tight' : 'ok';
  const next = nextSemesterStaff(state);
  const coming = (faculty ? next.faculty : next.staff) - have;
  const when = nextIntakeSeason(state);
  const arrive = coming > 0 ? ` ${headCount(coming)} more arrive in the ${when}.` : '';
  const spare = have - want;
  let consequence = '';
  if (status !== 'ok') {
    // Classes larger than full funding makes them cost something. Classes that are only waiting for a better
    // ratio the player has just asked for cost nothing yet: they are as they were.
    const costs = facultyStretched(state) ? ' Larger classes raise Stress, and lower grades and the academic rating.' : '';
    consequence = faculty
      ? `Classes average ${each} students, where ${funded} is funded.${costs}${arrive || ' More are hired when the next semester begins.'}`
      : `One member of staff to every ${each} students, where ${funded} is the rule. Advisors are stretched, and Stress is a little higher.${arrive || ' More are hired when the next semester begins.'}`;
  } else if (spare > 0 && spare >= want * RATIO_TIGHT) {
    consequence = `${headCount(spare)} more than the students need. Nobody is let go: they leave by the ${when}, and are paid until then.`;
  }
  const need = faculty ? facultyNeed(state, fall) : staffNeed(state, fall);
  return {
    id: which,
    name: faculty ? 'Faculty' : 'Staff',
    have,
    want,
    status,
    line: students > 0 ? `${headCount(have)} of ${headCount(want)} · 1 to ${each}` : 'Nobody is enrolled yet',
    consequence,
    forecast: `Next fall's students need ${headCount(need)}.`,
    fixLabel: '',
    fix: faculty ? { kind: 'slider' } : { kind: 'none' },
  };
}

/** A row for places to eat or places to play: what they hold at the busiest hour against who wants in. */
function crowdRow(state: GameState, which: 'dining' | 'recreation', growth: number): Need {
  const dining = which === 'dining';
  let have = 0;
  let want = 0;
  let lines = 0;
  let worst: { placed: Placed; ratio: number } | null = null;
  for (const placed of state.map.placed) {
    if (!placed || PLACED[placed.type].family !== which) continue;
    const use = dining ? mealUse(state, placed) : playUse(state, placed);
    if (!use) continue;
    have += use.capacity;
    want += use.demand;
    if (use.ratio > 1) lines += 1;
    if (!worst || use.ratio > worst.ratio) worst = { placed, ratio: use.ratio };
  }
  want = Math.round(want);
  const status: NeedStatus = want > have ? 'short' : lines > 0 ? 'tight' : 'ok';
  const noun = dining ? plural(lines, 'place to eat has', 'places to eat have') : plural(lines, 'place to play has', 'places to play have');
  const unit = dining ? 'meals' : 'places';
  let consequence = '';
  if (status === 'short') consequence = `More students want ${dining ? 'a meal' : 'to play'} at the busiest hour than the campus can take. The wait takes a little off Food & fun for the students near.`;
  else if (status === 'tight') consequence = `${noun} a line at the busiest hour. It takes a little off Food & fun for the students near. Another nearby shares the crowd.`;
  return {
    id: which,
    name: dining ? 'Dining' : 'Recreation',
    have,
    want,
    status,
    line: have > 0 ? `${headCount(want)} of ${headCount(have)} ${unit} at the busiest hour` : dining ? 'Nowhere to eat yet' : 'Nowhere to play yet',
    consequence,
    forecast: `Next fall's students will want ${headCount(Math.round(want * growth))}.`,
    fixLabel: dining ? 'Build somewhere to eat' : 'Build somewhere to play',
    fix: { kind: 'build', label: dining ? 'Food' : 'Recreation', at: worst && worst.ratio > 1 ? { x: worst.placed.x, y: worst.placed.y } : null },
  };
}

/** The Capacity page, top to bottom. */
export function capacity(state: GameState): Capacity {
  const students = enrollment(state);
  const fall = nextFallStudents(state);
  const growth = students > 0 ? fall / students : 1;
  const scale = scaleOf(state);
  const needs: Need[] = [];

  // ---- beds, with locals housed in town
  {
    const have = openCapacity(state, 'housing');
    const want = dormStudents(state);
    const wanted = bedsWanted(state);
    const local = offCampusNow(state);
    // Freshmen from town a policy has put in the beds left over (DESIGN.md 41.7). They are named on this row.
    const { housed, by: housedBy } = housedNote(state);
    const noBed = Math.max(0, want - have);
    const status: NeedStatus = noBed > 0 || wanted > have ? 'short' : 'ok';
    let consequence = '';
    if (noBed > 0) consequence = `${plural(noBed, 'student has', 'students have')} no bed, and will leave when the semester ends.`;
    else if (wanted > have) consequence = `The next class needs ${headCount(wanted - have)} more beds than there are. Those without one wait, and go elsewhere when the waitlist closes.`;
    needs.push({
      id: 'beds',
      name: 'Beds',
      have,
      want,
      status,
      line: `${headCount(want + housed)} of ${headCount(have)} in use · ${headCount(local - housed)} live in town${housed > 0 ? ` · ${housedBy}: ${headCount(housed)}` : ''}`,
      consequence,
      forecast: `Next fall's students need ${headCount(Math.max(want, wanted))}.`,
      fixLabel: 'See the Housing plan',
      fix: { kind: 'plan', zone: 'housing' },
    });
  }

  // ---- classroom seats
  {
    const have = openCapacity(state, 'academic');
    const wanted = studentsWanted(state);
    const full = have > 0 ? students / have : students > 0 ? 1 : 0;
    const status: NeedStatus = wanted > have || students > have ? 'short' : full > CROWDING_FROM ? 'tight' : 'ok';
    let consequence = '';
    // Where lots are built on to ease crowded classes, zoning them is the fix, and the row says how many.
    const forRoom = seatsForRoom(state);
    const lots = Math.ceil(forRoom / stageSpec('academic', MAX_STAGE, scale).capacity);
    if (status === 'short') consequence = `The next class needs ${headCount(Math.max(wanted, students) - have)} more seats than there are. Those without one wait, and go elsewhere when the waitlist closes.`;
    else if (status === 'tight') {
      consequence = `${percent(full)} of the seats are taken, and classes feel crowded past ${percent(CROWDING_FROM)}. Crowded classes raise Stress, and lower grades and the academic rating.`;
      if (forRoom > 0) consequence += ` ${headCount(forRoom)} more seats would give them room: about ${lots} more Academic ${lots === 1 ? 'lot' : 'lots'}.`;
    }
    const zoning = status === 'tight' && forRoom > 0;
    needs.push({
      id: 'seats',
      name: 'Classroom seats',
      have,
      want: students,
      status,
      line: `${headCount(students)} of ${headCount(have)} taken`,
      consequence,
      forecast: `Next fall's students need ${headCount(Math.max(wanted, fall))}.`,
      fixLabel: zoning ? 'Zone Academic lots' : 'See the Academics plan',
      fix: zoning ? { kind: 'zone', zone: 'academic' } : { kind: 'plan', zone: 'academic' },
    });
  }

  needs.push(peopleRow(state, 'faculty', fall));
  needs.push(crowdRow(state, 'dining', growth));
  needs.push(crowdRow(state, 'recreation', growth));

  // ---- safety and health coverage
  {
    const share = covered(state);
    const have = Math.round(students * share);
    const status: NeedStatus = share < COVER_SHORT ? 'short' : share < COVER_OK ? 'tight' : 'ok';
    // The building it has least of in reach is the one to show.
    let spot: { x: number; y: number } | null = null;
    for (const building of state.map.buildings) {
      if (!building || building.stage < 1) continue;
      if (!coverFor(state.map, 'medical', building.x, building.y) || !coverFor(state.map, 'safety', building.x, building.y)) {
        spot = { x: building.x, y: building.y };
        break;
      }
    }
    needs.push({
      id: 'care',
      name: 'Safety & health',
      have,
      want: students,
      status,
      line: `${percent(share)} of students covered`,
      consequence: status === 'ok' ? '' : `${percent(1 - share)} of students live or study outside a Medical Center's circle or Campus Safety's. An incident there has nobody come, and Safety & health is lower.`,
      forecast: 'Coverage is by where buildings stand, so it holds as enrollment changes.',
      fixLabel: 'Build a Medical Center or Campus Safety',
      fix: { kind: 'build', label: 'Safety & health', at: spot },
    });
  }

  // ---- parking for drivers
  {
    const places = townPlaces(state.map);
    const have = places.spaces;
    const drivers = driversNow(state);
    // Locals in the next class with no place in town, as far as a space would give them one.
    const stuck = Math.min(localsNeedingBeds(state), Math.max(0, places.driveWanted - places.spaces));
    const status: NeedStatus = stuck > 0 ? 'short' : 'ok';
    needs.push({
      id: 'parking',
      name: 'Parking',
      have,
      want: drivers + stuck,
      status,
      line: `${headCount(drivers)} of ${headCount(have)} spaces in use`,
      consequence: stuck > 0 ? `${plural(stuck, 'local in the next class', 'locals in the next class')} would drive in with somewhere to park. Without a space each needs a bed.` : '',
      forecast: `The town's streets too far to walk hold ${headCount(places.driveWanted)} students.`,
      fixLabel: 'Build a Parking lot',
      fix: { kind: 'place', type: 'parking' },
    });
  }

  // ---- maintenance workers for the litter load
  {
    let have = 0;
    let want = 0;
    let behind = 0;
    let none = 0;
    let worst: { yard: Placed; hire: number } | null = null;
    for (const yard of state.map.placed) {
      if (!yard || yard.type !== 'yard') continue;
      const status = yardStatus(state, yard);
      have += workersAt(state, yard.id);
      want += Math.max(status.need > 0 ? 1 : 0, Math.ceil(status.need / WORK_PER_WORKER - 1e-9));
      if (status.hire > 0) behind += 1;
      if (status.workers === 0 && status.need > 0) none += 1;
      if (status.hire > 0 && (!worst || status.hire > worst.hire)) worst = { yard, hire: status.hire };
    }
    const status: NeedStatus = none > 0 || (worst !== null && worst.hire > YARD_MAX_WORKERS / 2) ? 'short' : behind > 0 ? 'tight' : 'ok';
    needs.push({
      id: 'workers',
      name: 'Maintenance workers',
      have: have * scale,
      want: want * scale,
      status,
      line: `${headCount(have * scale)} of ${headCount(want * scale)} for the litter load`,
      consequence: status === 'ok' ? '' : `${plural(behind, 'Facilities Yard is', 'Facilities Yards are')} short of hands. Litter builds up there, and Grounds is lower for the students near.`,
      forecast: `Next fall's students will drop litter for ${headCount(Math.ceil(want * growth) * scale)}.`,
      fixLabel: 'Go to the yard',
      fix: worst ? { kind: 'yard', x: worst.yard.x, y: worst.yard.y } : { kind: 'none' },
    });
  }

  needs.push(peopleRow(state, 'staff', fall));

  // The button a row shows only when there is something to do there.
  for (const need of needs) if (need.fix.kind === 'none' || need.fix.kind === 'slider') need.fixLabel = '';
  return { students, nextFall: fall, needs, short: needs.filter((need) => need.status === 'short').length, tight: needs.filter((need) => need.status === 'tight').length };
}
