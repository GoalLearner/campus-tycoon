import { stageSpec } from '../config/buildings';
import { WAGE_PER_YEAR } from '../config/grounds';
import {
  BENEFITS_SHARE,
  CARE_STAFF_PAY,
  CLASS_SIZE,
  ENDOWMENT_YIELD,
  FACULTY_PAY,
  INSURANCE_PER_STUDENT,
  LEGACY_COST_PER_STUDENT_PER_YEAR,
  LEGACY_WAGE_PER_YEAR,
  MARKETING_COST_PER_STUDENT,
  MARKETING_LIFT,
  PHASE_STEPS,
  PROGRAMS_PER_STUDENT,
  ROOM_FEE_PER_BED_PER_YEAR,
  STAFF_PAY,
  STUDENTS_PER_CARE_STAFF,
  STUDENTS_PER_STAFF,
  SUPPLIES_PER_STUDENT,
  TUITION_PER_STUDENT_PER_YEAR,
} from '../config/money';
import { FOOD_INCOME_PER_STUDENT, PLACED, utilitiesOf } from '../config/placed';
import { ROAD_UPKEEP_PER_YEAR } from '../config/town';
import { dollars } from '../format';
import { enrollment, openCapacity, upkeepPerYear } from '../selectors';
import type { GameState, Placed } from '../types';
import { foodIncomePerYear, foodPlaces } from './food';
import { placedIncomePerYear } from './placed';
import { dayRead } from './season';
import { footballBooks, homeGameNow } from './football';
import { ATHLETICS_STAFF_PAY, CONCESSIONS_PER_FAN, GAME_DAY_FOOD, HOME_GAMES_PER_YEAR, TICKET_PRICE } from '../config/football';
import { offCampusNow } from './town';

/**
 * Where the money goes, by what it buys. Every cost follows the size of the
 * campus: people are paid by the students they serve, buildings by their
 * size. Nothing here is a fixed overhead, so a small or untended campus keeps
 * a surplus. See DESIGN.md section 31.
 *
 * All of it is worked out from the state when asked, and only when something
 * changed (`money.ratesDirty`), so catch-up costs nothing extra.
 */

/** Faculty: one for every 20 students, to the nearest whole person, and at least one once anyone is enrolled. */
export function facultyCount(state: GameState): number {
  const students = enrollment(state);
  return students > 0 ? Math.max(1, Math.round(students / CLASS_SIZE)) : 0;
}

/** Staff: admissions, advisors, administration, IT and dining. One for every 40 students. */
export function staffCount(state: GameState): number {
  const students = enrollment(state);
  return students > 0 ? Math.max(1, Math.round(students / STUDENTS_PER_STAFF)) : 0;
}

/** True for a Medical Center or a Campus Safety building: the two whose staff are counted by the students around them. */
export function hasCareStaff(placed: Placed): boolean {
  const family = PLACED[placed.type].family;
  return family === 'medical' || family === 'safety';
}

/** Students inside a building's circle: its share of the campus's lots, times enrollment. */
export function studentsInCircle(state: GameState, placed: Placed): number {
  const map = state.map;
  const lots = map.care.lots;
  if (lots <= 0) return 0;
  const reach = PLACED[placed.type].radius;
  let inside = 0;
  for (let y = Math.max(0, placed.y - reach); y <= Math.min(map.height - 1, placed.y + placed.h - 1 + reach); y++) {
    for (let x = Math.max(0, placed.x - reach); x <= Math.min(map.width - 1, placed.x + placed.w - 1 + reach); x++) {
      if (map.cells[y * map.width + x]!.kind === 'lot') inside += 1;
    }
  }
  return Math.round((enrollment(state) * inside) / lots);
}

/**
 * True once the first class has arrived. Until then a Medical Center or a
 * Campus Safety office has nobody to look after and nobody on its payroll
 * (the owner, 2026-11-11): building one early is not a trap.
 */
