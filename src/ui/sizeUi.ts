import {
  BENEFITS_SHARE,
  capacity,
  dollarsShort,
  enrollment,
  enrollmentCap,
  eraName,
  FACULTY_PAY,
  facultyCount,
  facultyNeed,
  fallApplicants,
  goalsReached,
  headCount,
  INSTRUCTION_FULL,
  INSTRUCTION_RATIOS,
  instructionStep,
  nextFall,
  nextIntakeSeason,
  nextRankGoal,
  nextSemesterStaff,
  statusWord,
  type GameState,
  type NeedFix,
  type NeedId,
  type NeedStatus,
} from '../sim';

/**
 * Words for the screen that opens from the student count on the top bar
 * (DESIGN.md 37.7 and section 38). It has two pages. Goals: the students
 * against the cap, this fall's applicants with what makes them, who gets a
 * place, and the rank with its next goal. Capacity: every need of a student
 * as what the campus has against what its enrollment asks. Nothing here
 * touches the page. On a game begun on the small campus the Goals page shows
 * what is true there, and no cap and no goals.
 */

export interface SizeView {
  /** "50,000 students". */
  title: string;
  /** The students against the cap, as a bar. null on a game with no cap. */
  cap: { line: string; note: string; percent: number } | null;
  applicants: {
    /** "This fall's applicants". */
    head: string;
    total: string;
    /** Where the count starts, then each cause. On a game with goals the numbers add up to the total, to the student. */
    rows: Array<{ name: string; value: string }>;
  };
  /** Of this fall's applicants, how many the cap leaves a place for and how many it turns away. null on a game with no cap. */
  places: { admitted: string; turnedAway: string } | null;
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
  const limit = enrollmentCap(state);
  const rank = state.field.rank;
  const rankGoal = nextRankGoal(state);

  let cap: SizeView['cap'] = null;
  let places: SizeView['places'] = null;
  if (limit !== null) {
    const toGo = Math.max(0, limit - students);
    const reached = (goals?.size ?? 0) > 0;
    cap = {
      line: students > limit ? `Above the cap of ${headCount(limit)}` : toGo === 0 ? `Full at ${headCount(limit)}` : `${headCount(toGo)} places open of ${headCount(limit)}`,
      note:
        students > limit
          ? 'Nobody is admitted until commencement brings it back under. No student is asked to leave.'
          : reached
            ? 'A full campus turns the rest of its applicants away, and is ranked the higher for it.'
            : 'A full campus is the first goal. It is counted when a class moves in.',
      percent: Math.round(100 * Math.max(0, Math.min(1, students / Math.max(1, limit)))),
    };
    // Next fall: whoever stays, and as many applicants as the cap then leaves room for.
    const fall = nextFall(state);
    places = { admitted: headCount(fall.admitted), turnedAway: headCount(fall.turnedAway) };
  }
  return {
    title: `${headCount(students)} students`,
    cap,
    applicants: {
      head: "This fall's applicants",
      total: headCount(applicants.total),
      rows: [
        { name: applicants.baseName, value: headCount(applicants.base) },
        ...applicants.causes.map((cause) => ({ name: cause.name, value: applicants.exact ? signed(cause.students) : percent(cause.factor) })),
        ...(applicants.ceiling !== null ? [{ name: 'The most a fall class can be', value: headCount(applicants.ceiling) }] : []),
      ],
    },
    places,
    rank: rank > 0 ? `No. ${rank} of 200 for academics` : 'Not yet ranked. The first rankings come out in the spring.',
    rankNext: goals && rankGoal !== null ? `Next goal: Top ${rankGoal}` : goals ? 'Every rank goal is reached.' : '',
    era: goals ? `Era: ${eraName(goals)}` : '',
    reached: goalsReached(state),
  };
}

// ------------------------------------------------------------ Capacity --

export interface CapacityRow {
  id: NeedId;
  name: string;
  /** "30,000 of 30,240 in use · 20,000 live in town". */
  line: string;
  status: NeedStatus;
  /** "OK", "Tight" or "Short". */
  word: string;
  /** What is said when the row is tapped: what its status does, then next fall. */
  detail: string[];
  /** The button under it, and where it goes. '' with none. */
  fixLabel: string;
  fix: NeedFix;
}

export interface CapacityView {
  /** "Next fall: 50,000 students". */
  lead: string;
  rows: CapacityRow[];
  /** The tab's own name, with how many needs are short: "Capacity · 2 short". */
  tab: string;
}

export function capacityView(state: GameState): CapacityView {
  const page = capacity(state);
  return {
    lead: `Next fall: ${headCount(page.nextFall)} students`,
    rows: page.needs.map((need) => ({
      id: need.id,
      name: need.name,
      line: need.line,
      status: need.status,
      word: statusWord(need.status),
      detail: [need.consequence, need.forecast].filter((text) => text !== ''),
      fixLabel: need.fixLabel,
      fix: need.fix,
    })),
    tab: page.short > 0 ? `Capacity · ${page.short} short` : page.tight > 0 ? `Capacity · ${page.tight} tight` : 'Capacity',
  };
}

// --------------------------------------------------- the Instruction slider --

export interface InstructionView {
  step: number;
  max: number;
  /** "1 to 20 · full funding". */
  line: string;
  /** What it pays for, and when a change arrives. */
  note: string;
}

/** The Instruction slider: the ratio it asks for, what that costs, and who is on the way. */
export function instructionView(state: GameState): InstructionView {
  const step = instructionStep(state);
  const ratio = INSTRUCTION_RATIOS[step]!;
  const word = step === INSTRUCTION_FULL ? 'full funding' : step < INSTRUCTION_FULL ? 'underfunded' : 'well funded';
  const need = facultyNeed(state);
  const have = facultyCount(state);
  const cost = dollarsShort(need * FACULTY_PAY * (1 + BENEFITS_SHARE));
  const next = nextSemesterStaff(state).faculty;
  const when = nextIntakeSeason(state);
  let moving = '';
  if (next > have) moving = ` ${headCount(next - have)} more arrive in the ${when}.`;
  else if (next < have) moving = ` ${headCount(have - next)} leave by the ${when}. Nobody is let go.`;
  else if (need !== have) moving = ` A change arrives a semester after it is made.`;
  return {
    step,
    max: INSTRUCTION_RATIOS.length - 1,
    line: `1 to ${ratio} · ${word}`,
    note: need > 0 ? `${headCount(need)} faculty for today's students: ${cost} a year with benefits.${moving}` : 'Faculty are hired when the first class arrives.',
  };
}
