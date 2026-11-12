import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  foodIncomePerYear,
  dayRead,
  placedIncomePerYear,
  advance,
  applyAction,
  BENEFITS_SHARE,
  budget,
  CARE_STAFF_PAY,
  careStaffAt,
  careStaffCount,
  CLASS_SIZE,
  ENDOWMENT_YIELD,
  enrollment,
  FACULTY_PAY,
  facultyCount,
  firstClassArrived,
  fallClassDraw,
  INSURANCE_PER_STUDENT,
  LEGACY_COST_PER_STUDENT_PER_YEAR,
  LEGACY_WAGE_PER_YEAR,
  MARKETING_COST_PER_STUDENT,
  MARKETING_LIFT,
  marketingLift,
  parseSave,
  PHASE_STEPS,
  PLACED,
  PROGRAMS_PER_STUDENT,
  SAVE_VERSION,
  STAFF_PAY,
  staffCount,
  START_CASH,
  STUDENTS_PER_CARE_STAFF,
  STUDENTS_PER_STAFF,
  studentsInCircle,
  summarizeAway,
  SUPPLIES_PER_STUDENT,
  upkeepPerYear,
  utilitiesOf,
  validate,
  WAGE_PER_YEAR,
  workerCount,
  type Action,
  type Budget,
  type GameState,
  type LogEntry,
} from '../src/sim';
import { dailyCashCheck, recomputeRates } from '../src/sim/systems/money';
import { buildEntries, moneyView, placedFacts, placedSummary } from '../src/ui/buildUi';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The starter campus with a given number of students and money to build. Its first class has arrived, unless it is empty. */
function campus(students: number): GameState {
  const state = structuredClone(freshGame());
  state.money.cash = 10_000_000;
  state.cohorts = [students, 0, 0, 0];
  if (students > 0) state.admissions.lastIntake = { tick: 15, season: 'fall', expected: students, admitted: students, turnedAway: 0, bottleneck: null };
  recomputeRates(state);
  return state;
}

const line = (b: Budget, id: string): number => {
  for (const group of b.groups) for (const item of group.lines) if (item.id === id) return item.amount;
  return 0;
};
const group = (b: Budget, id: string): number => b.groups.find((g) => g.id === id)?.amount ?? 0;

