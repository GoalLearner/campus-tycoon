import { newGreek } from '../src/sim/systems/greek';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  academicInputs,
  acceptanceRate,
  admitPlan,
  advance,
  advisorLines,
  applyAction,
  budget,
  campusLevels,
  capacity,
  CLASS_SIZE,
  classPressure,
  classSizeNow,
  CROWD_LIFT_FLOOR,
  crowding,
  diningAt,
  dormStudents,
  enrollment,
  enrollmentCap,
  eraOf,
  expectedClass,
  FACULTY_PAY,
  facultyCount,
  facultyNeed,
  facultyWorking,
  goalsReached,
  growthShortage,
  headCount,
  hiresBehind,
  INSTRUCTION_FULL,
  INSTRUCTION_RATIOS,
  LAG_EVERY_GAME,
  localsAmong,
  lotStatus,
  mealUse,
  newGame,
  nextApplicants,
  nextFall,
  nextSemesterStaff,
  openCapacity,
  ownedAt,
  parseSave,
  personCard,
  PLACED,
  playUse,
  ratioTarget,
  roomForNewStudents,
  roomUnderCap,
  sampleStudents,
  SAVE_VERSION,
  seatsForRoom,
  shortage,
  STAFF_SUPPORT_LOSS,
  staffCount,
  staffNeed,
  staffSupport,
  stressRead,
  STRESS_CAUSES,
  studentCard,
  STUDENTS_PER_STAFF,
  studentsWanted,
  teaching,
  teachingQuality,
  touchesPath,
  townPlaces,
  validate,
  workerCount,
  yearAcceptance,
  type Action,
  type GameState,
  type LogEntry,
  type Need,
  type NeedId,
} from '../src/sim';
import { newStory } from '../src/sim/systems/mc';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { capacityView, instructionView, sizeView } from '../src/ui/sizeUi';
import { DAY, freshGame, HOUR, T0 } from './helpers';

const WEEK = 7 * DAY;
const model = (scale?: number, seed = 35): GameState => newGame({ seed, name: 'Test University', now: T0, campus: 'model', ...(scale ? { scale } : {}) });

/** The campus at a real moment, with everything logged on the way. */
function at(state: GameState, time: number): { state: GameState; log: LogEntry[] } {
  const result = advance(state, state.clock.lastSimulatedAt, time);
  return { state: result.state, log: result.log };
}

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The same campus with a share of every class, as if the rest had gone overnight. Its faculty and staff are who they were. */
function withStudents(state: GameState, share: number): GameState {
  const next = structuredClone(state);
  next.cohorts = next.cohorts.map((n) => Math.round(n * share)) as GameState['cohorts'];
  next.offCampus = next.offCampus.map((n, year) => Math.min(next.cohorts[year]!, Math.round(n * share))) as GameState['offCampus'];
  next.money.ratesDirty = true;
  return next;
}

// The first year of a model campus made at T0 with no anchor: its week begins a minute after it opens.
const SPRING = T0 + 3 * DAY + HOUR;
const SUMMER = T0 + 5 * DAY + HOUR;
const FALL_2 = T0 + 7 * DAY + HOUR;
const need = (state: GameState, id: NeedId): Need => capacity(state).needs.find((one) => one.id === id)!;

