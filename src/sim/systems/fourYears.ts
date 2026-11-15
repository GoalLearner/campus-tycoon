import { ABROAD_PLACES, ABROAD_SEMESTER, BY_SENIOR_YEAR, CAPSTONE_NAME, FINALS_PACKAGES, GRAD_ADMIT_FROM, GRAD_SCHOOL, INTERN_EARLY, INTERN_PLACES, OFFER_BY_COMMENCEMENT, OFFERS_IN_FALL, ON_CAMPUS_BY_YEAR, OUTCOME_TILT, PRACTICE_TILT, type Practice } from '../config/fourYears';
import { calendarAt, dateAt, type Phase } from '../calendar';
import { dayOfYear } from './birthdays';
import { MAJORS, type MajorGroup } from '../config/students';
import { hashInts } from '../rng';
import { headCount } from '../format';
import type { Clock, GameState, LogEntry } from '../types';

/**
 * Four years, R2 of the realism pass (DESIGN.md 66), as the simulation tells it. Who lives where is each student's own
 * draw against their class year's share (`studentHome`); the campus's beds and its places in town are counted as
 * before, so nothing here changes a number the balance reads.
 */

/**
 * Moving off campus (DESIGN.md 66.3): each fall, once the new class is in, the returning students who left the halls
 * for town, at the real pattern. Told in the paper; nothing is saved. Returns how many.
 */
export function tellMovingOut(state: GameState, log: LogEntry[]): number {
  let moved = 0;
  for (let classYear = 1; classYear < state.cohorts.length; classYear++) {
    moved += state.cohorts[classYear]! * Math.max(0, ON_CAMPUS_BY_YEAR[classYear - 1]! - ON_CAMPUS_BY_YEAR[classYear]!);
  }
  moved = Math.round(moved);
  if (moved > 0) {
    log.push({ tick: state.clock.tick, kind: 'housing', text: `About ${headCount(moved)} returning students moved off campus into town this fall, most of them juniors; nearly every first-year has a room in a hall.`, data: { moved } });
  }
  return moved;
}

// ------------------------------------------------- the milestones of four years --

/** How often a field's students do a practice: its tilt, scaled so the campus as a whole lands on the real share. */
function chanceOf(practice: Practice, group: MajorGroup): number {
  const total = MAJORS.reduce((sum, major) => sum + major.share, 0);
  const meanTilt = MAJORS.reduce((sum, major) => sum + major.share * PRACTICE_TILT[major.group][practice], 0) / total;
  return Math.min(0.95, (BY_SENIOR_YEAR[practice] * PRACTICE_TILT[group][practice]) / meanTilt);
}

/** Of seniors, the share who did each practice, over the campus's majors: the real figures, by construction. */
export function practiceShares(): Record<Practice, number> {
  const total = MAJORS.reduce((sum, major) => sum + major.share, 0);
  const out = {} as Record<Practice, number>;
  for (const practice of Object.keys(BY_SENIOR_YEAR) as Practice[]) out[practice] = MAJORS.reduce((sum, major) => sum + major.share * chanceOf(practice, major.group), 0) / total;
  return out;
}

export interface Practices {
  /** What the card says, the newest first: "Interning at a hospital this summer", "Studied abroad in Spain". */
  lines: string[];
  /** Away from campus now: a semester abroad. */
  away: boolean;
  /** Now: an internship this summer, abroad for the summer, research this term, senior work this year. */
  interning: boolean;
  abroad: boolean;
  researching: boolean;
  capstone: boolean;
  /** Done or doing by now. */
  did: Record<Practice, boolean>;
}

/**
 * A student's milestones of four years (DESIGN.md 66.4), from their own draws, their field and where the year is. An
 * internship the summer after the second or third year, study abroad for a summer or the spring of the third year,
 * research with a professor from the third or fourth year, and senior work in the last year.
 */