describe('what the money buys', () => {
  it('pays faculty and staff by the students they serve, with benefits on top of all pay', () => {
    const state = campus(1000);
    expect(facultyCount(state)).toBe(1000 / CLASS_SIZE);
    expect(staffCount(state)).toBe(1000 / STUDENTS_PER_STAFF);
    const b = budget(state);
    expect(line(b, 'faculty')).toBe(50 * FACULTY_PAY);
    expect(line(b, 'staff')).toBe(25 * STAFF_PAY);
    expect(line(b, 'benefits')).toBeCloseTo(BENEFITS_SHARE * (line(b, 'faculty') + line(b, 'staff') + line(b, 'care') + line(b, 'workers')), 6);
    expect(group(b, 'payroll')).toBeCloseTo(line(b, 'faculty') + line(b, 'staff') + line(b, 'care') + line(b, 'workers') + line(b, 'benefits'), 6);
    // To the nearest whole person, and nobody on the books of an empty campus.
    expect(facultyCount(campus(210))).toBe(11);
    expect(staffCount(campus(210))).toBe(5);
    expect(facultyCount(campus(5))).toBe(1);
    expect(facultyCount(campus(0))).toBe(0);
    expect(staffCount(campus(0))).toBe(0);
  });

  it('adds up: groups largest first, every line inside one, and spending is what is charged', () => {
    const state = act(campus(1000), { type: 'place', building: 'medical', x: 14, y: 10 });
    recomputeRates(state);
    const b = budget(state);
    expect(b.groups.map((g) => g.id).sort()).toEqual(['buildings', 'other', 'payroll']);
    expect(b.groups[0]!.id).toBe('payroll');
    for (let i = 1; i < b.groups.length; i++) expect(b.groups[i]!.amount).toBeLessThanOrEqual(b.groups[i - 1]!.amount);
    for (const g of b.groups) {
      expect(g.amount).toBeCloseTo(g.lines.reduce((sum, item) => sum + item.amount, 0), 6);
      for (let i = 1; i < g.lines.length; i++) expect(g.lines[i]!.amount).toBeLessThanOrEqual(g.lines[i - 1]!.amount);
      for (const item of g.lines) expect(item.detail.length).toBeGreaterThan(0);
    }
    expect(b.fullSpending).toBeCloseTo(b.groups.reduce((sum, g) => sum + g.amount, 0), 6);
    expect(b.spending).toBe(b.fullSpending);
    expect(b.phase).toBeNull();
    expect(state.money.spendingPerYear).toBe(b.spending);
    expect(state.money.incomePerYear).toBe(b.incomeTotal);
    expect(b.kept).toBeCloseTo((100 * (b.incomeTotal - b.spending)) / b.incomeTotal, 9);
    // The count behind a line can be read off it.
    const faculty = b.groups.find((g) => g.id === 'payroll')!.lines.find((item) => item.id === 'faculty')!;
    expect(faculty.detail).toMatch(/^50 members at \$58,000/);
    // Payroll is the largest group, and more than half of everything spent.
    expect(group(b, 'payroll')).toBeGreaterThan(b.fullSpending / 2);
  });

  it('follows the size of the campus: nothing but its buildings costs anything when it is empty', () => {
    const empty = budget(campus(0));
    expect(group(empty, 'payroll')).toBe(0);
    expect(group(empty, 'other')).toBe(0);
    expect(empty.fullSpending).toBe(group(empty, 'buildings'));
    // Twice the students, twice every line that is paid by the student.
    const one = budget(campus(1000));
    const two = budget(campus(2000));
    for (const id of ['faculty', 'staff', 'supplies', 'programs', 'insurance']) expect(line(two, id)).toBe(2 * line(one, id));
    expect(line(one, 'supplies')).toBe(1000 * SUPPLIES_PER_STUDENT);
    expect(line(one, 'programs')).toBe(1000 * PROGRAMS_PER_STUDENT);
    expect(line(one, 'insurance')).toBe(1000 * INSURANCE_PER_STUDENT);
    // The buildings cost the same whoever is in them.
    expect(group(two, 'buildings')).toBe(group(one, 'buildings'));
  });

  it('staffs a Medical Center or Campus Safety by the students in its circle, and never with fewer than one', () => {
    let state = act(campus(3000), { type: 'place', building: 'medical', x: 14, y: 10 });
    const medical = state.map.placed.find((p) => p?.type === 'medical')!;
    const inCircle = studentsInCircle(state, medical);
    // Every starter lot is within eight cells of it.
    expect(inCircle).toBe(3000);
    expect(careStaffAt(state, medical)).toBe(Math.ceil(3000 / STUDENTS_PER_CARE_STAFF));
    expect(careStaffCount(state)).toBe(careStaffAt(state, medical));
    recomputeRates(state);
    expect(line(budget(state), 'care')).toBe(careStaffAt(state, medical) * CARE_STAFF_PAY);
    // A quiet campus still staffs it.
    const quiet = structuredClone(state);
    quiet.cohorts = [40, 0, 0, 0];
    expect(careStaffAt(quiet, medical)).toBe(1);
    // One with nobody in reach has its one member of staff, and a dining hall has none of this kind.
    state = act(state, { type: 'place', building: 'safety', x: 2, y: 28 });
    const far = state.map.placed.find((p) => p?.type === 'safety')!;
    expect(studentsInCircle(state, far)).toBe(0);
    expect(careStaffAt(state, far)).toBe(1);
    expect(careStaffAt(state, state.map.placed.find((p) => p?.type === 'dining')!)).toBe(0);
  });

  it('pays no safety or medical staff until the first class has arrived', () => {
    // Fifteen minutes before move-in: the buildings stand, and nobody is on their payroll.
    let early = structuredClone(freshGame());
    early.money.cash = 10_000_000;
    early = act(early, { type: 'place', building: 'medical', x: 14, y: 10 });
    early = act(early, { type: 'place', building: 'safety', x: 2, y: 28 });
    const medical = early.map.placed.find((p) => p?.type === 'medical')!;
    expect(firstClassArrived(early)).toBe(false);
    expect(careStaffAt(early, medical)).toBe(0);
    expect(careStaffCount(early)).toBe(0);
    expect(line(budget(early), 'care')).toBe(0);
    expect(placedFacts(early, medical)).toBe('No staff to pay until the first class arrives · Upkeep and utilities $15,000 a year · The Clear tool removes it');
    // Their upkeep and utilities are paid from the day they are built, as any building's are.
    expect(line(budget(early), 'upkeep')).toBeGreaterThan(line(budget(freshGame()), 'upkeep'));

    // The class moves in, and each has its staff from that minute, whoever was let in.
    const before = early.money.spendingPerYear;
    const arrived = advance(early, T0, T0 + 16 * MIN).state;
    expect(firstClassArrived(arrived)).toBe(true);
    expect(careStaffCount(arrived)).toBe(2);
    expect(line(budget(arrived), 'care')).toBe(2 * CARE_STAFF_PAY);
    expect(arrived.money.spendingPerYear).toBeGreaterThan(before + 2 * CARE_STAFF_PAY);
    // And they stay on it through every summer after: it is the first arrival that counts, not who is enrolled.
    const empty = structuredClone(arrived);
    empty.cohorts = [0, 0, 0, 0];
    expect(careStaffCount(empty)).toBe(2);
  });

  it('charges utilities by size, more for a pool and nothing for a pond or a bench', () => {
    expect(utilitiesOf('pool')).toBeGreaterThan(utilitiesOf('gym'));
    expect(utilitiesOf('medical')).toBe(2 * utilitiesOf('gym'));
    expect(utilitiesOf('courts')).toBeLessThan(utilitiesOf('medical'));
    for (const type of ['pondSmall', 'pondLarge', 'bin', 'bench', 'table', 'admin'] as const) expect(utilitiesOf(type)).toBe(0);
    const before = budget(campus(500));
    const after = budget(act(campus(500), { type: 'place', building: 'pool', x: 14, y: 10 }));
    expect(line(after, 'utilities') - line(before, 'utilities')).toBe(utilitiesOf('pool'));
    expect(line(after, 'upkeep') - line(before, 'upkeep')).toBe(PLACED.pool.upkeepPerYear);
    expect(line(before, 'upkeep')).toBe(upkeepPerYear(campus(500)));
  });

  it('pays maintenance workers the wage, counted at each yard', () => {
    let state = act(campus(500), { type: 'place', building: 'yard', x: 6, y: 11 });
    expect(workerCount(state)).toBe(1);
    state = act(state, { type: 'staff', yard: state.map.placed.findIndex((p) => p?.type === 'yard'), workers: 4 });
    expect(workerCount(state)).toBe(4);
    expect(line(budget(state), 'workers')).toBe(4 * WAGE_PER_YEAR);
    // A real cost, in line with the other staff: more than they used to be paid, no more than a member of faculty.
    expect(WAGE_PER_YEAR).toBeGreaterThanOrEqual(STAFF_PAY);
    expect(WAGE_PER_YEAR).toBeLessThanOrEqual(FACULTY_PAY);
    expect(WAGE_PER_YEAR).toBeGreaterThan(5 * LEGACY_WAGE_PER_YEAR);
  });

  it('starts a new campus on full costs, with the opening cash it always had', () => {
    const state = freshGame();
    expect(state.money.cash).toBe(START_CASH);
    expect(START_CASH).toBe(400_000);
    expect(state.money.phase).toBe(PHASE_STEPS);
    expect(state.money.endowment).toBe(0);
    expect(state.money.marketing).toBe(0);
    const week = advance(state, T0, T0 + 8 * DAY);
    expect(week.log.some((entry) => entry.kind === 'costs')).toBe(false);
    expect(budget(week.state).phase).toBeNull();
    expect(validate(week.state)).toBeNull();
  });
});

