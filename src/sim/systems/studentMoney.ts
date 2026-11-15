import { calendarAt, dateAt } from '../calendar';
import { NATURE_WEIGHTS, MAJORS, type ArchetypeId, type MajorGroup } from '../config/students';
import {
  AFTER_SPRING_BREAK,
  AID_SHARE,
  BORROWED_BY_GRADUATION,
  CAMPUS_JOBS,
  CAMPUS_JOBS_TIMES,
  GRANT_RANGE,
  HOURS_20_PLUS,
  HOURS_UNDER_20,
  LOAN_LIMIT_BY_YEAR,
  LOAN_TIMES,
  ON_CAMPUS_SHARE,
  RENT_PER_BED_MONTH,
  RENT_SPREAD,
  RUNNING_SHORT,
  SHORT_EASE,
  SPRING_TRIP,
  TEXTBOOK_TILT,
  TEXTBOOKS_PER_YEAR,
  TOWN_JOBS,
  WORKING,
  WORKING_20_PLUS,
} from '../config/studentMoney';
import { hashInts } from '../rng';
import { headCount } from '../format';
import type { Clock, GameState, LogEntry } from '../types';
import { policyOn } from './policies';

/**
 * A student's own money, R3 of the realism pass (DESIGN.md 67): their aid package, their loans so far, a job and its
 * hours, rent if they live in town, what their books cost this year, and whether they are running short this month.
 * All of it is draws from the seed against shares that land the campus on the real figures; nothing is saved, and
 * nothing here moves a number the balance reads.
 */

export interface StudentMoney {
  /** This year's aid, in dollars: 0 for none. */
  grant: number;
  loan: number;
  workStudy: boolean;
  /** Loans so far, this year's included; and what they will have borrowed by the end of a fourth year. */
  owes: number;
  owesAtFour: number;
  /** A job this term, or null: where, and hours a week. */
  job: { where: string; hours: number; onCampus: boolean } | null;
  /** The job they hold in term, whether or not term is on now. */
  work: { where: string; hours: number; onCampus: boolean } | null;
  /** Rent a month for a bed in town, or null for a student in a hall or living with family. */
  rent: number | null;
  /** Books and course materials for this year. */
  textbooks: number;
  /** Running short of money this month. */
  short: boolean;
  /** Spring break: saving for a trip before it, or back from one after it, money tight. null otherwise. */
  springTrip: 'saving' | 'back' | null;
  /** What the card says, most telling first. */
  lines: string[];
}

const SALT = 6721;
const unit = (seed: number, ref: { entryYear: number; index: number }, salt: number): number => (hashInts(seed, SALT, ref.entryYear, ref.index, salt) >>> 0) / 4294967296;
const lerp = (range: readonly [number, number], at: number): number => range[0] + (range[1] - range[0]) * at;
const round = (value: number, step: number): number => Math.round(value / step) * step;
const money = (value: number): string => `$${value.toLocaleString('en-US')}`;

/** The share of a borrower's years after the first in which they borrow again: so 44% borrow in any one year. */
const BORROW_AGAIN = (4 * AID_SHARE.loan) / BORROWED_BY_GRADUATION / 3 - 1 / 3;
/** Of those with a grant, the share on work-study; of those not on work-study, the share with a job of their own. */
const WORK_STUDY_OF_GRANTED = AID_SHARE.workStudy / AID_SHARE.grant;
const WORKING_OTHERWISE = (WORKING - AID_SHARE.workStudy) / (1 - AID_SHARE.workStudy);
/** Of those with a job of their own, the share working 20 hours or more: work-study is always under 20. */
const LONG_HOURS = WORKING_20_PLUS / (WORKING - AID_SHARE.workStudy);

/** Books cost by field, scaled so the campus averages the real figure. */
const textbookMean = (): number => {
  const total = MAJORS.reduce((sum, major) => sum + major.share, 0);
  return MAJORS.reduce((sum, major) => sum + major.share * TEXTBOOK_TILT[major.group], 0) / total;
};
const TEXTBOOK_MEAN = textbookMean();

/** A Broke Student runs short most of all: this many times as often, scaled so the campus lands on the real share. */
const BROKE_TIMES = 2.5;
const brokeShare = (): number => {
  const total = NATURE_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  return (NATURE_WEIGHTS.find(([id]) => id === 'broke')?.[1] ?? 0) / total;
};
const SHORT_MEAN = 1 + (BROKE_TIMES - 1) * brokeShare();

/** How each policy that helps eases running short, together (DESIGN.md 67.3). */
export function shortEase(state: GameState): number {
  let times = 1;
  if (policyOn(state, 'campusJobs')) times *= SHORT_EASE.campusJobs;
  if (policyOn(state, 'needScholarships')) times *= SHORT_EASE.needScholarships;
  return times;
}