export function firstClassArrived(state: GameState): boolean {
  return state.admissions.lastIntake !== null;
}

/**
 * Staff at one Medical Center or Campus Safety building: one for every 800
 * students in its circle, and never fewer than one. None at all before the
 * first class has arrived.
 */
export function careStaffAt(state: GameState, placed: Placed): number {
  if (!hasCareStaff(placed) || !firstClassArrived(state)) return 0;
  return Math.max(1, Math.ceil(studentsInCircle(state, placed) / STUDENTS_PER_CARE_STAFF));
}

/** Every member of safety and medical staff on the campus. */
export function careStaffCount(state: GameState): number {
  let total = 0;
  for (const placed of state.map.placed) if (placed) total += careStaffAt(state, placed);
  return total;
}

/** Every maintenance worker hired, across all yards. */
export function workerCount(state: GameState): number {
  let total = 0;
  for (const placed of state.map.placed) if (placed && placed.type === 'yard') total += state.grounds.workers[placed.id] ?? 0;
  return total;
}

/** Beds with a student in them: the students who do not live in town, as far as there are beds. */
export function occupiedBeds(state: GameState): number {
  return Math.max(0, Math.min(enrollment(state) - offCampusNow(state), openCapacity(state, 'housing')));
}

export type BudgetGroupId = 'payroll' | 'buildings' | 'other';

export interface BudgetLine {
  id: string;
  name: string;
  /** Dollars a game year. */
  amount: number;
  /** The count behind it, in words: "42 faculty at $56,000". */
  detail: string;
}

export interface BudgetGroup {
  id: BudgetGroupId;
  name: string;
  amount: number;
  lines: BudgetLine[];
}

export interface Budget {
  income: BudgetLine[];
  incomeTotal: number;
  /** Largest first. Empty lines are left out. */
  groups: BudgetGroup[];
  /** Every line at its full amount. */
  fullSpending: number;
  /** What is paid this year. Less than the full amount while a save from before these costs is phasing them in. */
  spending: number;
  /** Set while new costs are phasing in: the step out of seven, and what this year is spared. */
  phase: { step: number; of: number; spared: number } | null;
  /** Of every $100 that comes in, how much is kept. It can be below zero. */
  kept: number;
}

const people = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** What the campus would spend under the single flat cost it ran on before play stop 5. */
function legacySpending(state: GameState): number {
  return upkeepPerYear(state) + workerCount(state) * LEGACY_WAGE_PER_YEAR + enrollment(state) * LEGACY_COST_PER_STUDENT_PER_YEAR;
}