describe('recruiting and marketing', () => {
  it('has five steps, each lifting applications by less than the one before', () => {
    expect(MARKETING_LIFT).toEqual([0, 0.05, 0.09, 0.12, 0.14]);
    expect(MARKETING_COST_PER_STUDENT.length).toBe(MARKETING_LIFT.length);
    for (let step = 1; step < MARKETING_LIFT.length; step++) {
      const gain = MARKETING_LIFT[step]! - MARKETING_LIFT[step - 1]!;
      expect(gain).toBeGreaterThan(0);
      if (step > 1) expect(gain).toBeLessThan(MARKETING_LIFT[step - 1]! - MARKETING_LIFT[step - 2]! + 1e-9);
      expect(MARKETING_COST_PER_STUDENT[step]!).toBeGreaterThan(MARKETING_COST_PER_STUDENT[step - 1]!);
    }
  });

  it('costs more on a bigger campus and draws a bigger class', () => {
    const off = campus(1000);
    const drawn = fallClassDraw(off);
    for (let step = 1; step < MARKETING_LIFT.length; step++) {
      const on = act(off, { type: 'marketing', step });
      recomputeRates(on);
      expect(marketingLift(on)).toBe(MARKETING_LIFT[step]);
      expect(Math.abs(fallClassDraw(on) - drawn * (1 + MARKETING_LIFT[step]!))).toBeLessThanOrEqual(1);
      expect(line(budget(on), 'marketing')).toBe(1000 * MARKETING_COST_PER_STUDENT[step]!);
      expect(on.money.spendingPerYear - off.money.spendingPerYear).toBe(1000 * MARKETING_COST_PER_STUDENT[step]!);
      const bigger = structuredClone(on);
      bigger.cohorts = [2500, 0, 0, 0];
      expect(line(budget(bigger), 'marketing')).toBe(2500 * MARKETING_COST_PER_STUDENT[step]!);
    }
    expect(line(budget(off), 'marketing')).toBe(0);
    // Turning it off again costs nothing and takes the lift away.
    const back = act(act(off, { type: 'marketing', step: 3 }), { type: 'marketing', step: 0 });
    expect(fallClassDraw(back)).toBe(drawn);
  });

  it('refuses a step that does not exist', () => {
    const state = campus(1000);
    for (const step of [-1, 5, 1.5, Number.NaN]) expect(applyAction(state, { type: 'marketing', step }).ok).toBe(false);
  });
});

