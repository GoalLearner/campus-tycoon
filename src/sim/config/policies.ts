import type { PlacedFamily } from './placed';
import type { CauseId } from './students';

/**
 * Policies (DESIGN.md sections 12 and 41): the switches an era opens.
 *
 * A policy is data. It has one gain and one named cost, each made of effects
 * from the short list below, and every effect lands on a number the game
 * already shows. A ninth policy is one more entry here: the page, the lock,
 * the paper, the money lines and the notes beside each number all read this
 * list and nothing else.
 *
 * Every size is [T].
 */

/** The inputs of the academic rating a policy may move. */
export type RatingInputId = 'graduation' | 'classSize' | 'retention' | 'selectivity' | 'reputation';

export type PolicyEffect =
  /**
   * Points of one of the four causes of Happiness, out of that cause's own
   * 100. It goes inside the cause and is named on its line: there is no
   * fifth cause. `among` says whose it is: everyone's, or only the students
   * who drive, or only the freshmen the policy has housed, and then the
   * campus feels it by their share.
   */
  | { kind: 'cause'; cause: CauseId; points: number; among: 'everyone' | 'drivers' | 'housed' }
  /** Points off Stress in finals week, and a share of them at midterms. With `library`, only for students with a library in reach. */
  | { kind: 'exams'; points: number; library?: true }
  /** Points on one input of the academic rating, out of its own 100. `why` is said beside it. */
  | { kind: 'rating'; input: RatingInputId; points: number; why?: string }
  /** This much more of every class leaves at the end of a semester. */
  | { kind: 'leaving'; share: number }
  /** Freshmen from town take the beds nobody is in, and pay for them. */
  | { kind: 'spareBeds' }
  /** This much more of a crowd wants a seat at a home game. */
  | { kind: 'fans'; lift: number }
  /** This share of the seats is given to students free. What the crowd spends inside is still earned. */
  | { kind: 'freeSeats'; share: number }
  /** Each building of a family costs this much more a year, on the small campus's count. */
  | { kind: 'upkeep'; family: PlacedFamily; perYear: number; one: string; many: string }
  /** Income: so much a year from each student who drives, or from a donor, on the small campus's count. */
  | { kind: 'income'; per: 'driver' | 'donor'; amount: number }
  /** Mischief in the dorms happens this many times as often. */
  | { kind: 'mischief'; times: number };

export interface PolicySpec {
  id: string;
  name: string;
  /** The era that opens it: 1 is Growth, 2 Flagship, 3 Legacy. */
  era: 1 | 2 | 3;
  /** Its one gain and its one named cost, in plain words: what the switch says before it is turned on. */
  gives: string;
  takes: string;
  gains: readonly PolicyEffect[];
  costs: readonly PolicyEffect[];
  /** The paper's line the day it is turned on, and the day it is turned off. `{donor}` is the donor's name. */
  begins: string;
  ends: string;
}

export const POLICIES: readonly PolicySpec[] = [
  {
    id: 'readingDays',
    name: 'Reading days before finals',
    era: 1,
    gives: 'Lower Stress at exams',
    takes: 'Slightly lower grades',
    gains: [{ kind: 'exams', points: 20 }],
    costs: [{ kind: 'rating', input: 'classSize', points: -1.5, why: 'fewer teaching days' }],
    begins: 'Reading days before finals begin: no classes in the days before exams.',
    ends: 'Reading days before finals end: classes run up to the last day.',
  },
  {
    id: 'toughGrading',
    name: 'Tough grading',
    era: 1,
    gives: 'A better academic rating',
    takes: 'A few more students leave each semester',
    gains: [{ kind: 'rating', input: 'reputation', points: 6, why: 'a degree here is harder to earn' }],
    costs: [{ kind: 'leaving', share: 0.004 }],
    begins: 'Tough grading begins: a top mark is harder to earn.',
    ends: 'Tough grading ends: marks go back to how they were.',
  },
  {
    id: 'freshmenOnCampus',
    name: 'Freshmen live on campus',
    era: 1,
    gives: 'Fuller dorms and more room fees',
    takes: 'A little Happiness',
    gains: [{ kind: 'spareBeds' }],
    costs: [{ kind: 'cause', cause: 'grounds', points: -30, among: 'housed' }],
    begins: 'Freshmen live on campus: those from town take the beds nobody is in.',
    ends: 'Freshmen may live at home again.',
  },
  {
    id: 'freeStudentSection',
    name: 'Free student section',
    era: 1,
    gives: 'A fuller stadium and a little Happiness',
    takes: 'Ticket income',
    gains: [
      { kind: 'fans', lift: 0.2 },
      { kind: 'cause', cause: 'life', points: 3, among: 'everyone' },
    ],
    costs: [{ kind: 'freeSeats', share: 0.25 }],
    begins: 'A free student section opens: a quarter of the seats at every home game.',
    ends: 'The free student section closes: every seat is sold again.',
  },
  {
    id: 'allNightLibrary',
    name: 'All-night library',
    era: 2,
    gives: 'Softer finals',
    takes: 'The library costs more to run',
    gains: [{ kind: 'exams', points: 16, library: true }],
    costs: [{ kind: 'upkeep', family: 'library', perYear: 10_000, one: 'library or computer lab', many: 'libraries and computer labs' }],
    begins: 'The library stays open all night.',
    ends: 'The library closes at night again.',
  },
  {
    id: 'parkingFees',
    name: 'Parking fees',
    era: 2,
    gives: 'Income',
    takes: 'Happiness of students who drive',
    gains: [{ kind: 'income', per: 'driver', amount: 450 }],
    costs: [{ kind: 'cause', cause: 'life', points: -18, among: 'drivers' }],
    begins: 'Parking fees begin: students who drive pay for a space.',
    ends: 'Parking fees end: a space is free again.',
  },
  {
    id: 'quietHours',
    name: 'Quiet hours',
    era: 3,
    gives: 'Fewer incidents',
    takes: 'A little Happiness',
    gains: [{ kind: 'mischief', times: 0.4 }],
    costs: [{ kind: 'cause', cause: 'life', points: -3, among: 'everyone' }],
    begins: 'Quiet hours begin in the dorms.',
    ends: 'Quiet hours end in the dorms.',
  },
  {
    id: 'namingRights',
    name: 'Naming rights',
    era: 3,
    gives: 'Income',
    takes: 'A little Happiness',
    gains: [{ kind: 'income', per: 'donor', amount: 125_000 }],
    costs: [{ kind: 'cause', cause: 'grounds', points: -3, among: 'everyone' }],
    begins: 'Naming rights are sold: the {donor} name goes up around campus.',
    ends: 'Naming rights end: the {donor} name comes down.',
  },
];

/** A share of the points an exams effect takes off in finals week is taken off at midterms too. */
export const EXAMS_AT_MIDTERMS = 0.4;

/** The most Stress all policies together may take off. */
export const EXAMS_MOST = 24;
