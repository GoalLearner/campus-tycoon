import { DOUBLE_FROM, DOUBLE_SHARE, MAJORS, SWITCH_RATE, SWITCH_SEMESTERS, UNDECLARED } from '../config/students';
import { hashInts } from '../rng';

/**
 * A student's major over their years (DESIGN.md 65.3): the subject they come intending, the semester they declare,
 * a change of major for about a third, and a second major for about one in twenty. All of it from the seed, so a
 * student's path is the same however it is read and nothing is stored. The shares they begin with are set so that,
 * after the real rates of changing major, the majors held by those about to graduate are the real degree shares.
 */

/** Who a student is, as the rest of the game names them. */
interface Ref {
  entryYear: number;
  index: number;
}

/** One salt per draw, apart from the card's own. */
const SALT = { intended: 41, declare: 42, switches: 43, when: 44, to: 45, double: 46, second: 47 } as const;

const roll = (seed: number, ref: Ref, salt: number): number => hashInts(seed, ref.entryYear, ref.index, salt) / 4294967296;

/** The real degree shares, each major's part of 1. */
export const FINAL: readonly number[] = MAJORS.map((major) => major.share / 100);

/** Each major's share of those who change out of the major they came intending. */
const SWITCHING: readonly number[] = MAJORS.map((major) => SWITCH_RATE[major.field]);

/** Where a year of changing major leaves shares that began as `begin`: each major's leavers go to the others, in proportion to the real shares. */
export function afterSwitching(begin: readonly number[]): number[] {
  const out = begin.map((share, i) => share * (1 - SWITCHING[i]!));
  begin.forEach((share, i) => {
    const leaving = share * SWITCHING[i]!;
    for (let j = 0; j < out.length; j++) if (j !== i) out[j]! += (leaving * FINAL[j]!) / (1 - FINAL[i]!);
  });
  return out;
}

/** The shares students begin with: more come intending the sciences and mathematics, which many then leave. */
export const INTENDED: readonly number[] = (() => {
  let begin = [...FINAL];
  for (let step = 0; step < 300; step++) {
    const end = afterSwitching(begin);
    begin = begin.map((share, i) => Math.max(1e-6, share + FINAL[i]! - end[i]!));
    const total = begin.reduce((sum, share) => sum + share, 0);
    begin = begin.map((share) => share / total);
  }
  return begin;
})();

/** A major by a number in [0, 1), weighed by `shares`, leaving out `not`. */
function pick(shares: readonly number[], at: number, not: readonly number[] = []): number {
  let total = 0;
  shares.forEach((share, i) => {
    if (!not.includes(i)) total += share;
  });
  let left = at * total;
  for (let i = 0; i < shares.length; i++) {
    if (not.includes(i)) continue;
    left -= shares[i]!;
    if (left < 0) return i;
  }
  for (let i = shares.length - 1; i >= 0; i--) if (!not.includes(i)) return i;
  return 0;
}

export interface MajorPath {
  /** The major they come intending, by its place in MAJORS. */
  intended: number;
  /** The semester they declare, counted from entry: 0 for those who come declared. */
  declare: number;
  /** The semester they change major, or -1 for most; and to which. */
  switchAt: number;
  to: number;
  /** Their second major, or -1 for most. */
  second: number;
}

/** A student's whole path through majors, from the seed alone. */
export function majorPath(seed: number, ref: Ref): MajorPath {
  const intended = pick(INTENDED, roll(seed, ref, SALT.intended));
  const u = roll(seed, ref, SALT.declare);
  let declare = 0;
  while (declare < UNDECLARED.length - 1 && u < UNDECLARED[declare]!) declare += 1;
  const switches = roll(seed, ref, SALT.switches) < SWITCHING[intended]!;
  const switchAt = switches ? Math.max(declare + 1, SWITCH_SEMESTERS[Math.floor(roll(seed, ref, SALT.when) * SWITCH_SEMESTERS.length)]!) : -1;
  const to = switches ? pick(FINAL, roll(seed, ref, SALT.to), [intended]) : -1;
  const second = roll(seed, ref, SALT.double) < DOUBLE_SHARE ? pick(FINAL, roll(seed, ref, SALT.second), [intended, to]) : -1;
  return { intended, declare, switchAt, to, second };
}

export interface MajorNow {
  /** As the card shows it: "Undeclared", "Biology", or "Biology and Economics". */
  shown: string;
  /** The major they study, by its place in MAJORS: the one they intend while undeclared. Lectures, sections and stories read it. */
  subject: number;
  undeclared: boolean;
  /** The major they came intending, when they have since changed it. */
  switchedFrom: number | null;
  /** Their second major, once it is shown. */
  second: number | null;
}

/** Where a student's path stands `semester` semesters after they entered. */
export function majorAt(path: MajorPath, semester: number): MajorNow {
  const undeclared = semester < path.declare;
  const switched = path.switchAt >= 0 && semester >= path.switchAt;
  const subject = switched ? path.to : path.intended;
  const second = !undeclared && path.second >= 0 && semester >= DOUBLE_FROM ? path.second : null;
  const name = MAJORS[subject]!.name;
  return {
    shown: undeclared ? 'Undeclared' : second !== null ? `${name} and ${MAJORS[second]!.name}` : name,
    subject,
    undeclared,
    switchedFrom: switched ? path.intended : null,
    second,
  };
}

/** Semesters since a class entered, at a semester of the game. A founding upper class entered before the game began. */
export function semestersIn(entryYear: number, semester: number): number {
  return Math.max(0, semester - (entryYear - 1) * 2);
}