describe('the endowment', () => {
  it('takes cash for good and pays a small income every year', () => {
    const state = campus(1000);
    const before = state.money.incomePerYear;
    const paid = act(state, { type: 'endow', amount: 2_000_000 });
    recomputeRates(paid);
    expect(paid.money.cash).toBe(state.money.cash - 2_000_000);
    expect(paid.money.endowment).toBe(2_000_000);
    expect(paid.money.incomePerYear - before).toBeCloseTo(2_000_000 * ENDOWMENT_YIELD, 6);
    expect(budget(paid).income.find((item) => item.id === 'endowment')?.amount).toBeCloseTo(2_000_000 * ENDOWMENT_YIELD, 6);
    expect(budget(state).income.some((item) => item.id === 'endowment')).toBe(false);
    // Paying in is not spending: the year's books do not count it.
    expect(paid.money.yearSpent).toBe(state.money.yearSpent);
    // It is small: fifty years to earn back what was paid.
    expect(ENDOWMENT_YIELD).toBeLessThanOrEqual(0.03);
    // A year on, the campus has earned it, and the endowment itself has not moved.
    const year = advance(paid, T0, T0 + 7 * DAY).state;
    expect(year.money.endowment).toBe(2_000_000);
  });

  it('cannot be paid more than there is, and has no way out', () => {
    const state = campus(1000);
    expect(applyAction(state, { type: 'endow', amount: state.money.cash + 1 }).ok).toBe(false);
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(applyAction(state, { type: 'endow', amount }).ok).toBe(false);
    expect(applyAction(state, { type: 'endow', amount: state.money.cash }).ok).toBe(true);
  });

  it('covers a shortfall before the state does', () => {
    const state = act(campus(1000), { type: 'endow', amount: 500_000 });
    state.money.cash = -200_000;
    const log: LogEntry[] = [];
    dailyCashCheck(state, log);
    expect(state.money.cash).toBe(0);
    expect(state.money.endowment).toBe(300_000);
    expect(state.money.grants).toBe(0);
    expect(log.map((entry) => entry.text)).toEqual(['The endowment covered a shortfall of $200,000.']);
    // When it runs out the state covers the rest, as before.
    state.money.cash = -450_000;
    dailyCashCheck(state, log);
    expect(state.money.endowment).toBe(0);
    expect(state.money.cash).toBe(0);
    expect(state.money.grants).toBe(150_000);
    expect(summarizeAway(log, { minutes: 60, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 }).lines).toEqual(
      expect.arrayContaining(['The endowment covered $500,000 in shortfalls.', 'The state covered $150,000 in shortfalls.']),
    );
  });
});

