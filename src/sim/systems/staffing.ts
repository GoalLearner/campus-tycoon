import { calendarAt } from '../calendar';
import { STUDENTS_PER_STAFF } from '../config/money';
import { TEACHING_NEUTRAL } from '../config/season';
import { INSTRUCTION_FULL, INSTRUCTION_RATIOS, LAG_EVERY_GAME, RATIO_BEST, RATIO_WORST, STAFF_SUPPORT_LOSS, STAFF_WORST_SHARE } from '../config/staffing';
import { headCount } from '../format';
import { enrollment } from '../selectors';
import type { GameState, LogEntry, Staffing } from '../types';

/**
 * Faculty and staff (DESIGN.md section 38). They are head counts kept in the
 * save, never worked out afresh from enrollment.
 *
 * On a game with goals they follow the students a semester behind. At the
 * start of each semester, once its class has moved in, each count moves
 * toward what the campus needs now, and no further than was planned when the
 * semester before it began. So when a class is larger than the last, the
 * faculty for it arrive a semester later and classes are larger until they
 * do. When enrollment falls, nobody is let go: the count comes down a
 * semester later, as people leave, and the payroll is carried until then.
 *
 * Commencement is not a fall in enrollment. Over the summer only the faculty
 * and staff the summer's students need are on the payroll, as they always
 * were, and everyone is back for the fall.
 *
 * On a game with no goals the counts follow enrollment at once, as that game
 * always has.
 *
 * All of it happens at an intake, a waitlist closing or a tap on the slider,
 * so catch-up pays nothing for it.
 */

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function newStaffing(): Staffing {
  return { faculty: 0, staff: 0, facultyPlan: 0, staffPlan: 0, instruction: INSTRUCTION_FULL };
}

/** True on a game whose faculty and staff are hired and leave a semester behind its students. */
export function hiresBehind(state: GameState): boolean {
  return LAG_EVERY_GAME || state.goals !== null;
}

/** The Instruction slider's step, kept inside its range. */
export function instructionStep(state: GameState): number {
  const step = state.staffing.instruction;
  return Number.isInteger(step) && step >= 0 && step < INSTRUCTION_RATIOS.length ? step : INSTRUCTION_FULL;
}

/** The ratio the Instruction slider asks for: students to one member of faculty. */
export function ratioTarget(state: GameState): number {
  return INSTRUCTION_RATIOS[instructionStep(state)]!;
}

/** Faculty a number of students needs at the ratio the slider asks for: to the nearest whole person, and at least one. */
export function facultyNeed(state: GameState, students = enrollment(state)): number {
  return students > 0 ? Math.max(1, Math.round(students / ratioTarget(state))) : 0;
}

/** Staff a number of students needs: admissions, advisors, administration, IT and dining. One for every 40. */
export function staffNeed(state: GameState, students = enrollment(state)): number {
  return students > 0 ? Math.max(1, Math.round(students / STUDENTS_PER_STAFF)) : 0;
}

/** Faculty the campus employs. */
export function facultyCount(state: GameState): number {
  return hiresBehind(state) ? state.staffing.faculty : facultyNeed(state);
}

/** Staff the campus employs. */
export function staffCount(state: GameState): number {
  return hiresBehind(state) ? state.staffing.staff : staffNeed(state);
}

/** True from commencement to the fall: the summer, when most students are away and so are most of those who teach them. */
function summer(state: GameState): boolean {
  const phase = calendarAt(state.clock).phase;
  return phase === 'graduation' || phase === 'summer';
}

/**
 * Faculty at work, and on the payroll, now. All of them through the fall and
 * the spring. Over the summer, as many as the summer's students need.
 */
export function facultyWorking(state: GameState): number {
  const have = facultyCount(state);
  return summer(state) ? Math.min(have, facultyNeed(state)) : have;
}

/** Staff at work, and on the payroll, now. */
export function staffWorking(state: GameState): number {
  const have = staffCount(state);
  return summer(state) ? Math.min(have, staffNeed(state)) : have;
}

/**
 * The size of a class as it is taught now: students to one member of
 * faculty. It is read from the head counts, so a campus with exactly the
 * faculty it needs has exactly the class the slider asks for. 0 with nobody
 * enrolled.
 */
export function classSizeNow(state: GameState): number {
  const need = facultyNeed(state);
  if (need <= 0) return 0;
  const have = facultyWorking(state);
  return have > 0 ? (ratioTarget(state) * need) / have : RATIO_WORST * 2;
}

/**
 * How stretched teaching is, 0 to 1: nothing at RATIO_BEST students to a
 * member of faculty, everything at RATIO_WORST, and no ratio beyond either
 * counts for more. Half is full funding, which reads as neither good nor bad.
 */