describe('faculty and staff are head counts the campus keeps', () => {
  it('a model campus opens with exactly those its students need, at full funding', () => {
    const state = model();
    expect(INSTRUCTION_RATIOS[INSTRUCTION_FULL]).toBe(CLASS_SIZE);
    expect(INSTRUCTION_RATIOS[0]).toBe(25);
    expect(INSTRUCTION_RATIOS[INSTRUCTION_RATIOS.length - 1]).toBe(15);
    expect(state.staffing).toEqual({ faculty: 2300, staff: 1150, facultyPlan: 2300, staffPlan: 1150, instruction: INSTRUCTION_FULL });
    expect(ratioTarget(state)).toBe(20);
    expect(classSizeNow(state)).toBe(20);
    expect(teaching(state)).toBe(0.5);
    expect(hiresBehind(state)).toBe(true);
    const faculty = budget(state).groups.flatMap((group) => group.lines).find((line) => line.id === 'faculty')!;
    expect(faculty.amount).toBe(2300 * FACULTY_PAY);
    expect(faculty.detail).toBe('2,300 members at $58,000, funded at one for every 20 students');
  });

  it('arrive a semester behind the students, so a bigger class stretches the ratio until they do', () => {
    const spring = at(model(), SPRING);
    expect(enrollment(spring.state)).toBeGreaterThan(46_000);
    // The spring class has moved in, and the faculty for it have not.
    expect(facultyCount(spring.state)).toBe(2300);
    expect(staffCount(spring.state)).toBe(1150);
    expect(facultyNeed(spring.state)).toBeGreaterThan(2300);
    expect(classSizeNow(spring.state)).toBeGreaterThan(20);
    expect(teaching(spring.state)).toBeGreaterThan(0.5);
    // What the campus needs now is what it has gone looking for, and they arrive with the next semester.
    expect(spring.state.staffing.facultyPlan).toBe(facultyNeed(spring.state));
    expect(nextSemesterStaff(spring.state).faculty).toBe(facultyNeed(spring.state));
    const said = spring.log.filter((entry) => entry.kind === 'staff');
    expect(said.length).toBe(1);
    expect(said[0]!.text).toMatch(/^Classes are larger this semester: one member of faculty to every 21 students, where 20 is funded\. [\d,]+ more faculty arrive in the fall\.$/);

    const fall = at(spring.state, FALL_2).state;
    expect(facultyCount(fall)).toBe(spring.state.staffing.facultyPlan);
    expect(staffCount(fall)).toBe(spring.state.staffing.staffPlan);
    // The fall class is bigger again, so they are still a semester behind.
    expect(facultyNeed(fall)).toBeGreaterThan(facultyCount(fall));
    // A campus that has stopped growing catches up, and stays caught up.
    const settled = at(fall, T0 + 2 * WEEK + DAY).state;
    expect(enrollment(settled)).toBe(50_000);
    expect(facultyCount(settled)).toBe(2500);
    expect(staffCount(settled)).toBe(1250);
    expect(classSizeNow(settled)).toBe(20);
  });

  it('are never let go: a fall in enrollment is carried on the payroll for a semester', () => {
    const term = at(model(), T0 + DAY).state;
    const fewer = withStudents(term, 0.6);
    expect(facultyNeed(fewer)).toBe(1380);
    expect(facultyCount(fewer)).toBe(2300);
    const pay = (state: GameState): number => budget(state).groups.flatMap((group) => group.lines).find((line) => line.id === 'faculty')!.amount;
    expect(pay(fewer)).toBe(2300 * FACULTY_PAY);
    // The semester turns. They were all wanted a semester ago, so all of them are still here.
    const spring = at(fewer, SPRING);
    expect(facultyCount(spring.state)).toBe(2300);
    expect(pay(spring.state)).toBe(2300 * FACULTY_PAY);
    expect(spring.log.find((entry) => entry.kind === 'staff')!.text).toMatch(/^The campus has [\d,]+ more faculty than its students need\. Nobody is let go: they leave by the fall, and are paid until then\.$/);
    // A semester later those who were not needed have left, and nobody the students now need has.
    const fall = at(spring.state, FALL_2).state;
    expect(facultyCount(fall)).toBeLessThan(2300);
    expect(facultyCount(fall)).toBe(Math.max(facultyNeed(fall), spring.state.staffing.facultyPlan));
    expect(facultyCount(fall)).toBeGreaterThanOrEqual(facultyNeed(fall));
    expect(staffCount(fall)).toBeGreaterThanOrEqual(staffNeed(fall));
  });

  it("over the summer only those the summer's students need are paid, and everyone is back for the fall", () => {
    const summer = at(model(), SUMMER).state;
    expect(enrollment(summer)).toBeLessThan(40_000);
    // Commencement is not a fall in enrollment: nobody has left the faculty.
    expect(facultyCount(summer)).toBe(2300);
    expect(facultyWorking(summer)).toBe(facultyNeed(summer));
    expect(facultyWorking(summer)).toBeLessThan(2300);
    const faculty = budget(summer).groups.flatMap((group) => group.lines).find((line) => line.id === 'faculty')!;
    expect(faculty.amount).toBe(facultyWorking(summer) * FACULTY_PAY);
    expect(faculty.detail).toMatch(/[\d,]+ more are away for the summer$/);
    // Classes over the summer are the size that is funded, neither better nor worse.
    expect(classSizeNow(summer)).toBe(20);
    const fall = at(summer, FALL_2).state;
    expect(facultyWorking(fall)).toBe(facultyCount(fall));
    expect(facultyCount(fall)).toBeGreaterThanOrEqual(2300);
  });

  it('follow the Instruction slider, a step a student, and its faculty arrive when the next semester begins', () => {
    const start = model();
    const more = act(start, { type: 'instruction', step: INSTRUCTION_FULL + 3 });
    expect(ratioTarget(more)).toBe(17);
    // Nobody is hired on the spot. Classes are what they were until those hired arrive.
    expect(facultyCount(more)).toBe(2300);
    expect(more.staffing.facultyPlan).toBe(Math.round(46_000 / 17));
    expect(classSizeNow(more)).toBeCloseTo(20, 1);
    expect(nextSemesterStaff(more).faculty).toBe(2706);
    const spring = at(more, SPRING).state;
    expect(facultyCount(spring)).toBe(2706);
    expect(classSizeNow(spring)).toBeLessThan(18);
    expect(teaching(spring)).toBeLessThan(0.3);

    // Underfunded, the campus hires nobody, and those it no longer funds leave a semester later.
    const fewer = act(start, { type: 'instruction', step: 0 });
    expect(ratioTarget(fewer)).toBe(25);
    expect(facultyCount(fewer)).toBe(2300);
    const later = at(fewer, SPRING).state;
    expect(facultyCount(later)).toBe(Math.max(facultyNeed(later), 1840));
    expect(classSizeNow(later)).toBe(25);
    expect(teaching(later)).toBe(1);

    for (const step of [-1, INSTRUCTION_RATIOS.length, 2.5]) expect(applyAction(start, { type: 'instruction', step }).ok).toBe(false);
    const same = applyAction(start, { type: 'instruction', step: INSTRUCTION_FULL });
    expect(same.ok && same.changed).toBe(0);
  });

  it('follow the students at once on a game begun on the small campus, as they always did', () => {
    expect(LAG_EVERY_GAME).toBe(false);
    let state = freshGame();
    expect(hiresBehind(state)).toBe(false);
    expect(facultyCount(state)).toBe(0);
    for (let day = 1; day <= 21; day++) {
      state = at(state, T0 + day * DAY).state;
      const students = enrollment(state);
      expect(facultyCount(state), `day ${day}`).toBe(Math.max(1, Math.round(students / CLASS_SIZE)));
      expect(staffCount(state), `day ${day}`).toBe(Math.max(1, Math.round(students / STUDENTS_PER_STAFF)));
      expect(teaching(state)).toBe(0.5);
    }
    expect(enrollment(state)).toBeGreaterThan(50);
    expect(enrollmentCap(state)).toBeNull();
  });
});