describe('a save from before these costs', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'save-v8-mature.json'), 'utf8');
  const old = (JSON.parse(text) as { state: GameState; savedAt: number }).state;
  const load = (): GameState => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(8);
    return loaded.state;
  };

  it('loads spending exactly what it spent the day before', () => {
    const state = load();
    expect(state.version).toBe(SAVE_VERSION);
    expect(enrollment(state)).toBeGreaterThan(5000);
    expect(state.money.phase).toBe(0);
    expect(state.money.cash).toBe(old.money.cash);
    recomputeRates(state);
    // Income is what it was, and since play stop 4b the dining halls and coffee stands it already had earn a little.
    expect(foodIncomePerYear(state)).toBeGreaterThan(0);
    expect(foodIncomePerYear(state)).toBeLessThan(old.money.incomePerYear * 0.005);
    // Food and the stores earn by who is on campus that day (4.8): the save was made in the summer term.
    const here = dayRead(state.clock).presence;
    expect(here).toBeLessThan(1);
    expect(state.money.incomePerYear).toBeCloseTo(old.money.incomePerYear + foodIncomePerYear(state) * here - placedIncomePerYear(state) * (1 - here), 6);
    expect(state.money.spendingPerYear).toBe(old.money.spendingPerYear);
    expect(state.money.spendingPerYear).toBe(upkeepPerYear(state) + workerCount(state) * LEGACY_WAGE_PER_YEAR + enrollment(state) * LEGACY_COST_PER_STUDENT_PER_YEAR);
    const b = budget(state);
    expect(b.phase).toEqual({ step: 0, of: PHASE_STEPS, spared: b.fullSpending - b.spending });
    expect(b.fullSpending).toBeGreaterThan(b.spending);
    expect(validate(state)).toBeNull();
  });

  it('climbs to the full costs in seven daily steps, says so each day, and needs no rescue', () => {
    let state = load();
    const start = state.clock.lastSimulatedAt;
    const notes: LogEntry[] = [];
    for (let day = 1; day <= 9; day++) {
      const result = advance(state, state.clock.lastSimulatedAt, start + day * DAY);
      state = result.state;
      const today = result.log.filter((entry) => entry.kind === 'costs');
      notes.push(...today);
      expect(today.length).toBe(day <= PHASE_STEPS ? 1 : 0);
      expect(state.money.phase).toBe(Math.min(PHASE_STEPS, day));
      if (day <= PHASE_STEPS) {
        // Each step is a rise: the same campus a step earlier would be paying less. (From one day to the
        // next the bill can still fall, when a class graduates.)
        expect(Number(today[0]!.data?.step)).toBe(day);
        const stepBack = structuredClone(state);
        stepBack.money.phase = day - 1;
        recomputeRates(stepBack);
        recomputeRates(state);
        expect(state.money.spendingPerYear).toBeGreaterThan(stepBack.money.spendingPerYear);
        expect(Number(today[0]!.data?.full)).toBeGreaterThanOrEqual(Number(today[0]!.data?.spending));
        // The away list carries the latest step, once.
        const away = summarizeAway(result.log, { minutes: 1440, cashBefore: 0, cashAfter: 0, studentsBefore: 0, studentsAfter: 0 });
        expect(away.lines.filter((text) => /Running costs/.test(text))).toEqual([today[0]!.text]);
      }
      expect(state.money.grants).toBe(0);
      expect(state.money.cash).toBeGreaterThan(0);
    }
    expect(notes.length).toBe(PHASE_STEPS);
    expect(notes[2]!.text).toMatch(/Running costs rose a step, 3 of 7: \$[\d,]+ a year now, and about \$[\d,]+ once all 7 are in\./);
    expect(notes[6]!.text).toMatch(/^Running costs have reached their full level/);
    const b = budget(state);
    expect(b.phase).toBeNull();
    expect(state.money.spendingPerYear).toBe(b.fullSpending);
    // The campus still keeps a healthy share of what comes in.
    expect(b.kept).toBeGreaterThan(10);
  });

  it('pays for marketing in full from the day it is turned on, phase-in or not', () => {
    const state = load();
    recomputeRates(state);
    const on = act(state, { type: 'marketing', step: 2 });
    recomputeRates(on);
    expect(on.money.spendingPerYear - state.money.spendingPerYear).toBeCloseTo(enrollment(state) * MARKETING_COST_PER_STUDENT[2]!, 6);
  });

  it('turns out the same in one go or in many small steps', () => {
    const state = load();
    const end = state.clock.lastSimulatedAt + 8 * DAY + 3 * HOUR;
    const once = advance(state, state.clock.lastSimulatedAt, end);
    let stepped = state;
    const log: LogEntry[] = [];
    for (let at = state.clock.lastSimulatedAt + 7 * HOUR + 13 * MIN; at < end; at += 7 * HOUR + 13 * MIN) {
      const result = advance(stepped, stepped.clock.lastSimulatedAt, at);
      stepped = result.state;
      log.push(...result.log);
    }
    const final = advance(stepped, stepped.clock.lastSimulatedAt, end);
    log.push(...final.log);
    expect(final.state.money).toEqual(once.state.money);
    expect(log.filter((entry) => entry.kind === 'costs')).toEqual(once.log.filter((entry) => entry.kind === 'costs'));
  });
});

