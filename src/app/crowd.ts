import type { DayPeriod } from './daylight';

/**
 * How many people the map shows. All of it is for show: none of these numbers
 * is saved with the game, none is read by the simulation, and nothing here
 * runs while the game is closed. The simulation decides how many students
 * there are. This only decides how many of them are drawn walking about.
 *
 * The player picks a ceiling, Low, Normal or High. The map then holds a frame
 * budget by itself: when frames drop it steps the crowd down a level, as far
 * as a sparse one below Low, and steps back up when they recover. The setting
 * is the most it will show, not a promise. See DESIGN.md section 28.
 */

export type Crowd = 'low' | 'normal' | 'high';
export const CROWDS: readonly Crowd[] = ['low', 'normal', 'high'];
export const CROWD_NAMES: Record<Crowd, string> = { low: 'Low', normal: 'Normal', high: 'High' };
export const DEFAULT_CROWD: Crowd = 'normal';

/**
 * What the map may show at each step. Step 0 is the sparse crowd it falls
 * back to on a slow device; steps 1 to 3 are Low, Normal and High.
 *
 * - inView: the most walkers wanted on screen.
 * - alive: the most walkers kept at once, on screen or just off it.
 * - density: how full the paths get against the crowd of before, which is Low.
 * - extras: the most players, runners, swimmers and people at benches on screen.
 * - traffic: how much of the cars, the shuttle and the trucks is shown.
 */
export interface CrowdStep {
  inView: number;
  alive: number;
  density: number;
  extras: number;
  traffic: number;
}

export const CROWD_STEPS: readonly CrowdStep[] = [
  { inView: 32, alive: 48, density: 0.6, extras: 16, traffic: 0.5 },
  { inView: 64, alive: 90, density: 1, extras: 36, traffic: 1 },
  { inView: 120, alive: 170, density: 1.9, extras: 70, traffic: 1.4 },
  { inView: 190, alive: 260, density: 3, extras: 110, traffic: 1.8 },
];

/** The step a setting stands for: Low is 1, Normal 2, High 3. */
export function stepOf(crowd: Crowd): number {
  return CROWDS.indexOf(crowd) + 1;
}

/**
 * How busy the paths are in each part of the player's day, against a steady
 * afternoon. Night is quiet but never empty: a few people are always about,
 * so someone who only ever plays at night still finds a campus with people.
 */
export const BUSY: Record<DayPeriod, number> = { morning: 1.35, afternoon: 1, evening: 0.8, night: 0.3 };
/** A weekend in the game's own calendar is quieter on the paths. */
export const WEEKEND_BUSY = 0.65;
/** A campus with buildings is never quite empty: staff and faculty. */
export const MIN_IN_VIEW = 4;
/** Path cells per student sample: lower means a busier campus. */
const STUDENTS_PER_PATH_CELL = 9;
const MIN_DENSITY = 0.07;
const MAX_DENSITY = 0.5;

export interface CrowdFacts {
  /** Students enrolled. */
  students: number;
  /** Path cells on the whole map, and those on screen now. Zooming out shows more of them. */
  pathCells: number;
  visiblePathCells: number;
  period: DayPeriod;
  /** Saturday or Sunday in the game's calendar. */
  weekend: boolean;
  /** 0 to 3: see CROWD_STEPS. */
  step: number;
}

/**
 * Walkers wanted on screen: more with more students, with more of the campus
 * in view, in the morning rush, and at a higher crowd setting. Never more
 * than the step allows.
 */
export function walkersWanted(facts: CrowdFacts): number {
  const step = CROWD_STEPS[Math.max(0, Math.min(CROWD_STEPS.length - 1, Math.round(facts.step)))]!;
  if (facts.pathCells <= 0 || facts.visiblePathCells <= 0) return 0;
  const perCell = Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, facts.students / (facts.pathCells * STUDENTS_PER_PATH_CELL)));
  const busy = BUSY[facts.period] * (facts.weekend ? WEEKEND_BUSY : 1);
  const wanted = Math.round(facts.visiblePathCells * perCell * step.density * busy);
  return Math.max(Math.min(MIN_IN_VIEW, facts.visiblePathCells), Math.min(step.inView, wanted));
}

/** How much of a recreation building's peak crowd is there at each part of the day. Afternoons and evenings are busiest. */
export const PLAY_NOW: Record<DayPeriod, number> = { morning: 0.35, afternoon: 1, evening: 0.9, night: 0.06 };

/**
 * Who is at a recreation building right now, for show: the simulation's peak
 * demand scaled by the part of the day. The simulation's own numbers are for
 * the peak and never read the clock.
 */