describe('a class has two named causes for its size: seats and faculty', () => {
  /** A model campus with room in its classes, and as many faculty as asked for: left out, exactly those it funds. */
  const roomy = (faculty?: number): GameState => {
    const state = withStudents(model(), 0.6);
    state.staffing.faculty = faculty ?? facultyNeed(state);
    return state;
  };
  const best = { recreation: 1, green: 1, safety: 1, dining: 1 };

  it('reads full funding as neither good nor bad, so Stress is what it was', () => {
    const state = model();
    const read = stressRead(state, campusLevels(state));
    expect(read.teaching).toBe(0.5);
    expect(read.pressure).toBe((read.crowding + 0.5) / 2);
    expect(read.strain).toBe(classPressure(state));
    expect(read.cause).not.toBe('teaching');
    expect(staffSupport(state)).toBe(1);
  });

  it('raises Stress when faculty are stretched, and names the ratio', () => {
    const base = roomy();
    const stretched = roomy(700);
    expect(crowding(base)).toBe(0);
    expect(classSizeNow(stretched)).toBeGreaterThan(25);
    expect(teaching(stretched)).toBe(1);
    const calm = stressRead(base, best, 1);
    const tense = stressRead(stretched, best, 1);
    expect(tense.score).toBeGreaterThan(calm.score);
    expect(tense.cause).toBe('teaching');
    expect(STRESS_CAUSES.teaching.name).toBe('too few faculty');
    expect(calm.cause).not.toBe('teaching');
    // Well funded, it is lower than at full funding.
    const funded = roomy();
    funded.staffing.instruction = INSTRUCTION_RATIOS.length - 1;
    funded.staffing.faculty = facultyNeed(funded);
    expect(classSizeNow(funded)).toBe(15);
    expect(stressRead(funded, best, 1).score).toBeLessThan(calm.score);
  });

  it('counts no ratio past the worst for more: a term of huge classes is bounded', () => {
    const worst = roomy(1104);
    const absurd = roomy(1);
    expect(classSizeNow(worst)).toBe(25);
    expect(teaching(absurd)).toBe(1);
    expect(classPressure(absurd)).toBe(classPressure(worst));
    expect(stressRead(absurd, best, 1).score).toBe(stressRead(worst, best, 1).score);
    expect(stressRead(absurd, best, 1).score).toBeLessThanOrEqual(100);
  });

  it('is class size in the academic rating, seats and faculty in equal parts, and says which weighs more', () => {
    const classes = (state: GameState): { level: number | null; detail: string } => academicInputs(state).find((input) => input.id === 'classSize')!;
    const open = model();
    expect(classes(open).level).toBeCloseTo(100 * (1 - (crowding(open) + 0.5) / 2), 9);
    expect(classes(open).detail).toBe('Classes are 71% of the way to full, with one member of faculty to every 20 students');
    // Roomy seats alone, or a well-funded faculty alone, go three quarters of the way. It takes both.
    expect(classes(roomy()).level).toBe(75);
    const funded = roomy();
    funded.staffing.instruction = INSTRUCTION_RATIOS.length - 1;
    funded.staffing.faculty = facultyNeed(funded);
    expect(classes(funded).level).toBe(100);
    expect(classes(funded).detail).toBe('Classes have room, with one member of faculty to every 15 students');
    const stretched = roomy(700);
    expect(classes(stretched).level).toBe(50);
    expect(classes(stretched).detail).toMatch(/^There is one member of faculty to every \d+ students, where 20 is funded, and classes have room$/);
  });

  it("lowers a student's grades, and is on their card and a professor's", () => {
    const base = roomy();
    const stretched = roomy(700);
    const funded = roomy();
    funded.staffing.instruction = INSTRUCTION_RATIOS.length - 1;
    funded.staffing.faculty = facultyNeed(funded);
    expect(teachingQuality(stretched)).toBeLessThan(teachingQuality(base));
    expect(teachingQuality(funded)).toBeGreaterThan(teachingQuality(base));
    const who = sampleStudents(base, 4)[0]!;
    expect(studentCard(base, who)!.classSize).toBe(20);
    expect(studentCard(stretched, who)!.classSize).toBe(Math.round(classSizeNow(stretched)));
    expect(studentCard(stretched, who)!.gpa).toBeLessThanOrEqual(studentCard(base, who)!.gpa);
    expect(studentCard(funded, who)!.classSize).toBe(15);

    const professor = personCard(stretched, { role: 'professor', n: 0 })!;
    expect(professor.quotes).toEqual({ what: 'classSize', value: Math.round(classSizeNow(stretched)) });
    expect(professor.line).toMatch(/We are [\d,]+ short of the one to every 20 the campus funds\./);
    expect(personCard(base, { role: 'professor', n: 0 })!.line).not.toMatch(/short of/);
  });

  it("is on the Provost's line", () => {
    expect(advisorLines(model())[0]!.issue).toMatch(/ Faculty: 1 to 20\.$/);
    const stretched = roomy(700);
    expect(advisorLines(stretched)[0]!.issue).toMatch(/^Faculty are stretched: one to every \d+ students, where 20 is funded\./);
  });

  it('lets a campus short of staff support its students a little less, and no less than a floor', () => {
    const state = model();
    const half = structuredClone(state);
    half.staffing.staff = 575;
    expect(staffSupport(half)).toBeCloseTo(1 - STAFF_SUPPORT_LOSS, 9);
    const none = structuredClone(state);
    none.staffing.staff = 1;
    expect(staffSupport(none)).toBeCloseTo(1 - STAFF_SUPPORT_LOSS, 9);
    const most = structuredClone(state);
    most.staffing.staff = 1035;
    expect(staffSupport(most)).toBeGreaterThan(staffSupport(half));
    expect(staffSupport(most)).toBeLessThan(1);
    const levels = campusLevels(state);
    expect(stressRead(half, levels, 1).support).toBeLessThan(stressRead(state, levels, 1).support);
  });
});