describe('the Money panel, in words', () => {
  it('leads with how much of every $100 is kept', () => {
    expect(moneyView(campus(0)).lead).toBe('No money comes in until the first class arrives.');
    const healthy = moneyView(campus(1000));
    expect(healthy.lead).toMatch(/^You keep \$\d+ of every \$100 that comes in\.$/);
    expect(healthy.lead).toBe('You keep $' + Math.round(budget(campus(1000)).kept) + ' of every $100 that comes in.');
    // Five students in buildings put up for sixty: the campus runs at a loss, and the panel says by how much.
    const thin = campus(5);
    expect(budget(thin).kept).toBeLessThan(0);
    expect(moneyView(thin).lead).toMatch(/^You spend \$\d+ more than every \$100 that comes in\.$/);
  });

  it('lists income, then spending in groups that open to their lines, largest first', () => {
    const state = act(campus(1000), { type: 'place', building: 'medical', x: 14, y: 10 });
    const view = moneyView(state);
    expect(view.income.map((row) => row.name)).toEqual(['Tuition', 'Room fees', 'Food places']);
    expect(view.income[0]).toEqual({ name: 'Tuition', detail: '1,000 students at $8,200', amount: '$8.2M' });
    expect(view.groups[0]!.name).toBe('Payroll');
    expect(view.groups.map((group) => group.name).sort()).toEqual(['Buildings and utilities', 'Other', 'Payroll']);
    for (const group of view.groups) {
      expect(group.share).toMatch(/^\d+%$/);
      expect(group.lines.length).toBeGreaterThan(0);
    }
    const payroll = view.groups[0]!.lines.map((row) => row.name);
    expect(payroll).toEqual(expect.arrayContaining(['Faculty', 'Staff', 'Safety and medical staff', 'Benefits']));
    expect(view.groups[0]!.lines.find((row) => row.name === 'Faculty')!.detail).toBe('50 members at $58,000, one for every 20 students');
    expect(view.phase).toBeNull();
  });

  it('says what marketing is doing and what the endowment earns, and offers only part of the cash to pay in', () => {
    const state = campus(1000);
    expect(moneyView(state).marketing).toEqual({ step: 0, max: 4, line: 'Off. Each step brings more applications: 5, 9, 12, then 14%.' });
    const on = act(state, { type: 'marketing', step: 2 });
    expect(moneyView(on).marketing.line).toBe('Step 2 of 4 · 9% more applications · $120K a year');
    expect(moneyView(state).endowment.line).toBe('Nothing yet. Cash paid in earns 2% a year for good.');
    // $10M in hand: a tenth and a quarter are offered, never all of it.
    expect(moneyView(state).endowment.payIn).toEqual([1_000_000, 2_500_000]);
    const paid = act(state, { type: 'endow', amount: 2_500_000 });
    expect(moneyView(paid).endowment.line).toBe('$2.5M · earns $50K a year');
    // With almost nothing in hand there is nothing to offer.
    const broke = structuredClone(state);
    broke.money.cash = 30_000;
    expect(moneyView(broke).endowment.payIn).toEqual([]);
  });

  it('says which step of seven an older save has reached and where its spending will settle', () => {
    const text = readFileSync(join(__dirname, 'fixtures', 'save-v8-mature.json'), 'utf8');
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    const later = advance(loaded.state, loaded.state.clock.lastSimulatedAt, loaded.state.clock.lastSimulatedAt + 2 * DAY).state;
    expect(moneyView(later).phase).toMatch(/^New running costs are coming in over 7 days\. This is step 2 of 7: you pay \$\d+M this year, and about \$\d+M once they are all in\.$/);
  });
});

