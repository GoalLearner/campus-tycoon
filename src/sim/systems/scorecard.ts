import { chaosOn, chaosView } from './chaos';
import { AFFINITY_PARTS } from '../config/alumni';
import { LEAVE_FIX, LEAVE_WHYS, LEAVE_WORDS } from '../config/population';
import { dollars, headCount } from '../format';
import type { GameState } from '../types';
import { alumniClasses, alumniOn, classNumbers } from './alumni';
import { yearAcceptance } from './admissions';
import { fallApplicants } from './demand';
import { nextFall } from './capacity';
import { admissionsRank, pipeline, pipelineWords, transferWords, type Pipeline } from './selectivity';
import { campusRates } from './field';
import { classSizeNow, ratioTarget } from './staffing';

/**
 * The Scorecard, first version (DESIGN.md 24.5, built with alumni giving in
 * section 56): the seven stages of the spine of 24.1 as seven rows, each with
 * its number, an arrow against last year, and the one thing that limits it
 * most, in plain words. Read when the page is open; only last year's numbers
 * are kept, at each year's end, for the arrows.
 */

export type ScoreId = 'applications' | 'acceptance' | 'yield' | 'retention' | 'graduation' | 'success' | 'donations' | 'chaos';

export interface ScoreRow {
  id: ScoreId;
  name: string;
  /** The number, in words: "10,240", "38% admitted". */
  value: string;
  /** The number the arrow compares, or null when there is none yet. */
  number: number | null;
  /** Against last year's end: 'up', 'down' or 'same', and whether that is good. null with nothing to compare. */
  trend: { way: 'up' | 'down' | 'same'; good: boolean | null } | null;
  /** The one thing that limits it most, in plain words. */
  limit: string;
  /** More lines under it: the Chaos meter's causes, biggest first, and a letter from the trustees (DESIGN.md 68.3). */
  more?: string[];
}

const ORDER: readonly ScoreId[] = ['applications', 'acceptance', 'yield', 'retention', 'graduation', 'success', 'donations', 'chaos'];
/** For each row, whether a higher number is better. Acceptance is better lower: a more selective school. */
const HIGHER_IS_BETTER: Record<ScoreId, boolean> = { applications: true, acceptance: false, yield: true, retention: true, graduation: true, success: true, donations: true, chaos: false };

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** The fix for each of the four causes of applicants, when it is the one that adds the least. */
const APPLICANT_FIX: Record<string, string> = {
  looks: 'how the campus looks adds the least: build up the dorms and what is near them',
  marketing: 'marketing adds the least: a higher step reaches more of the country',
  football: 'football adds the least: a winning team draws more applicants',
  rank: 'the academic rank adds the least: a better rank draws more',
};

/**
 * Who left last academic year (this one's, before a year has closed), and why, in plain words: the biggest group, and
 * what would keep more of them (DESIGN.md 65.2).
 */
function leavingLine(state: GameState): string {
  const tally = state.admissions.whyLastYear ?? state.admissions.whyYear;
  const total = tally ? tally.why.reduce((sum, n) => sum + n, 0) : 0;
  if (!tally || total <= 0) return 'Nobody has left yet: a happier campus and a better rank keep students';
  let most = 0;
  for (let i = 1; i < LEAVE_WHYS.length; i++) if ((tally.why[i] ?? 0) > (tally.why[most] ?? 0)) most = i;
  const why = LEAVE_WHYS[most]!;
  const back = tally.returned > 0 ? `. ${headCount(tally.returned)} who had stopped out came back` : '';
  return `${state.admissions.whyLastYear ? 'Last year' : 'This year'} ${headCount(total)} left; the biggest group ${LEAVE_WORDS[why].verb} (${headCount(tally.why[most] ?? 0)}). ${capital(LEAVE_FIX[why])}${back}`;
}

/**
 * Next fall as an admissions office would count it (DESIGN.md 70.1): the applications the campus draws today, as many
 * admitted as fill the places the cap leaves, and the yield at its rank.
 */
export function fallPipeline(state: GameState): Pipeline {
  const fall = nextFall(state);
  return pipeline(fall.applicants, fall.admitted, admissionsRank(state), 'fall');
}

/**
 * The last intake as an admissions office counts it, and next fall, in the panel's words (DESIGN.md 70.1): "Last fall:
 * 58,400 applied · 46,100 admitted (79%) · 9,500 enrolling (21% yield), and 1,400 transfers (37% of 6,300 admitted)."
 * A campus that opened with its students never says they applied.
 */
export function admissionsLines(state: GameState): string[] {
  const last = state.admissions.lastIntake;
  const next = fallPipeline(state);
  const words = (p: Pipeline): string => `${pipelineWords(p, headCount)}${p.transfers.enrolling > 0 ? `, and ${transferWords(p, headCount)}` : ''}`;
  const nextLine = `Next fall: ${words(next)}.`;
  if (!last?.real) return [...(last?.opening ? [`The campus opened with its ${headCount(last.admitted)} students: nobody applied for those places.`] : []), nextLine];
  const r = last.real;
  const was: Pipeline = { applied: r.applied, admitted: r.offered, enrolling: r.firstYears, yield: r.yield, transfers: { applied: r.transferApplied, admitted: r.transferOffered, enrolling: r.transfers } };
  return [`Last ${last.season}: ${words(was)}.`, ...(last.season === 'spring' ? [nextLine] : [])];
}

/** The yield the Scorecard shows: the last fall's, or what next fall's would be. */
function yieldNow(state: GameState): number {
  const last = state.admissions.lastIntake;
  return last?.season === 'fall' && last.real ? last.real.yield : fallPipeline(state).yield;
}