describe('the cap on enrollment', () => {
  it('is 50,000 on the model campus, follows the campus scale, and is on no other game', () => {
    expect(enrollmentCap(model())).toBe(50_000);
    expect(enrollmentCap(model(1))).toBe(Math.round(50_000 / 28));
    expect(enrollmentCap(freshGame())).toBeNull();
    expect(roomUnderCap(freshGame())).toBe(Infinity);
    expect(roomUnderCap(model())).toBe(4000);
  });

  it('is never passed, though the campus has seats and beds for more', () => {
    let state = model();
    expect(openCapacity(state, 'academic')).toBeGreaterThan(50_000);
    let most = 0;
    let full = 0;
    for (let half = 1; half <= 6 * 14; half++) {
      state = at(state, T0 + (half * DAY) / 2).state;
      most = Math.max(most, enrollment(state));
      if (enrollment(state) === 50_000) full += 1;
    }
    expect(most).toBe(50_000);
    expect(full).toBeGreaterThan(10);
    // Room is what the cap leaves, whatever the seats and the beds would take.
    const plan = admitPlan(withStudents(state, 0.99), 1_000_000, localsAmong(1_000_000));
    expect(plan.admitted).toBe(50_000 - enrollment(withStudents(state, 0.99)));
    expect(roomForNewStudents(withStudents(state, 0.99)).room).toBe(plan.admitted);
    expect(validate(state)).toBeNull();
  });

  it('turns away applicants past its room for good, and the campus is the more selective for it', () => {
    const run = at(model(), T0 + 2 * WEEK + DAY);
    const state = run.state;
    const last = state.admissions.lastIntake!;
    expect(last.season).toBe('fall');
    expect(last.capped).toBeGreaterThan(0);
    expect(last.expected).toBe(last.admitted + last.capped!);
    // Nobody waits for a bed or a seat: the cap is not a waitlist.
    expect(last.turnedAway).toBe(0);
    expect(last.bottleneck).toBeNull();
    expect(state.admissions.waitlist).toBe(0);
    expect(enrollment(state)).toBe(50_000);
    const said = run.log.filter((entry) => entry.kind === 'intake').pop()!;
    expect(said.text).toBe(`The fall class of year 3 moved in: ${headCount(last.admitted)} students. The campus is full at 50,000: ${headCount(last.capped!)} more who applied were turned away.`);
    expect(yearAcceptance(state)).toBeCloseTo(last.admitted / last.expected, 9);
    const selectivity = academicInputs(state).find((input) => input.id === 'selectivity')!;
    expect(selectivity.level).toBeGreaterThan(0);
    expect(selectivity.detail).toBe(`${Math.round((100 * last.admitted) / last.expected)}% of applicants are admitted`);
  });

  it("reads selectivity from the year's two classes together, so one small spring class does not speak for it", () => {
    const run = at(model(), T0 + 2 * WEEK + 3 * DAY + HOUR);
    const intakes = run.log.filter((entry) => entry.kind === 'intake').slice(-2);
    expect(intakes.map((entry) => entry.data?.season)).toEqual(['fall', 'spring']);
    const applied = intakes.reduce((sum, entry) => sum + Number(entry.data?.expected), 0);
    const admitted = intakes.reduce((sum, entry) => sum + Number(entry.data?.admitted), 0);
    expect(run.state.admissions.year).toEqual({ applied, admitted });
    expect(yearAcceptance(run.state)).toBeCloseTo(admitted / applied, 9);
    // The spring class by itself: a few hundred places for a couple of thousand applicants.
    expect(acceptanceRate(run.state)!).toBeLessThan(yearAcceptance(run.state)! - 0.3);
  });

  it('stops the forecast at the cap: the campus plans for the students it can take', () => {
    const state = at(model(), T0 + 2 * WEEK + DAY).state;
    expect(nextApplicants(state)).toBeGreaterThan(expectedClass(state));
    expect(expectedClass(state)).toBe(0);
    expect(studentsWanted(state)).toBe(50_000);
    expect(shortage(state, 'academic')).toBeLessThanOrEqual(0);
    expect(shortage(state, 'housing')).toBeLessThanOrEqual(0);
    const fall = nextFall(state);
    expect(fall.staying).toBe(50_000 - state.cohorts[3]);
    expect(fall.admitted).toBe(Math.min(fall.applicants, 50_000 - fall.staying));
    expect(fall.students).toBeLessThanOrEqual(50_000);
    expect(fall.turnedAway).toBe(fall.applicants - fall.admitted);
  });

  it('lets a game above it keep every student and every goal, and admits nobody until commencement brings it under', () => {
    const over = structuredClone(at(model(), T0 + DAY).state);
    over.cohorts = [13_000, 13_000, 12_500, 12_500];
    over.offCampus = [5600, 5600, 5400, 5400];
    over.goals = { size: 3, rank: 0, rewards: 0, reached: [{ ladder: 'size', n: 0, year: 1 }, { ladder: 'size', n: 1, year: 1 }, { ladder: 'era', n: 1, year: 1 }, { ladder: 'size', n: 2, year: 1 }] };
    over.money.ratesDirty = true;
    expect(enrollment(over)).toBe(51_000);
    expect(roomUnderCap(over)).toBe(0);
    expect(sizeView(over).cap!.line).toBe('Above the cap of 50,000');

    const spring = at(over, SPRING);
    const intake = spring.log.find((entry) => entry.kind === 'intake')!;
    expect(intake.data).toMatchObject({ season: 'spring', admitted: 0 });
    expect(Number(intake.data?.capped)).toBe(Number(intake.data?.expected));
    // The only students gone are those who chose not to come back at the end of the semester.
    expect(enrollment(spring.state)).toBe(51_000 - spring.state.admissions.lastSemester!.left);
    expect(enrollment(spring.state)).toBeGreaterThan(50_000);
    expect(spring.state.goals!.size).toBe(3);
    expect(eraOf(spring.state.goals)).toBe(1);
    expect(goalsReached(spring.state).filter((line) => line.endsWith('students'))).toEqual(['Year 1 · 60,000 students', 'Year 1 · 55,000 students', 'Year 1 · 50,000 students']);

    // Commencement brings it under, and the fall class fills it to the cap and no further.
    const fall = at(spring.state, FALL_2);
    const next = fall.log.filter((entry) => entry.kind === 'intake').pop()!;
    expect(Number(next.data?.admitted)).toBeGreaterThan(0);
    expect(enrollment(fall.state)).toBeLessThanOrEqual(50_000);
    expect(fall.state.goals!.size).toBe(3);
    expect(validate(fall.state)).toBeNull();
  });

  it('still lets an Academic lot be built on to ease crowded classes, though no student needs the seat', () => {
    let state = at(model(), T0 + 2 * WEEK + DAY).state;
    expect(crowding(state)).toBeGreaterThan(0.9);
    expect(shortage(state, 'academic')).toBeLessThanOrEqual(0);
    expect(seatsForRoom(state)).toBeGreaterThan(0);
    expect(growthShortage(state, 'academic')).toBe(seatsForRoom(state));
    expect(growthShortage(state, 'housing')).toBe(shortage(state, 'housing'));
    // Zone open ground beside a walk, as a player would.
    const seats = openCapacity(state, 'academic');
    const map = state.map;
    let zoned = 0;
    for (let y = 0; y < map.height && zoned < 3; y++) {
      for (let x = 0; x < map.width && zoned < 3; x++) {
        if (map.cells[y * map.width + x]!.kind !== 'empty' || !ownedAt(map, x, y) || !touchesPath(map, x, y)) continue;
        const tried = applyAction(state, { type: 'paint', tool: 'academic', cells: [[x, y]] });
        if (!tried.ok) continue;
        const status = lotStatus(tried.state, x, y);
        if (!status || (status.kind === 'stalled' && status.cause !== 'noDemand' && status.also.length === 0 && status.cause === 'lowDesirability')) continue;
        if (status.kind === 'stalled') continue;
        state = tried.state;
        zoned += 1;
      }
    }
    expect(zoned).toBeGreaterThan(0);
    const later = at(state, state.clock.lastSimulatedAt + 3 * HOUR).state;
    expect(openCapacity(later, 'academic')).toBeGreaterThan(seats);
    expect(enrollment(later)).toBe(50_000);
    // A game with no cap builds seats for its students and no more, as it always did.
    const small = at(freshGame(), T0 + WEEK).state;
    expect(seatsForRoom(small)).toBe(0);
    expect(growthShortage(small, 'academic')).toBe(shortage(small, 'academic'));
  });
});