describe('what a building costs to run, on its card', () => {
  it('shows a Medical Center its staff, and every building its upkeep and utilities', () => {
    const state = act(campus(3000), { type: 'place', building: 'medical', x: 14, y: 10 });
    const medical = state.map.placed.find((p) => p?.type === 'medical')!;
    const staff = careStaffAt(state, medical);
    const pay = (staff * CARE_STAFF_PAY * (1 + BENEFITS_SHARE)).toLocaleString('en-US');
    expect(placedFacts(state, medical)).toBe('Staff of ' + staff + ': $' + pay + ' a year with benefits · Upkeep and utilities $15,000 a year · The Clear tool removes it');
    const dining = state.map.placed.find((p) => p?.type === 'dining')!;
    expect(placedFacts(state, dining)).toBe('Upkeep and utilities $9,000 a year · The Clear tool removes it');
    const bin = state.map.placed.find((p) => p?.type === 'bin')!;
    expect(placedFacts(state, bin)).toBe('Costs nothing to run · The Clear tool removes it');
  });

  it('shows a yard what its workers cost with benefits', () => {
    const state = act(campus(500), { type: 'place', building: 'yard', x: 6, y: 11 });
    const yard = state.map.placed.find((p) => p?.type === 'yard')!;
    expect(placedSummary(state, yard)).toMatch(/^1 of 6 workers\. .* Wages and benefits \$62,400 a year\.$/);
  });

  it('says on the Build menu what a building will cost to run before it is bought', () => {
    const cards = buildEntries();
    const line = (name: string): string => cards.find((card) => card.name === name)!.upkeep;
    expect(line('Medical Center')).toBe('Runs at $15K a year. Staff from $55K once students arrive');
    expect(line('Campus Safety')).toBe('Runs at $14K a year. Staff from $55K once students arrive');
    expect(line('Facilities Yard')).toBe('Runs at $3.0K a year, plus $62K a worker');
    expect(line('Gym')).toBe('Runs at $8.0K a year');
    expect(line('Small pond')).toBe('Costs nothing to run');
  });
});
