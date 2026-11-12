import {
  enrollment,
  eraName,
  fallApplicants,
  GOAL_SCALE,
  goalsReached,
  headCount,
  MODEL_STUDENTS,
  nextRankGoal,
  nextSizeGoal,
  scaleOf,
  sizeGoal,
  type GameState,
} from '../sim';

/**
 * Words for the Size panel, which opens from the student count on the top
 * bar (DESIGN.md 37.7): the students, the next goal, this fall's applicants
 * with what makes them, and the rank with its next goal. Nothing here touches
 * the page. On a game begun on the small campus it shows what is true there,
 * and no goals.
 */

export interface SizeView {
  /** "52,173 students". */
  title: string;
  /** The next size goal with how far there is to go, as a bar. null when there are no goals or every one is reached. */
  next: { line: string; toGo: string; percent: number } | null;
  /** Said in place of the next goal once the last one is reached. '' otherwise. */
  done: string;
  applicants: {
    /** "This fall's applicants". */
    head: string;
    total: string;
    /** Where the count starts, then each cause. On a game with goals the numbers add up to the total, to the student. */
    rows: Array<{ name: string; value: string }>;
  };
  /** "No. 143 of 200 for academics". */
  rank: string;
  /** "Next goal: Top 125". '' when there are no goals or every one is reached. */
  rankNext: string;
  /** "Era: Growth". '' on a game with no goals. */
  era: string;
  /** Goals reached, newest first. Empty on a game with no goals. */
  reached: string[];
}

const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${headCount(Math.abs(n))}`;
const percent = (factor: number): string => {
  const points = Math.round((factor - 1) * 100);
  return `${points >= 0 ? '+' : '−'}${Math.abs(points)}%`;
};

export function sizeView(state: GameState): SizeView {
  const students = enrollment(state);
  const applicants = fallApplicants(state);
  const goals = state.goals;
  const next = nextSizeGoal(state);
  // The bar runs from the goal before, or from the size a model campus opens at, to the next goal.
  const from = goals && goals.size > 0 ? sizeGoal(state, goals.size - 1) : Math.round((MODEL_STUDENTS * scaleOf(state)) / GOAL_SCALE);
  const rank = state.field.rank;
  const rankGoal = nextRankGoal(state);
  return {
    title: `${headCount(students)} students`,
    next: next
      ? {
          line: `Next goal: ${headCount(next.goal)} students`,
          toGo: next.toGo > 0 ? `${headCount(next.toGo)} to go. Counted when a class moves in.` : 'Reached at the next class to move in.',
          percent: Math.round(100 * Math.max(0, Math.min(1, (students - from) / Math.max(1, next.goal - from)))),
        }
      : null,
    done: goals && !next ? 'Every size goal is reached.' : '',
    applicants: {
      head: "This fall's applicants",
      total: headCount(applicants.total),
      rows: [
        { name: applicants.baseName, value: headCount(applicants.base) },
        ...applicants.causes.map((cause) => ({ name: cause.name, value: applicants.exact ? signed(cause.students) : percent(cause.factor) })),
        ...(applicants.ceiling !== null ? [{ name: 'The most a fall class can be', value: headCount(applicants.ceiling) }] : []),
      ],
    },
    rank: rank > 0 ? `No. ${rank} of 200 for academics` : 'Not yet ranked. The first rankings come out in the spring.',
    rankNext: goals && rankGoal !== null ? `Next goal: Top ${rankGoal}` : goals ? 'Every rank goal is reached.' : '',
    era: goals ? `Era: ${eraName(goals)}` : '',
    reached: goalsReached(state),
  };
}