/** A student's chance of running short in a month, before the policies. */
export function shortChance(nature: ArchetypeId): number {
  return (RUNNING_SHORT * (nature === 'broke' ? BROKE_TIMES : 1)) / SHORT_MEAN;
}

/** The month a clock is in, counted from the game's start: running short is drawn once a month. */
function monthOf(clock: Clock): number {
  const date = dateAt(clock);
  return calendarAt(clock).year * 12 + date.month;
}

/** Spring break's dates: the trip is saved for over the month before, and felt for the two weeks after. */
function springTripNow(clock: Clock): 'saving' | 'back' | null {
  const date = dateAt(clock);
  const day = date.month * 31 + date.day;
  if (day >= 2 * 31 + 14 && day < 3 * 31 + 15) return 'saving';
  if (day >= 3 * 31 + 20 && day < 4 * 31 + 4) return 'back';
  return null;
}

export interface MoneyFacts {
  nature: ArchetypeId;
  group: MajorGroup;
  /** In a hall, a chapter house, in town on their own, or at home with family. */
  inTown: boolean;
  atHome: boolean;
  /** A student who is away for the semester (abroad) or the term is out: no job shifts, no textbooks to buy. */
  term: boolean;
}

/** A student's money now (DESIGN.md 67.2 to 67.4). `classYear` 0 for a first-year, 4 and 5 for the extra years. */
export function moneyOf(state: GameState, ref: { entryYear: number; index: number }, classYear: number, facts: MoneyFacts): StudentMoney {
  const seed = state.seed;
  const roll = (salt: number): number => unit(seed, ref, salt);
  const lines: string[] = [];

  // Need is their own: the higher, the bigger a grant and the likelier work-study.
  const need = roll(1);
  const granted = need >= 1 - AID_SHARE.grant;
  const grant = granted ? round(lerp(GRANT_RANGE, (need - (1 - AID_SHARE.grant)) / AID_SHARE.grant) * lerp([0.9, 1.1], roll(2)), 50) : 0;
  const workStudy = granted && roll(3) < WORK_STUDY_OF_GRANTED;

  // Loans: a borrower borrows in the first year and in most years after; at the federal limit for the year, times their own.
  const borrower = roll(4) < BORROWED_BY_GRADUATION;
  const times = lerp(LOAN_TIMES, roll(5));
  const loanIn = (year: number): number => {
    if (!borrower) return 0;
    if (year > 0 && roll(10 + year) >= BORROW_AGAIN) return 0;
    return round(LOAN_LIMIT_BY_YEAR[Math.min(year, LOAN_LIMIT_BY_YEAR.length - 1)]! * times, 50);
  };
  const year = Math.max(0, classYear);
  const loan = loanIn(year);
  let owes = 0;
  for (let y = 0; y <= year; y++) owes += loanIn(y);
  let owesAtFour = 0;
  for (let y = 0; y < 4; y++) owesAtFour += loanIn(y);

  // A job: work-study on campus, or one of their own, on campus or in town; the Campus jobs program puts more on campus.
  let work: StudentMoney['job'] = null;
  if (workStudy) work = { where: CAMPUS_JOBS[Math.floor(roll(20) * CAMPUS_JOBS.length)]!, hours: Math.round(lerp([8, 15], roll(21))), onCampus: true };
  else if (roll(22) < WORKING_OTHERWISE) {
    const long = roll(23) < LONG_HOURS;
    const hours = Math.round(lerp(long ? HOURS_20_PLUS : HOURS_UNDER_20, roll(24)));
    const onCampus = roll(25) < Math.min(0.95, ON_CAMPUS_SHARE * (policyOn(state, 'campusJobs') ? CAMPUS_JOBS_TIMES : 1));
    const list = onCampus ? CAMPUS_JOBS : TOWN_JOBS;
    work = { where: list[Math.floor(roll(26) * list.length)]!, hours, onCampus };
  }
  // Shifts are worked in term; out of it the job waits for them.
  const job = facts.term ? work : null;

  const rent = facts.inTown && !facts.atHome ? round(RENT_PER_BED_MONTH * lerp(RENT_SPREAD, roll(30)), 5) : null;
  const textbooks = round((TEXTBOOKS_PER_YEAR * TEXTBOOK_TILT[facts.group] * lerp([0.55, 1.45], roll(31))) / TEXTBOOK_MEAN, 5);

  // Running short: a tight budget for some, short in about half of their months; the policies ease it; a spring trip
  // empties the account for a couple of weeks.
  const trip = roll(40) < SPRING_TRIP ? springTripNow(state.clock) : null;
  const chance = shortChance(facts.nature) * shortEase(state) * (trip === 'back' ? AFTER_SPRING_BREAK : 1);
  const tight = roll(41) < Math.min(1, 2 * chance);
  const short = tight && (hashInts(seed, SALT + 1, ref.entryYear, ref.index, monthOf(state.clock)) >>> 0) / 4294967296 < Math.min(1, chance / Math.min(1, 2 * chance));

  if (short) lines.push(trip === 'back' ? 'Back from a spring break trip, and running short until payday' : 'Running short of money this month');
  else if (trip === 'saving') lines.push('Saving up for a spring break trip');
  else if (trip === 'back') lines.push('Back from a spring break trip');
  if (job) lines.push(workStudy ? `Work-study, ${job.hours} hours a week at ${job.where}` : `Works ${job.hours} hours a week at ${job.where}`);
  const aid: string[] = [];
  if (grant > 0) aid.push(`a ${money(grant)} grant`);
  if (loan > 0) aid.push(`a ${money(loan)} loan`);
  if (workStudy) aid.push('work-study');
  lines.push(aid.length > 0 ? `Aid this year: ${aid.length === 1 ? aid[0] : `${aid.slice(0, -1).join(', ')} and ${aid[aid.length - 1]}`}` : 'No aid this year: their family and savings pay');
  if (classYear >= 3 && owes > 0) lines.push(`Will graduate owing about ${money(round(Math.max(owes, owesAtFour), 100))}`);
  else if (owes > 0) lines.push(`Owes ${money(owes)} in loans so far`);
  if (rent !== null) lines.push(`Rent ${money(rent)} a month in town`);
  if (facts.term) lines.push(`Books and course materials: ${money(textbooks)} this year`);
  return { grant, loan, workStudy, owes, owesAtFour, job, work, rent, textbooks, short, springTrip: trip, lines };
}