/** The whole budget for a game year, at today's enrollment and buildings. */
export function budget(state: GameState): Budget {
  const students = enrollment(state);
  const m = state.money;

  // ---- income
  const income: BudgetLine[] = [];
  const beds = occupiedBeds(state);
  income.push({ id: 'tuition', name: 'Tuition', amount: students * TUITION_PER_STUDENT_PER_YEAR, detail: `${people(students, 'student', 'students')} at ${dollars(TUITION_PER_STUDENT_PER_YEAR)}` });
  income.push({ id: 'rooms', name: 'Room fees', amount: beds * ROOM_FEE_PER_BED_PER_YEAR, detail: `${people(beds, 'bed', 'beds')} in use at ${dollars(ROOM_FEE_PER_BED_PER_YEAR)}` });
  // Food and the stores earn by who is on campus: a quarter of students in a break, fewer in the summer term.
  const day = dayRead(state.clock);
  const away = day.presence < 1 ? ` ${day.name ?? 'This week'}: ${Math.round(day.presence * 100)}% of students are here` : '';
  const stores = placedIncomePerYear(state) * day.presence;
  if (stores > 0) income.push({ id: 'stores', name: 'Campus stores', amount: stores, detail: `More on a busy path.${away}`.replace(/\.$/, '') });
  // A home game day brings the crowd past every food place, from an hour before kickoff to the final whistle.
  const gameDay = homeGameNow(state) !== null;
  const food = foodIncomePerYear(state) * day.presence * (gameDay ? GAME_DAY_FOOD : 1);
  if (food > 0) {
    const places = foodPlaces(state);
    income.push({ id: 'food', name: 'Food places', amount: food, detail: `${people(places, 'place', 'places')} to eat. ${dollars(FOOD_INCOME_PER_STUDENT)} for each student in reach, shared among the places that reach them.${away}${gameDay ? ' Game day: the crowd is in' : ''}`.replace(/\.$/, '') });
  }
  // Football's income: tickets with what the crowd spends, and the TV deal.
  const ball = footballBooks(state);
  if (ball.tickets > 0) {
    income.push({ id: 'tickets', name: 'Football tickets and stands', amount: ball.tickets, detail: `${HOME_GAMES_PER_YEAR} home games a year, ${people(Math.round(ball.crowd), 'fan', 'fans')} a game at ${dollars(TICKET_PRICE[state.football.stadium.price]!)} and ${dollars(CONCESSIONS_PER_FAN)} spent inside` });
  }
  if (ball.tv > 0) income.push({ id: 'tv', name: 'TV and conference deal', amount: ball.tv, detail: `To the end of year ${state.football.tv.until}` });
  if (m.endowment > 0) {
    income.push({ id: 'endowment', name: 'Endowment income', amount: m.endowment * ENDOWMENT_YIELD, detail: `${Math.round(ENDOWMENT_YIELD * 100)}% of ${dollars(m.endowment)}, every year` });
  }
  const incomeTotal = income.reduce((sum, line) => sum + line.amount, 0);

  // ---- payroll
  const faculty = facultyCount(state);
  const staff = staffCount(state);
  const care = careStaffCount(state);
  const workers = workerCount(state);
  const pay = faculty * FACULTY_PAY + staff * STAFF_PAY + care * CARE_STAFF_PAY + workers * WAGE_PER_YEAR + ball.pay;
  const payroll: BudgetLine[] = [
    { id: 'faculty', name: 'Faculty', amount: faculty * FACULTY_PAY, detail: `${people(faculty, 'member', 'members')} at ${dollars(FACULTY_PAY)}, one for every ${CLASS_SIZE} students` },
    { id: 'staff', name: 'Staff', amount: staff * STAFF_PAY, detail: `${people(staff, 'member', 'members')} at ${dollars(STAFF_PAY)}: admissions, advisors, administration, IT and dining` },
    { id: 'care', name: 'Safety and medical staff', amount: care * CARE_STAFF_PAY, detail: `${people(care, 'member', 'members')} at ${dollars(CARE_STAFF_PAY)}, by the students in each building's circle` },
    { id: 'workers', name: 'Maintenance workers', amount: workers * WAGE_PER_YEAR, detail: `${people(workers, 'worker', 'workers')} at ${dollars(WAGE_PER_YEAR)}, hired at each Facilities Yard` },
    { id: 'coaches', name: 'Coaches and athletics staff', amount: ball.pay, detail: ball.pay > 0 ? `${state.football.coach.name} at ${dollars(ball.coach)}${ball.coach < state.football.coach.pay ? ', a share of the going rate at a school this size' : ''}, and ${people(ball.staff, 'member', 'members')} of staff at ${dollars(ATHLETICS_STAFF_PAY)}` : '' },
    { id: 'benefits', name: 'Benefits', amount: pay * BENEFITS_SHARE, detail: `${Math.round(BENEFITS_SHARE * 100)}% on top of all pay` },
  ];

  // ---- buildings and utilities
  let utilities = 0;
  let standing = 0;
  for (const b of state.map.buildings) {
    if (!b || b.stage <= 0) continue;
    utilities += stageSpec(b.zone, b.stage).utilitiesPerYear;
    standing += 1;
  }
  let roads = 0;
  for (const cell of state.map.cells) if (cell.kind === 'road' || cell.kind === 'crossing') roads += 1;
  let placedCount = 0;
  for (const placed of state.map.placed) {
    if (!placed) continue;
    const bill = utilitiesOf(placed.type);
    utilities += bill;
    if (bill > 0 || PLACED[placed.type].upkeepPerYear > 0) placedCount += 1;
  }
  const upkeep = upkeepPerYear(state) + ball.upkeep;
  utilities += ball.utilities;
  const count = standing + placedCount;
  const roadNote = roads > 0 ? ` and ${people(roads, 'cell', 'cells')} of road at ${dollars(ROAD_UPKEEP_PER_YEAR)}` : '';
  const buildings: BudgetLine[] = [
    { id: 'upkeep', name: 'Upkeep and repairs', amount: upkeep, detail: `${people(count, 'building', 'buildings')}${roadNote}` },
    { id: 'utilities', name: 'Utilities', amount: utilities, detail: `${people(count, 'building', 'buildings')}, by size. A pool uses more` },
  ];

  // ---- other
  const step = Math.max(0, Math.min(MARKETING_LIFT.length - 1, m.marketing));
  const marketing = students * MARKETING_COST_PER_STUDENT[step]!;
  const other: BudgetLine[] = [
    { id: 'supplies', name: 'Teaching supplies and the library', amount: students * SUPPLIES_PER_STUDENT, detail: `${dollars(SUPPLIES_PER_STUDENT)} a student` },
    { id: 'programs', name: 'Student programs and events', amount: students * PROGRAMS_PER_STUDENT, detail: `${dollars(PROGRAMS_PER_STUDENT)} a student` },
    { id: 'marketing', name: 'Recruiting and marketing', amount: marketing, detail: step === 0 ? 'Off' : `Step ${step} of ${MARKETING_LIFT.length - 1}: ${dollars(MARKETING_COST_PER_STUDENT[step]!)} a student` },
    { id: 'insurance', name: 'Insurance and legal', amount: students * INSURANCE_PER_STUDENT, detail: `${dollars(INSURANCE_PER_STUDENT)} a student` },
    { id: 'athletics', name: 'Athletics operations', amount: ball.operations, detail: state.football.stadium.tier === 0 ? 'Travel, kit, game days and the rent of a field in town' : 'Travel, kit and game days' },
  ];

  const groups: BudgetGroup[] = [
    { id: 'payroll', name: 'Payroll', amount: 0, lines: payroll },
    { id: 'buildings', name: 'Buildings and utilities', amount: 0, lines: buildings },
    { id: 'other', name: 'Other', amount: 0, lines: other },
  ];
  for (const group of groups) {
    group.lines = group.lines.filter((line) => line.amount > 0).sort((a, b) => b.amount - a.amount);
    group.amount = group.lines.reduce((sum, line) => sum + line.amount, 0);
  }
  groups.sort((a, b) => b.amount - a.amount);
  const fullSpending = groups.reduce((sum, group) => sum + group.amount, 0);

  // A save from before these costs climbs to them in seven daily steps. Marketing is the player's own
  // choice, so it is paid in full from the day it is turned on.
  let spending = fullSpending;
  let phase: Budget['phase'] = null;
  if (m.phase < PHASE_STEPS) {
    const was = legacySpending(state);
    const full = fullSpending - marketing;
    spending = was + ((full - was) * m.phase) / PHASE_STEPS + marketing;
    phase = { step: m.phase, of: PHASE_STEPS, spared: fullSpending - spending };
  }
  const kept = incomeTotal > 0 ? (100 * (incomeTotal - spending)) / incomeTotal : 0;
  return { income, incomeTotal, groups: groups.filter((group) => group.amount > 0), fullSpending, spending, phase, kept };
}

/** How much recruiting and marketing lifts applications at the step the player has set: 0, 5, 9, 12 or 14 in a hundred. */
export function marketingLift(state: GameState): number {
  return MARKETING_LIFT[Math.max(0, Math.min(MARKETING_LIFT.length - 1, state.money.marketing))]!;
}