export function playingNow(demandAtPeak: number, capacity: number, period: DayPeriod): { playing: number; waiting: number } {
  const here = Math.round(Math.max(0, demandAtPeak) * PLAY_NOW[period]);
  return { playing: Math.min(capacity, here), waiting: Math.max(0, here - capacity) };
}

/**
 * When each kind of food is busy, against its own busiest part of the day
 * (DESIGN.md 30.2): coffee in the morning, burgers and tacos at lunch, pizza
 * in the evening and at night, the diner at night. This is seen and never
 * counted: what a place feeds and earns is the same at every hour.
 */
export const MEAL_NOW: Record<string, Record<DayPeriod, number>> = {
  dining: { morning: 0.7, afternoon: 1, evening: 0.9, night: 0.1 },
  foodcourt: { morning: 0.4, afternoon: 1, evening: 0.9, night: 0.15 },
  diner: { morning: 0.6, afternoon: 0.3, evening: 0.6, night: 1 },
  burger: { morning: 0.1, afternoon: 1, evening: 0.6, night: 0.2 },
  pizza: { morning: 0.05, afternoon: 0.4, evening: 1, night: 0.9 },
  taco: { morning: 0.1, afternoon: 1, evening: 0.5, night: 0.15 },
  coffee: { morning: 1, afternoon: 0.6, evening: 0.3, night: 0.05 },
  smoothie: { morning: 0.5, afternoon: 1, evening: 0.5, night: 0 },
  convenience: { morning: 0.3, afternoon: 0.5, evening: 0.8, night: 1 },
  truck: { morning: 0.2, afternoon: 1, evening: 0.6, night: 0.1 },
};
/** Of the students a place has to itself, one in this many is in its line at its busiest. */
export const STUDENTS_PER_QUEUER = 40;
/** The longest line drawn at a place to eat, however many it serves. */
export const QUEUE_SHOWN = 6;

/** How busy a kind of food is now, from 0 to 1. A kind with no entry is steady all day. */
export function mealNow(kind: string, period: DayPeriod): number {
  return MEAL_NOW[kind]?.[period] ?? 0.6;
}

/**
 * How many are queuing at a place to eat right now, for show: the students it
 * has to itself, by how busy its kind of food is at this part of the day. A
 * place with anyone to serve has somebody at it when it is busy.
 */
export function queueNow(students: number, kind: string, period: DayPeriod): number {
  if (!(students > 0)) return 0;
  const busy = mealNow(kind, period);
  const line = Math.round((students / STUDENTS_PER_QUEUER) * busy);
  return Math.min(QUEUE_SHOWN, Math.max(busy >= 0.5 ? 1 : 0, line));
}

/**
 * People who are not students (DESIGN.md section 32.2): professors, staff and
 * visitors. Students stay most of the crowd: everyone else together is never
 * more than this share of the people on screen, at any hour and any setting.
 */
export const OTHERS_SHARE = 0.25;
/**
 * A professor or a member of staff is seen this many times more often than
 * their numbers alone would give. One in twenty people on a real campus is
 * faculty, and at that rate a phone screen would rarely show one.
 */
export const OTHERS_SEEN_MORE = 2.5;
/** How much of the working day it is: staff by day, a few in the evening, almost nobody at night. */
export const WORKDAY: Record<DayPeriod, number> = { morning: 1, afternoon: 1, evening: 0.35, night: 0.05 };
/** On a weekend of the game's calendar few of the staff are in. */
export const WEEKEND_STAFF = 0.3;
/** A tour group for this many students in view, at a weekend, and the most groups at once. */
export const STUDENTS_PER_TOUR = 45;
export const MAX_TOURS = 3;
/** A tour is a guide and two parents. */
export const TOUR_SIZE = 3;
/** Boosters come at weekends: one, and a second on a busy view. */
export const STUDENTS_PER_BOOSTER = 60;
export const MAX_BOOSTERS = 2;

export interface OthersFacts {
  /** Students wanted on screen now: the crowd everyone else is measured against. */
  studentsInView: number;
  /** Students enrolled, and the faculty and staff the campus pays: the payroll's own counts. */
  students: number;
  faculty: number;
  staff: number;
  period: DayPeriod;
  /** Saturday or Sunday in the game's calendar. */
  weekend: boolean;
}

export interface Others {
  professors: number;
  /** Advisors, dining workers and store clerks. */
  staff: number;
  /** Tour groups, each a guide and two parents. Weekends only. */
  tours: number;
  /** Weekends only. */
  boosters: number;
  /** Everyone above, counted as people. */
  people: number;
}