export function teaching(state: GameState): number {
  const size = classSizeNow(state);
  if (size <= 0) return TEACHING_NEUTRAL;
  return clamp01((size - RATIO_BEST) / (RATIO_WORST - RATIO_BEST));
}

/**
 * True when classes are larger than full funding would make them: the ratio
 * is what to name. A class a whisker over, from rounding faculty to whole
 * people, is not.
 */
export function facultyStretched(state: GameState): boolean {
  return teaching(state) > TEACHING_NEUTRAL + 0.005;
}

/**
 * What the staff a campus has is worth to the support it gives against
 * Stress: all of it at full strength, less as advisors are stretched, and no
 * less than a floor with half the staff it needs.
 */
export function staffSupport(state: GameState): number {
  const need = staffNeed(state);
  if (need <= 0) return 1;
  const share = staffWorking(state) / need;
  if (share >= 1) return 1;
  return 1 - STAFF_SUPPORT_LOSS * clamp01((1 - share) / (1 - STAFF_WORST_SHARE));
}

/** Move a head count one semester on: toward what is needed now, and no further than was planned a semester ago. */
function settle(have: number, plan: number, need: number): number {
  if (need > have) return Math.min(need, Math.max(have, plan));
  if (need < have) return Math.max(need, Math.min(have, plan));
  return have;
}

/** What each count will be once the next semester has begun, if nothing else changes. */
export function nextSemesterStaff(state: GameState): { faculty: number; staff: number } {
  const s = state.staffing;
  if (!hiresBehind(state)) return { faculty: facultyNeed(state), staff: staffNeed(state) };
  return { faculty: settle(s.faculty, s.facultyPlan, facultyNeed(state)), staff: settle(s.staff, s.staffPlan, staffNeed(state)) };
}

/**
 * Measure again what the campus needs. Called when a waitlist closes and when
 * the Instruction slider is moved: the search for next semester's faculty
 * follows the students who actually came, and the ratio the player now asks
 * for.
 */
export function planStaff(state: GameState): void {
  const s = state.staffing;
  s.facultyPlan = facultyNeed(state);
  s.staffPlan = staffNeed(state);
  if (!hiresBehind(state)) {
    s.faculty = s.facultyPlan;
    s.staff = s.staffPlan;
  }
  state.money.ratesDirty = true;
}

/** Faculty and staff for a campus as it opens: everyone it needs, hired for the opening. */
export function openStaff(state: GameState): void {
  const s = state.staffing;
  s.faculty = s.facultyPlan = facultyNeed(state);
  s.staff = s.staffPlan = staffNeed(state);
  state.money.ratesDirty = true;
}

/**
 * A semester begins, and its class has moved in. Those hired a semester ago
 * arrive, those who were not needed a semester ago and still are not have
 * left, and what the campus needs now is noted for the next one. A campus
 * with nobody on its payroll is opening, and is staffed in full.
 */
export function staffSemester(state: GameState, season: 'fall' | 'spring', log?: LogEntry[]): void {
  const s = state.staffing;
  if (!hiresBehind(state) || (s.faculty === 0 && s.staff === 0)) {
    openStaff(state);
    return;
  }
  const faculty = facultyNeed(state);
  const staff = staffNeed(state);
  const was = { faculty: s.faculty, staff: s.staff };
  s.faculty = settle(s.faculty, s.facultyPlan, faculty);
  s.staff = settle(s.staff, s.staffPlan, staff);
  s.facultyPlan = faculty;
  s.staffPlan = staff;
  state.money.ratesDirty = true;
  if (!log) return;
  // Said only when it is news: classes are larger than the slider asks for and stay so for a semester, or
  // people the campus no longer needs are still on its payroll.
  const short = faculty - s.faculty;
  const over = s.faculty - faculty;
  const joined = s.faculty - was.faculty;
  const next = season === 'fall' ? 'spring' : 'fall';
  if (short > 0 && short >= faculty * 0.02) {
    log.push({
      tick: state.clock.tick,
      kind: 'staff',
      text: `Classes are larger this semester: one member of faculty to every ${Math.round(classSizeNow(state))} students, where ${ratioTarget(state)} is funded. ${headCount(short)} more faculty arrive in the ${next}.`,
      data: { short, faculty: s.faculty, need: faculty, joined },
    });
  } else if (over > 0 && over >= faculty * 0.02) {
    log.push({
      tick: state.clock.tick,
      kind: 'staff',
      text: `The campus has ${headCount(over)} more faculty than its students need. Nobody is let go: they leave by the ${next}, and are paid until then.`,
      data: { over, faculty: s.faculty, need: faculty, joined },
    });
  }
}
