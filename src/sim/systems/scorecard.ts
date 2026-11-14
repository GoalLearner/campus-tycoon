import { AFFINITY_PARTS } from '../config/alumni';
import { CAUSE_NAMES } from '../config/students';
import { dollars, headCount } from '../format';
import type { GameState } from '../types';
import { alumniClasses, alumniOn, classNumbers } from './alumni';
import { yearAcceptance } from './admissions';
import { fallApplicants } from './demand';
import { academicInputs } from './field';
import { campusHappiness, retentionRate } from './happiness';
import { classSizeNow, ratioTarget } from './staffing';

/**
 * The Scorecard, first version (DESIGN.md 24.5, built with alumni giving in
 * section 56): the seven stages of the spine of 24.1 as seven rows, each with
 * its number, an arrow against last year, and the one thing that limits it
 * most, in plain words. Read when the page is open; only last year's numbers
 * are kept, at each year's end, for the arrows.
 */

export type ScoreId = 'applications' | 'acceptance' | 'yield' | 'retention' | 'graduation' | 'success' | 'donations';

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
}

const ORDER: readonly ScoreId[] = ['applications', 'acceptance', 'yield', 'retention', 'graduation', 'success', 'donations'];
/** For each row, whether a higher number is better. Acceptance is better lower: a more selective school. */
const HIGHER_IS_BETTER: Record<ScoreId, boolean> = { applications: true, acceptance: false, yield: true, retention: true, graduation: true, success: true, donations: true };

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** The fix for each of the four causes of applicants, when it is the one that adds the least. */
const APPLICANT_FIX: Record<string, string> = {
  looks: 'how the campus looks adds the least: build up the dorms and what is near them',
  marketing: 'marketing adds the least: a higher step reaches more of the country',
  football: 'football adds the least: a winning team draws more applicants',
  rank: 'the academic rank adds the least: a better rank draws more',
};

/** The share of the classes that have had their years that finished, or null before any has. The rating's graduation rate. */
function graduationShare(state: GameState): number | null {
  const input = academicInputs(state).find((one) => one.id === 'graduation');
  if (!input || input.level === null) return null;
  const match = /^(\d+)% of a class finishes/.exec(input.detail);
  return match ? Number(match[1]) / 100 : null;
}

/** The seven numbers, in the order of the rows, as they stand now. */
function numbersNow(state: GameState): Array<number | null> {
  const applicants = fallApplicants(state).total;
  const accept = yearAcceptance(state);
  const latest = alumniClasses(state).slice(-1)[0];
  const success = latest?.success ?? state.alumni.opening?.success ?? null;
  return [applicants, accept, 1, retentionRate(state), graduationShare(state), success, state.alumni.last?.raised ?? null];
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
  const mood = campusHappiness(state);
  const intake = state.admissions.lastIntake;
  const latest = alumniClasses(state).slice(-1)[0];
  const rows: Record<ScoreId, Omit<ScoreRow, 'id' | 'number' | 'trend'>> = {
    applications: { name: 'Applications', value: headCount(applicants.total), limit: least ? capital(APPLICANT_FIX[least.id] ?? `${least.name} adds the least`) : 'Nothing yet' },
    acceptance: {
      name: 'Acceptance rate',
      value: now[1] === null ? 'No class yet' : `${percent(now[1]!)} admitted`,
      limit: intake?.capped ? 'The campus is full: the rest are turned away, and it is the more selective for it' : intake?.bottleneck ? `Room: ${intake.bottleneck === 'housing' ? 'beds' : 'classroom seats'} decide how many get a place` : 'Room for everyone who applied: more applicants would make it more selective',
    },
    yield: { name: 'Yield', value: 'Every student offered a place comes', limit: 'Nothing yet: no other school competes for them in this version' },
    retention: { name: 'Retention', value: `${(retentionRate(state) * 100).toFixed(1)}% stay each semester`, limit: mood.worst ? `${CAUSE_NAMES[mood.worst]} is the weakest cause of Happiness` : 'Happiness keeps them' },
    graduation: {
      name: 'Graduation rate',
      value: now[4] === null ? 'No class has had its years' : `${percent(now[4]!)} of a class finishes`,
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
  };
  return ORDER.map((id, n) => {
    const number = now[n] ?? null;
    const before = last?.[n] ?? null;
    let trend: ScoreRow['trend'] = null;
    if (number !== null && before !== null && id !== 'yield') {
      const delta = number - before;
      const same = Math.abs(delta) <= Math.abs(before) * 0.005;
      const way = same ? 'same' : delta > 0 ? 'up' : 'down';
      trend = { way, good: same ? null : (delta > 0) === HIGHER_IS_BETTER[id] };
    }
    return { id, number, trend, ...rows[id] };
  });
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