describe('the Capacity page', () => {
  it('lists every need of a student, each read from the system that owns it', () => {
    const state = model();
    const page = capacity(state);
    expect(page.needs.map((one) => one.id)).toEqual(['beds', 'seats', 'faculty', 'dining', 'recreation', 'care', 'parking', 'workers', 'staff']);
    expect(page.needs.map((one) => one.name)).toEqual(['Beds', 'Classroom seats', 'Faculty', 'Dining', 'Recreation', 'Safety & health', 'Parking', 'Maintenance workers', 'Staff']);
    expect(page.students).toBe(46_000);
    expect(need(state, 'beds')).toMatchObject({ have: openCapacity(state, 'housing'), want: dormStudents(state) });
    expect(need(state, 'seats')).toMatchObject({ have: openCapacity(state, 'academic'), want: 46_000 });
    expect(need(state, 'faculty')).toMatchObject({ have: 2300, want: 2300, line: '2,300 of 2,300 · 1 to 20' });
    expect(need(state, 'staff')).toMatchObject({ have: 1150, want: 1150, line: '1,150 of 1,150 · 1 to 40' });
    expect(need(state, 'parking').have).toBe(townPlaces(state.map).spaces);
    expect(need(state, 'workers').have).toBe(workerCount(state));
    const sum = (family: string, read: (placed: NonNullable<GameState['map']['placed'][number]>) => number): number => state.map.placed.reduce((total, placed) => total + (placed && PLACED[placed.type].family === family ? read(placed) : 0), 0);
    expect(need(state, 'dining').have).toBe(sum('dining', (placed) => mealUse(state, placed)!.capacity));
    expect(need(state, 'recreation').have).toBe(sum('recreation', (placed) => playUse(state, placed)!.capacity));
    expect(need(state, 'care').line).toMatch(/^\d+% of students covered$/);
  });

  it('gives each a status and says what that does, with its fix', () => {
    const state = model();
    const status = Object.fromEntries(capacity(state).needs.map((one) => [one.id, one.status]));
    expect(status).toMatchObject({ beds: 'ok', seats: 'tight', faculty: 'ok', dining: 'ok', recreation: 'ok', parking: 'ok', workers: 'ok', staff: 'ok' });
    // A row that is doing nothing says nothing. One that is says what it lowers.
    for (const one of capacity(state).needs) expect(one.consequence === '', one.id).toBe(one.status === 'ok');
    // Crowded classes on a campus with room for every student: zoning Academic lots is the fix, and it says how many.
    expect(need(state, 'seats').consequence).toMatch(/^91% of the seats are taken, and classes feel crowded past 70%\. Crowded classes raise Stress, and lower grades and the academic rating\. [\d,]+ more seats would give them room: about \d+ more Academic lots\.$/);
    expect(need(state, 'beds').fix).toEqual({ kind: 'plan', zone: 'housing' });
    expect(need(state, 'seats').fix).toEqual({ kind: 'zone', zone: 'academic' });
    expect(need(state, 'seats').fixLabel).toBe('Zone Academic lots');
    // A game with no cap builds no seat a student does not need, so its row promises none and goes to the plan.
    const small = at(freshGame(), T0 + DAY).state;
    expect(need(small, 'seats').fix).toEqual({ kind: 'plan', zone: 'academic' });
    expect(need(state, 'faculty').fix).toEqual({ kind: 'slider' });
    expect(need(state, 'dining').fix).toMatchObject({ kind: 'build', label: 'Food' });
    expect(need(state, 'care').fix).toMatchObject({ kind: 'build', label: 'Safety & health' });
    expect(need(state, 'parking').fix).toEqual({ kind: 'place', type: 'parking' });
    expect(need(state, 'staff').fix).toEqual({ kind: 'none' });

    // Faculty short of what is funded: the row says what it costs and who is on the way.
    const short = structuredClone(state);
    short.staffing.faculty = 1900;
    expect(need(short, 'faculty')).toMatchObject({ status: 'short', line: '1,900 of 2,300 · 1 to 24' });
    expect(need(short, 'faculty').consequence).toBe('Classes average 24 students, where 20 is funded. Larger classes raise Stress, and lower grades and the academic rating. 400 more arrive in the spring.');
    // Waiting for a better ratio the player has just asked for costs nothing yet.
    const asked = act(state, { type: 'instruction', step: INSTRUCTION_FULL + 3 });
    expect(need(asked, 'faculty').consequence).toBe('Classes average 20 students, where 17 is funded. 406 more arrive in the spring.');
    // More than the students need: nobody is let go.
    const spare = withStudents(state, 0.6);
    expect(need(spare, 'faculty').status).toBe('ok');
    expect(need(spare, 'faculty').consequence).toBe('920 more than the students need. Nobody is let go: they leave by the spring, and are paid until then.');
  });

  it("scales every row from one enrollment number, and shows next fall's", () => {
    const state = model();
    const fall = nextFall(state);
    expect(fall.staying).toBe(46_000 - state.cohorts[3]);
    expect(capacity(state).nextFall).toBe(fall.students);
    expect(need(state, 'faculty').forecast).toBe(`Next fall's students need ${headCount(facultyNeed(state, fall.students))}.`);
    expect(need(state, 'staff').forecast).toBe(`Next fall's students need ${headCount(staffNeed(state, fall.students))}.`);
    // Twice the students ask twice as much of everything counted by the student.
    const twice = structuredClone(state);
    twice.cohorts = twice.cohorts.map((n) => n * 2) as GameState['cohorts'];
    twice.offCampus = twice.offCampus.map((n) => n * 2) as GameState['offCampus'];
    expect(need(twice, 'faculty').want).toBe(4600);
    expect(need(twice, 'staff').want).toBe(2300);
    expect(need(twice, 'seats').want).toBe(92_000);
    expect(need(twice, 'dining').want).toBe(2 * need(state, 'dining').want);
    expect(need(twice, 'recreation').want).toBe(2 * need(state, 'recreation').want);
    // The same campus at scale 1 is the same page, 28 times smaller.
    const small = capacity(model(1));
    expect(Math.abs((small.needs[2]!.have * 28) / 2300 - 1)).toBeLessThan(0.01);
    expect(small.needs.map((one) => one.status)).toEqual(capacity(state).needs.map((one) => one.status));
  });

  it('gives a place to eat room for so many: a long line takes a little off, with a floor, and blocks nothing', () => {
    const state = model();
    const eats = state.map.placed.filter((placed): placed is NonNullable<typeof placed> => !!placed && PLACED[placed.type].family === 'dining');
    expect(eats.length).toBeGreaterThan(5);
    // The model campus opens with a line nowhere, so its Happiness is what it was.
    for (const placed of eats) expect(mealUse(state, placed)!.ratio, placed.type).toBeLessThanOrEqual(1);
    expect(need(state, 'dining').status).toBe('ok');
    // Every lot with food in reach shares its meals out in full.
    const lots = state.map.cells.filter((cell, i) => cell.kind === 'lot' && diningAt(state, i % state.map.width, Math.floor(i / state.map.width)) > 0).length;
    expect(Object.values(state.map.care.meals!).reduce((sum, share) => sum + share, 0)).toBeCloseTo(lots, 6);

    // Five times the students: lines everywhere, and each place's part in Happiness falls to its floor and no further.
    const packed = structuredClone(state);
    packed.cohorts = packed.cohorts.map((n) => n * 5) as GameState['cohorts'];
    const uses = eats.map((placed) => mealUse(packed, placed)!);
    expect(uses.some((use) => use.waiting > 0)).toBe(true);
    for (const use of uses) {
      expect(use.lift).toBeGreaterThanOrEqual(CROWD_LIFT_FLOOR);
      expect(use.lift).toBeLessThanOrEqual(1);
    }
    expect(need(packed, 'dining').status).not.toBe('ok');
    expect(need(packed, 'dining').consequence).toMatch(/Food & fun/);
    const busy = eats.find((placed) => mealUse(packed, placed)!.ratio >= 2)!;
    expect(diningAt(packed, busy.x, busy.y)).toBeGreaterThanOrEqual(CROWD_LIFT_FLOOR);
    expect(diningAt(packed, busy.x, busy.y)).toBeLessThan(1);
    // A save from before places to eat could fill up reads as it did until its map is next worked out.
    const before = structuredClone(packed);
    delete before.map.care.meals;
    expect(diningAt(before, busy.x, busy.y)).toBe(1);
  });

  it('never blocks the game: a campus short of faculty, staff and workers runs on', () => {
    let state = structuredClone(model());
    state.staffing.faculty = 100;
    state.staffing.staff = 10;
    for (const key of Object.keys(state.grounds.workers)) state.grounds.workers[Number(key)] = 0;
    state.money.ratesDirty = true;
    expect(need(state, 'faculty').status).toBe('short');
    expect(need(state, 'staff').status).toBe('short');
    expect(need(state, 'workers').status).toBe('short');
    const run = at(state, T0 + 3 * WEEK + DAY);
    state = run.state;
    expect(run.log.filter((entry) => entry.kind === 'intake' && Number(entry.data?.admitted) > 0).length).toBeGreaterThanOrEqual(4);
    expect(enrollment(state)).toBeGreaterThan(45_000);
    // Faculty and staff are hired by themselves, a semester behind. Workers wait for the player.
    expect(need(state, 'faculty').status).toBe('ok');
    expect(need(state, 'staff').status).toBe('ok');
    expect(validate(state)).toBeNull();
  });

  it('is said in plain words, with the Instruction slider beside the faculty', () => {
    const state = model();
    const view = capacityView(state);
    expect(view.lead).toBe(`Next fall: ${headCount(nextFall(state).students)} students`);
    expect(view.rows.map((row) => row.word)).toEqual(capacity(state).needs.map((one) => (one.status === 'ok' ? 'OK' : one.status === 'tight' ? 'Tight' : 'Short')));
    expect(view.tab).toMatch(/^Capacity · \d short$/);
    expect(view.rows.find((row) => row.id === 'seats')!.detail.length).toBe(2);
    expect(view.rows.find((row) => row.id === 'faculty')!.detail).toEqual([need(state, 'faculty').forecast]);
    expect(view.rows.find((row) => row.id === 'faculty')!.fixLabel).toBe('');
    expect(view.rows.find((row) => row.id === 'seats')!.fixLabel).toBe('Zone Academic lots');

    const slider = instructionView(state);
    expect(slider).toMatchObject({ step: INSTRUCTION_FULL, max: 10, line: '1 to 20 · full funding' });
    expect(slider.note).toBe("2,300 faculty for today's students: $173.4M a year with benefits.");
    const more = instructionView(act(state, { type: 'instruction', step: INSTRUCTION_FULL + 1 }));
    expect(more.line).toBe('1 to 19 · well funded');
    expect(more.note).toBe("2,421 faculty for today's students: $182.5M a year with benefits. 121 more arrive in the spring.");
    const fewer = instructionView(act(state, { type: 'instruction', step: INSTRUCTION_FULL - 1 }));
    expect(fewer.line).toBe('1 to 21 · underfunded');
    expect(fewer.note).toMatch(/A change arrives a semester after it is made\.$|leave by the spring\. Nobody is let go\.$/);
  });
});