/** The seven numbers, in the order of the rows, as they stand now. */
function numbersNow(state: GameState): Array<number | null> {
  const applicants = fallPipeline(state).applied;
  const accept = yearAcceptance(state);
  const latest = alumniClasses(state).slice(-1)[0];
  const success = latest?.success ?? state.alumni.opening?.success ?? null;
  const rates = campusRates(state);
  return [applicants, accept, yieldNow(state), rates.second, rates.graduation, success, state.alumni.last?.raised ?? null, chaosOn(state) ? Math.round(state.chaos.level) : null];
}

/** The year's end: the numbers are kept, so next year's arrows have something to point from. */
export function scorecardYearEnd(state: GameState, year: number): void {
  if (!alumniOn(state)) return;
  state.alumni.scorecard = { year, values: numbersNow(state) };
}

/** The weakest part of a class's affinity, in words, for the donations row. */
function weakestAffinity(state: GameState): string {
  const latest = alumniClasses(state).slice(-1)[0];
  if (!latest) return 'the classes before your time give at a middling rate: happier classes, traditions, Greek Row and wins raise it';
  const parts = classNumbers(state, latest, latest.greek ?? 0, latest.entryYear + 3).parts;
  const gaps: Array<[number, string]> = [
    [AFFINITY_PARTS.happiness * (1 - parts.happiness), 'Happiness while they were here: happier classes give more'],
    [AFFINITY_PARTS.traditions * (1 - parts.traditions), 'traditions kept in their years: each one kept raises it'],
    [AFFINITY_PARTS.greek * (1 - parts.greek), 'few of them in chapters: members give more'],
    [AFFINITY_PARTS.football * (1 - parts.football), 'the football record in their years: wins raise it'],
  ];
  gaps.sort((a, b) => b[0] - a[0]);
  return gaps[0]![1];
}

/** Every row of the Scorecard, or null on a game with no drive. */
export function scorecard(state: GameState): ScoreRow[] | null {
  if (!alumniOn(state)) return null;
  const now = numbersNow(state);
  const last = state.alumni.scorecard?.values ?? null;
  const applicants = fallApplicants(state);
  const least = [...applicants.causes].sort((a, b) => a.factor - b.factor)[0];
  const intake = state.admissions.lastIntake;
  const rates = campusRates(state);
  const latest = alumniClasses(state).slice(-1)[0];
  const rows: Record<ScoreId, Omit<ScoreRow, 'id' | 'number' | 'trend'>> = {
    // Real figures (DESIGN.md 70): this fall's applications, the year's first-years admitted, and the share who come.
    applications: { name: 'Applications', value: headCount(now[0]!), limit: least ? capital(APPLICANT_FIX[least.id] ?? `${least.name} adds the least`) : 'Nothing yet' },
    acceptance: {
      name: 'Acceptance rate',
      value: now[1] === null ? 'No class yet' : `${percent(now[1]!)} of first-year applicants admitted`,
      limit: intake?.capped ? 'The campus is full: it admits fewer, and is the more selective for it' : 'Rank: the higher it is, the more apply for each place, and the fewer are admitted',
    },
    yield: { name: 'Yield', value: `${percent(now[2]!)} of those admitted enrol`, limit: 'Rank: the higher it is, the more of those admitted choose to come' },
    retention: { name: 'Retention', value: now[3] === null ? 'No class has begun a second year yet' : `${percent(now[3]!)} of freshmen come back for a second year`, limit: leavingLine(state) },
    graduation: {
      name: 'Graduation rate',
      value: now[4] === null ? 'No class has had six years yet' : `${percent(now[4]!)} finish within six years${rates.four !== null ? `, ${percent(rates.four)} in four` : ''}`,
      limit: `Class size: one member of faculty to every ${Math.round(classSizeNow(state))} students, where ${ratioTarget(state)} is funded`,
    },
    success: {
      name: 'Alumni success',
      value: latest ? `${Math.round(latest.success ?? 0)} of 100, the Class of Year ${latest.entryYear + 3}` : `${Math.round(now[5] ?? 0)} of 100, the classes before your time`,
      limit: 'The academic rating: most of a class’s success, with finishing on time and jobs',
    },
    donations: {
      name: 'Donations',
      value: state.alumni.last ? `${dollars(state.alumni.last.raised)} at the last drive` : 'The first drive is at commencement',
      limit: capital(weakestAffinity(state)),
    },
    chaos: chaosRow(state),
  };
  return ORDER.filter((id) => id !== 'chaos' || chaosOn(state)).map((id) => {
    const n = ORDER.indexOf(id);
    const number = now[n] ?? null;
    const before = last?.[n] ?? null;
    let trend: ScoreRow['trend'] = null;
    // Yield is a real share since DESIGN.md 70; before, it was every student, always, and had no arrow.
    if (number !== null && before !== null && (id !== 'yield' || before < 1)) {
      const delta = number - before;
      const same = Math.abs(delta) <= Math.abs(before) * 0.005;
      const way = same ? 'same' : delta > 0 ? 'up' : 'down';
      trend = { way, good: same ? null : (delta > 0) === HIGHER_IS_BETTER[id] };
    }
    return { id, number, trend, ...rows[id] };
  });
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The Chaos meter's row (DESIGN.md 68.3): its step, the biggest cause, and the next two and any letter under it. */
function chaosRow(state: GameState): Omit<ScoreRow, 'id' | 'number' | 'trend'> {
  const view = chaosView(state);
  if (!view) return { name: 'Chaos', value: 'Calm', limit: 'Nothing much: a quiet week' };
  const [first, ...rest] = view.causes;
  return { name: 'Chaos', value: `${view.step}, ${view.level} of 100`, limit: first ?? 'Nothing much: a quiet week', more: [...rest, ...(view.letter ? [view.letter] : [])] };
}