/** Of borrowers who finish in four years, what they owe on average: the real figure, by construction (for the tests). */
export function debtAverageAtFour(): number {
  const mean = (LOAN_TIMES[0] + LOAN_TIMES[1]) / 2;
  return mean * (LOAN_LIMIT_BY_YEAR[0]! + BORROW_AGAIN * (LOAN_LIMIT_BY_YEAR[1]! + LOAN_LIMIT_BY_YEAR[2]! + LOAN_LIMIT_BY_YEAR[3]!));
}

/** True while the year's term is on: books are bought and shifts are worked. */
export function termNow(clock: Clock): boolean {
  const phase = calendarAt(clock).phase;
  return phase === 'fall' || phase === 'spring';
}

// ------------------------------------------------------------- the campus --

export interface MoneyFigures {
  /** Shares of all students: a grant, a federal loan, work-study; a job, 20 hours or more; running short this month. */
  grant: number;
  loan: number;
  workStudy: number;
  working: number;
  longHours: number;
  /** Of jobs that are not work-study, the share on campus. */
  onCampus: number;
  short: number;
  /** Of a class at commencement: the share who borrowed, and what the borrowers owe on average. */
  borrowed: number;
  debt: number;
  rent: number;
  textbooks: number;
}

/**
 * The campus's money figures (DESIGN.md 67.3), for the Social tab and the long run: what each student's draws come to
 * across the campus, worked out from the shares themselves, so no sample is needed. Running short follows the
 * policies, and the weeks after spring break.
 */
export function moneyFigures(state: GameState): MoneyFigures {
  const trip = springTripNow(state.clock) === 'back' ? SPRING_TRIP * (AFTER_SPRING_BREAK - 1) : 0;
  return {
    grant: AID_SHARE.grant,
    loan: AID_SHARE.loan,
    workStudy: AID_SHARE.workStudy,
    working: WORKING,
    longHours: WORKING_20_PLUS,
    onCampus: Math.min(0.95, ON_CAMPUS_SHARE * (policyOn(state, 'campusJobs') ? CAMPUS_JOBS_TIMES : 1)),
    short: Math.min(1, RUNNING_SHORT * shortEase(state) * (1 + trip)),
    borrowed: BORROWED_BY_GRADUATION,
    debt: round(debtAverageAtFour(), 100),
    rent: RENT_PER_BED_MONTH,
    textbooks: TEXTBOOKS_PER_YEAR,
  };
}

/** What the class leaves owing, for commencement's line in the paper (DESIGN.md 67.2). */
export function debtWords(): string {
  return `About ${Math.round(BORROWED_BY_GRADUATION * 100)}% of them borrowed for college, and those who did leave owing about ${money(round(debtAverageAtFour(), 100))} on average.`;
}

/**
 * Spring break (DESIGN.md 67.3): who heads off on a trip and who stays, told in the paper as it begins. Returns how many
 * went on a trip.
 */
export function tellSpringBreak(state: GameState, log: LogEntry[]): number {
  let students = 0;
  for (const n of state.cohorts) students += n;
  const trips = Math.round(students * SPRING_TRIP);
  if (trips > 0) {
    log.push({
      tick: state.clock.tick,
      kind: 'milestones',
      text: `Spring break: about ${headCount(trips)} students head off on trips they saved for since February; the rest go home, stay on campus, or pick up extra shifts. Some come back running short until payday.`,
      data: { springTrips: trips },
    });
  }
  return trips;
}