describe('a save from version 15', () => {
  const text = readFileSync(new URL('./fixtures/save-v15-model.json', import.meta.url), 'utf8');

  it("comes through with nothing moved: the owner's own kind of game", () => {
    const file = JSON.parse(text) as { v: number; state: GameState };
    expect(file.v).toBe(15);
    expect(file.state.school.name).toBe('Larp University');
    expect(file.state.map.scale).toBe(28);
    expect(file.state.goals).toEqual({ size: 0, rank: 0, reached: [], rewards: 0 });
    expect(file.state.cohorts.reduce((sum, n) => sum + n, 0)).toBe(46_000);
    expect(file.state.staffing).toBeUndefined();

    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    const state = loaded.state;
    expect(loaded.migratedFrom).toBe(15);
    // Faculty and staff at exactly what it paid for the moment before, and the slider in the middle.
    expect(state.staffing).toEqual({ faculty: 2300, staff: 1150, facultyPlan: 2300, staffPlan: 1150, instruction: INSTRUCTION_FULL });
    expect(state.admissions.year).toEqual({ applied: 46_000, admitted: 46_000 });
    const books = budget(state);
    expect(books.spending).toBeCloseTo(file.state.money.spendingPerYear, 4);
    expect(books.incomeTotal).toBeCloseTo(file.state.money.incomePerYear, 4);
    // No place to eat has a line, classes are the size they were, and Stress reads teaching as it always did.
    for (const placed of state.map.placed) if (placed && PLACED[placed.type].family === 'dining') expect(mealUse(state, placed)!.ratio).toBeLessThanOrEqual(1);
    expect(classSizeNow(state)).toBe(20);
    expect(teaching(state)).toBe(0.5);
    expect(staffSupport(state)).toBe(1);

    // Everything else is as it was saved.
    const expected = structuredClone(file.state);
    expected.version = SAVE_VERSION;
    expected.staffing = state.staffing;
    expected.admissions.year = state.admissions.year;
    expected.map.care.meals = state.map.care.meals!;
    // Version 17 adds the policies, every one off (tests/policies.test.ts has those).
    expected.policies = { on: [], locked: [], news: [] };
    // Version 18 adds the daily layer (tests/daily.test.ts has that).
    expected.daily = state.daily;
    // Version 19 adds the orders board and its stream of numbers (tests/orders.test.ts has those).
    expected.orders = state.orders;
    // Version 20 adds the decorations in storage and the Workshop (tests/decor.test.ts has those).
    expected.decor = state.decor;
    expected.rhythm = state.rhythm;
    expected.bigBuilds = state.bigBuilds;
    expected.labs = state.labs;
    expected.traditions = state.traditions;
    expected.greek = newGreek();
    expected.rng.orders = state.rng.orders;
    // Version 27 adds the alumni pool (tests/alumni.test.ts has it).
    expected.alumni = state.alumni;
    // Version 28 adds the Main Character's story (tests/mc.test.ts has it).
    expected.story = newStory();
    expect(state).toEqual(expected);
    expect(validate(state)).toBeNull();

    // It plays on: its first spring class arrives, its faculty follow a semester behind, and it never passes the cap.
    const later = at(state, state.clock.lastSimulatedAt + 3 * WEEK).state;
    expect(validate(later)).toBeNull();
    expect(enrollment(later)).toBeLessThanOrEqual(50_000);
    expect(enrollment(later)).toBeGreaterThan(46_000);
    expect(later.goals!.size).toBe(1);
  });

  it('keeps every student and every goal of a game that had passed 50,000 before the cap', () => {
    const file = JSON.parse(text) as { v: number; state: GameState };
    file.state.cohorts = [14_000, 13_000, 12_500, 12_000];
    file.state.offCampus = [5700, 5500, 5400, 5300];
    file.state.goals = { size: 2, rank: 0, rewards: 0, reached: [{ ladder: 'size', n: 0, year: 1 }, { ladder: 'size', n: 1, year: 1 }, { ladder: 'era', n: 1, year: 1 }] };
    const loaded = parseSave(JSON.stringify(file));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(enrollment(loaded.state)).toBe(51_500);
    expect(loaded.state.cohorts).toEqual([14_000, 13_000, 12_500, 12_000]);
    expect(loaded.state.goals).toEqual(file.state.goals);
    expect(eraOf(loaded.state.goals)).toBe(1);
    expect(loaded.state.staffing.faculty).toBe(2575);
    expect(roomUnderCap(loaded.state)).toBe(0);
  });

  it('tells an upgraded save what is new, once', () => {
    // Two of its own, and the ones versions 17 to 20 added after it (the policies, daily, orders and decor tests).
    const notes = upgradeNotes(15);
    expect(notes.length).toBe(15);
    expect(notes[0]).toMatch(/Capacity page/);
    expect(notes[1]).toMatch(/full at 50,000 students/);
    expect(upgradeNotes(SAVE_VERSION)).toEqual([]);
  });
});