/**
 * How many people who are not students to show among the students on screen.
 * Professors and staff follow the payroll: as many as the campus employs for
 * each student, seen a little more often than that, by day. Visitors come at
 * weekends. All of them together stay under their share of the crowd.
 */
export function othersWanted(facts: OthersFacts): Others {
  const crowd = Math.max(0, Math.floor(facts.studentsInView));
  // Others over everyone is at most the share: so others are at most this many for the students there are.
  const most = Math.floor((crowd * OTHERS_SHARE) / (1 - OTHERS_SHARE));
  if (most <= 0 || facts.students <= 0) return { professors: 0, staff: 0, tours: 0, boosters: 0, people: 0 };
  const day = WORKDAY[facts.period] * (facts.weekend ? WEEKEND_STAFF : 1);
  const perStudent = (employed: number): number => (crowd * employed * OTHERS_SEEN_MORE * day) / facts.students;
  // Nobody can be seen who is not on the books.
  let professors = Math.min(facts.faculty, Math.round(perStudent(facts.faculty)));
  let staff = Math.min(facts.staff, Math.round(perStudent(facts.staff)));
  const visiting = facts.weekend && facts.period !== 'night' ? (facts.period === 'evening' ? 0.5 : 1) : 0;
  let tours = Math.min(MAX_TOURS, Math.round((crowd / STUDENTS_PER_TOUR) * visiting));
  let boosters = visiting > 0 ? Math.min(MAX_BOOSTERS, Math.max(1, Math.round((crowd / STUDENTS_PER_BOOSTER) * visiting))) : 0;
  // Over the share: visitors give way first, a group at a time, then staff, then professors.
  const people = (): number => professors + staff + tours * TOUR_SIZE + boosters;
  while (people() > most && boosters > 0) boosters -= 1;
  while (people() > most && tours > 0) tours -= 1;
  while (people() > most && staff > 0) staff -= 1;
  while (people() > most && professors > 0) professors -= 1;
  return { professors, staff, tours, boosters, people: people() };
}

/**
 * How far the frame rate may fall before the crowd steps down, and how good it
 * must be to step back up, as shares of the best rate this screen has shown.
 * A phone in Low Power Mode draws 30 frames a second however little there is
 * to draw: that is its full rate, not a slow phone.
 */
export const FPS_LOW_SHARE = 0.8;
export const FPS_GOOD_SHARE = 0.93;
/** No screen is taken to refresh slower than this, so a phone that never gets above 20 is still called slow. */
export const FPS_FLOOR = 30;
/** Seconds below the low mark before stepping down, and above the good mark before stepping up. */
export const FPS_DOWN_AFTER = 3;
export const FPS_UP_AFTER = 8;

/**
 * The frame budget. Fed the frame rate once a second, it says which step the
 * map should show: down one when frames have been low for a few seconds, up
 * one when they have been good for longer, never above the player's setting.
 */
export class FrameBudget {
  private low = 0;
  private good = 0;
  /** The best rate seen: what this screen can do. */
  private best = FPS_FLOOR;
  step: number;

  constructor(private ceiling: number) {
    this.step = ceiling;
  }

  /** The player changed the setting. */
  setCeiling(ceiling: number): void {
    this.ceiling = ceiling;
    this.step = ceiling;
    this.low = 0;
    this.good = 0;
  }

  /** One second has passed at this frame rate. Returns the step to show. */
  second(fps: number): number {
    this.best = Math.max(this.best, Math.min(fps, 240));
    if (fps < this.best * FPS_LOW_SHARE) {
      this.low += 1;
      this.good = 0;
      if (this.low >= FPS_DOWN_AFTER && this.step > 0) {
        this.step -= 1;
        this.low = 0;
      }
    } else if (fps >= this.best * FPS_GOOD_SHARE) {
      this.good += 1;
      this.low = 0;
      if (this.good >= FPS_UP_AFTER && this.step < this.ceiling) {
        this.step += 1;
        this.good = 0;
      }
    } else {
      this.low = 0;
      this.good = 0;
    }
    return this.step;
  }
}

const KEY = 'campus-tycoon.crowd';
let chosen: Crowd | null = null;

/** The crowd setting the player picked. Normal until they pick one. */
export function crowdSetting(): Crowd {
  if (chosen === null) {
    chosen = DEFAULT_CROWD;
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === 'low' || stored === 'normal' || stored === 'high') chosen = stored;
    } catch {
      // Storage is blocked: the default, until the page closes.
    }
  }
  return chosen;
}

export function setCrowdSetting(crowd: Crowd): void {
  chosen = crowd;
  try {
    localStorage.setItem(KEY, crowd);
  } catch {
    // Private browsing: the choice lasts until the page closes.
  }
}