export function practicesOf(seed: number, ref: { entryYear: number; index: number }, classYear: number, group: MajorGroup, phase: Phase): Practices {
  const roll = (salt: number): number => (hashInts(seed, 4823, ref.entryYear, ref.index, salt) >>> 0) / 4294967296;
  const term = phase === 'fall' || phase === 'spring';
  const summerAfter = (year: number): boolean => classYear === year && (phase === 'graduation' || phase === 'summer');
  const after = (year: number): boolean => classYear > year;
  const lines: string[] = [];
  const out: Practices = { lines, away: false, interning: false, abroad: false, researching: false, capstone: false, did: { internship: false, research: false, capstone: false, abroad: false } };

  if (roll(1) < chanceOf('capstone', group) && classYear >= 3) {
    const name = CAPSTONE_NAME[group];
    if (term) {
      out.capstone = true;
      lines.push(`Working on ${name}`);
    } else lines.push(`Finished ${name}`);
    out.did.capstone = true;
  }
  if (roll(2) < chanceOf('internship', group)) {
    const year = roll(3) < INTERN_EARLY ? 1 : 2;
    const place = INTERN_PLACES[group][Math.floor(roll(4) * INTERN_PLACES[group].length)]!;
    if (summerAfter(year)) {
      out.interning = true;
      lines.push(`Interning at ${place} this summer`);
    } else if (after(year)) lines.push(`Interned at ${place}`);
    out.did.internship = out.interning || after(year);
  }
  if (roll(5) < chanceOf('research', group)) {
    const from = roll(6) < 0.5 ? 2 : 3;
    if (classYear >= from) {
      out.researching = term;
      lines.push(term ? 'Doing research with a professor' : 'Did research with a professor');
      out.did.research = true;
    }
  }
  if (roll(7) < chanceOf('abroad', group)) {
    const place = ABROAD_PLACES[Math.floor(roll(8) * ABROAD_PLACES.length)]!;
    if (roll(9) < ABROAD_SEMESTER) {
      if (classYear === 2 && phase === 'spring') {
        out.away = true;
        out.abroad = true;
        lines.push(`Studying abroad in ${place} this semester`);
      } else if (after(2) || summerAfter(2)) lines.push(`Studied abroad in ${place}`);
      out.did.abroad = out.away || after(2) || summerAfter(2);
    } else {
      const year = roll(10) < 0.5 ? 1 : 2;
      if (summerAfter(year)) {
        out.abroad = true;
        lines.push(`Studying abroad in ${place} this summer`);
      } else if (after(year)) lines.push(`Studied abroad in ${place}`);
      out.did.abroad = out.abroad || after(year);
    }
  }
  return out;
}

/**
 * The paper's lines for the milestones (DESIGN.md 66.4): at the spring's start, how many third-years are abroad for the
 * semester; at the summer's start, how many begin internships and how many go abroad for the summer. Counted at the
 * shares each student's draws come to.
 */
export function tellPractices(state: GameState, entryId: string, log: LogEntry[]): void {
  // Finals week: care packages from home (DESIGN.md 66.6).
  if (entryId === 'fallFinals' || entryId === 'springFinals') {
    const packages = Math.round(state.cohorts.reduce((sum, n) => sum + n, 0) * FINALS_PACKAGES);
    if (packages > 0) log.push({ tick: state.clock.tick, kind: 'milestones', text: `Care packages from home pour into the mail room for finals: about ${headCount(packages)} this week.`, data: { packages } });
  }
  const c = state.cohorts;
  const abroad = BY_SENIOR_YEAR.abroad;
  const intern = BY_SENIOR_YEAR.internship;
  if (entryId === 'springStart') {
    const away = Math.round(c[2]! * abroad * ABROAD_SEMESTER);
    if (away > 0) log.push({ tick: state.clock.tick, kind: 'milestones', text: `${headCount(away)} ${away === 1 ? 'third-year is' : 'third-years are'} spending the spring semester abroad, most in Europe.`, data: { abroad: away } });
  }
  if (entryId === 'summerStart') {
    const interns = Math.round(c[1]! * intern * INTERN_EARLY + c[2]! * intern * (1 - INTERN_EARLY));
    const summer = Math.round((c[1]! + c[2]!) * abroad * (1 - ABROAD_SEMESTER) * 0.5);
    if (interns > 0) log.push({ tick: state.clock.tick, kind: 'milestones', text: `${headCount(interns)} ${interns === 1 ? 'student starts a summer internship' : 'students start summer internships'}${summer > 0 ? `, and ${headCount(summer)} ${summer === 1 ? 'goes' : 'go'} abroad for the summer` : ''}.`, data: { interns, abroad: summer } });
  }
}

// ---------------------------------------------------------- after four years --

/** A field's share of a practice-like figure, scaled so the class as a whole lands on the real one. */
function outcomeChance(kind: 'offer' | 'grad', group: MajorGroup): number {
  const total = MAJORS.reduce((sum, major) => sum + major.share, 0);
  const mean = MAJORS.reduce((sum, major) => sum + major.share * OUTCOME_TILT[major.group][kind], 0) / total;
  const base = kind === 'grad' ? GRAD_SCHOOL : OFFER_BY_COMMENCEMENT / (1 - GRAD_SCHOOL);
  return Math.min(0.95, (base * OUTCOME_TILT[group][kind]) / mean);
}

export interface Outcome {
  plan: 'grad' | 'job';
  /** A job offer by now, and where from. */
  offer: string | null;
  /** Their offer came in the last few days: the card and the map make something of it. */
  offerNew: boolean;
  /** Into graduate school by now. */
  admitted: boolean;
  /** What the card says: "Job hunting", "Has a job offer from an engineering firm", "Into a graduate program". */
  line: string;
}

/**
 * A senior's last year (DESIGN.md 66.5): applying to graduate school, or job hunting with an offer that comes some
 * time from October to May, or not by commencement. Only a student in their last years; null for the rest.
 */
export function outcomeOf(seed: number, ref: { entryYear: number; index: number }, classYear: number, group: MajorGroup, clock: Pick<Clock, 'tick' | 'week'>): Outcome | null {
  if (classYear < 3) return null;
  const roll = (salt: number): number => (hashInts(seed, 4831, ref.entryYear, ref.index, salt) >>> 0) / 4294967296;
  const date = dateAt(clock);
  const phase = calendarAt(clock).phase;
  // Past commencement it is done: the senior who is still here is staying on for another year.
  const today = phase === 'summer' ? 365 : dayOfYear(date.month, date.day);
  if (roll(1) < outcomeChance('grad', group)) {
    const admitted = today >= dayOfYear(GRAD_ADMIT_FROM[0], GRAD_ADMIT_FROM[1]);
    return { plan: 'grad', offer: null, offerNew: false, admitted, line: admitted ? 'Into a graduate program for the fall' : 'Applying to graduate school' };
  }
  const place = INTERN_PLACES[group][Math.floor(roll(2) * INTERN_PLACES[group].length)]!;
  let offer: string | null = null;
  let offerNew = false;
  if (roll(3) < outcomeChance('offer', group)) {
    // October to the end of the fall, or January to commencement.
    const fall = roll(4) < OFFERS_IN_FALL;
    const [from, to] = fall ? [dayOfYear(10, 1), dayOfYear(12, 17)] : [dayOfYear(1, 19), dayOfYear(5, 12)];
    const at = from + Math.floor(roll(5) * (to - from));
    if (today >= at) {
      offer = place;
      offerNew = today - at <= 6;
    }
  }
  const started = today >= dayOfYear(9, 15);
  return { plan: 'job', offer, offerNew, admitted: false, line: offer ? `Has a job offer from ${offer}` : started ? 'Job hunting' : 'Starting to look for jobs' };
}
