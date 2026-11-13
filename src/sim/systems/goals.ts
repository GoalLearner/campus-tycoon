import { ENROLLMENT_CAP, ERA_AT_RANK, ERAS, GOAL_SCALE, RANK_GOALS, SIZE_GOALS, SIZE_GOALS_ONCE } from '../config/goals';
import { PLACED, RANK_REWARDS } from '../config/placed';
import { POLICIES } from '../config/policies';
import { headCount } from '../format';
import { scaleOf } from '../scale';
import { enrollment } from '../selectors';
import type { GameState, Goals, LogEntry, PlacedType } from '../types';
import { dailyOnGoals } from './daily';
import { bigBuildsOpening } from './bigBuilds';

/**
 * The cap, the goals and the eras (DESIGN.md sections 37 and 38.4).
 *
 * Only a game begun on the model campus has them: `state.goals` is null on
 * any other. Such a game never enrols more than its cap. It has one size
 * goal, a full campus, which lands only at an intake, and eight rank goals,
 * which land only on rankings day and are the long climb. Once reached a
 * goal is kept for good, whatever the campus does afterwards. The rank opens
 * the eras.
 *
 * A goal gives a headline and a place in the list. A rank goal also gives a
 * building (section 40): it waits in the Build menu, free, until it is
 * placed, and is there again if it is ever cleared. Which are waiting is
 * worked out from the goals reached and the map, so nothing more is saved
 * and a reward can never be lost.
 */

export function newGoals(): Goals {
  return { size: 0, rank: 0, reached: [], rewards: 0 };
}

/**
 * The most students this campus may enrol, or null on a game with no goals,
 * which has no cap. On the model campus at its own scale it is the number as
 * written.
 */
export function enrollmentCap(state: GameState): number | null {
  return state.goals ? Math.round((ENROLLMENT_CAP * scaleOf(state)) / GOAL_SCALE) : null;
}

/** How many more students the cap leaves room for. Infinity on a game with no cap. */
export function roomUnderCap(state: GameState, students = enrollment(state)): number {
  const cap = enrollmentCap(state);
  return cap === null ? Infinity : Math.max(0, cap - students);
}

/**
 * A size goal as this campus counts it. On the model campus at its own scale
 * it is the number as written. The first is the one there is now. The rest
 * are the goals above 50,000 that a save from before the cap may have kept.
 */
export function sizeGoal(state: GameState, n: number): number {
  return Math.round(((SIZE_GOALS_ONCE[n] ?? 0) * scaleOf(state)) / GOAL_SCALE);
}

/** The era a set of goals has opened: 0 is the start. The rank opens one, and one already opened is never closed. */
export function eraOf(goals: Goals | null): number {
  if (!goals) return 0;
  let era = 0;
  for (let n = 0; n < ERA_AT_RANK.length; n++) if (goals.rank >= ERA_AT_RANK[n]!) era = n + 1;
  for (const entry of goals.reached) if (entry.ladder === 'era' && entry.n > era) era = entry.n;
  return era;
}

export function eraName(goals: Goals | null): string {
  return ERAS[eraOf(goals)] ?? ERAS[0]!;
}

/** The next size goal and how many students short of it the campus is, or null when every one is reached or there are none. */
export function nextSizeGoal(state: GameState): { goal: number; toGo: number } | null {
  const goals = state.goals;
  if (!goals || goals.size >= SIZE_GOALS.length) return null;
  const goal = sizeGoal(state, goals.size);
  return { goal, toGo: Math.max(0, goal - enrollment(state)) };
}

/** The next rank goal, as "Top 125" reads it, or null when every one is reached or there are none. */
export function nextRankGoal(state: GameState): number | null {
  const goals = state.goals;
  if (!goals || goals.rank >= RANK_GOALS.length) return null;
  return RANK_GOALS[goals.rank]!;
}

const list = (parts: string[]): string => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

// ------------------------------------------------------ what an era opens --

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/**
 * What an era opens, in words (DESIGN.md section 41), or '' for one that
 * opens nothing: "the Policies page, with four switches: ..." for the first
 * era that has policies, and "two more policies: ..." for a later one. It is
 * read from the list of policies, so it says whatever that list holds.
 */
export function eraOpens(era: number): string {
  // Greek Row's two switches show with the first chapter house, not with the era (DESIGN.md 51): the era names the row.
  const names = POLICIES.filter((spec) => spec.era === era && !spec.greek).map((spec) => spec.name);
  // The big builds it opens (DESIGN.md 45) come first: they are what the era is named for.
  const builds = bigBuildsOpening(era);
  if (names.length === 0) return builds;
  const count = COUNT_WORDS[names.length] ?? String(names.length);
  const first = !POLICIES.some((spec) => spec.era < era);
  const policies = first ? `the Policies page, with ${count} ${names.length === 1 ? 'switch' : 'switches'}: ${list(names)}` : `${count} more ${names.length === 1 ? 'policy' : 'policies'}: ${list(names)}`;
  const greek = era === 1 ? '; and Greek Row, with chapter houses in the Build menu' : '';
  return `${builds ? `${builds}; and ${policies}` : policies}${greek}`;
}

/** The next era this game has not reached, with the rank that opens it and what it will open. null when there is none left, or on a game with no eras. */
export function nextEra(state: GameState): { era: number; name: string; top: number; opens: string } | null {
  if (!state.goals) return null;
  const era = eraOf(state.goals) + 1;
  const at = ERA_AT_RANK[era - 1];
  if (at === undefined || ERAS[era] === undefined) return null;
  return { era, name: ERAS[era]!, top: RANK_GOALS[at - 1]!, opens: eraOpens(era) };
}

// ---------------------------------------------------- a building for a goal --

/** The building a rank goal gives: 0 is the Top 175. undefined past the last. */
export function rewardOf(n: number): PlacedType | undefined {
  return RANK_REWARDS[n];
}

/** Which rank goal gives a building, counting from 0, or -1 for a building no goal gives. */
export function rewardGoal(type: PlacedType): number {
  return RANK_REWARDS.indexOf(type);
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The buildings this game has earned, in the order of its goals. None on a game with no goals. */
export function rewardsEarned(state: GameState): PlacedType[] {
  const reached = state.goals ? Math.min(state.goals.rank, RANK_REWARDS.length) : 0;
  return RANK_REWARDS.slice(0, reached);
}

/** Those of them not on the map: what the Build menu offers, free. A cleared one is here again. */
export function rewardsWaiting(state: GameState): PlacedType[] {
  const earned = rewardsEarned(state);
  if (earned.length === 0) return earned;
  const standing = new Set<PlacedType>();
  for (const placed of state.map.placed) if (placed) standing.add(placed.type);
  return earned.filter((type) => !standing.has(type));
}

/** A building as a sentence names it: "the Bell Tower". Two go by their own names with no "the". */
export function rewardName(type: PlacedType): string {
  const name = PLACED[type].name;
  return type === 'fountain' || type === 'radio' ? name : `the ${name}`;
}

function land(state: GameState, log: LogEntry[], ladder: 'size' | 'rank', count: number): void {
  const goals = state.goals;
  if (!goals) return;
  const was = ladder === 'size' ? goals.size : goals.rank;
  if (count <= was) return;
  const eraWas = eraOf(goals);
  const year = Math.max(1, state.clock.week.year);
  const names: string[] = [];
  for (let n = was; n < count; n++) {
    goals.reached.push({ ladder, n, year });
    names.push(ladder === 'size' ? headCount(sizeGoal(state, n)) : `Top ${RANK_GOALS[n]}`);
  }
  if (ladder === 'size') goals.size = count;
  else goals.rank = count;
  const era = eraOf(goals);
  for (let n = eraWas + 1; n <= era; n++) goals.reached.push({ ladder: 'era', n, year });

  const one = names.length === 1;
  const kept = one ? 'It is kept for good.' : 'They are kept for good.';
  let text =
    ladder === 'size'
      ? `${state.school.name} has ${headCount(enrollment(state))} students: the campus is full. The ${one ? 'goal' : 'goals'} of ${list(names)} students ${one ? 'is' : 'are'} reached. ${kept}`
      : `${state.school.name} is No. ${state.field.rank} of 200 for academics. The ${one ? 'goal' : 'goals'} of the ${list(names)} ${one ? 'is' : 'are'} reached. ${kept}`;
  // A rank goal gives its building (section 40): free, in the Build menu, for as long as it is not on the map.
  const given = ladder === 'rank' ? RANK_REWARDS.slice(was, count) : [];
  if (given.length > 0) text += ` ${capital(list(given.map(rewardName)))} ${given.length === 1 ? 'is' : 'are'} yours to place, free, from the Build menu.`;
  // Gold Seals for each goal and each era (section 42.7), said before the era so the era's own words end the line.
  // The experience may reach a level: its line follows the goal's.
  const after: LogEntry[] = [];
  const sealsGiven = dailyOnGoals(state, ladder, count - was, era - eraWas, after);
  if (sealsGiven > 0) text += ` ${one ? 'It brings' : 'They bring'} ${sealsGiven} Gold Seals.`;
  // An era says what it opens (section 41). A day that opens two says both.
  for (let n = eraWas + 1; n <= era; n++) {
    const opens = eraOpens(n);
    text += ` The ${ERAS[n]} era begins.${opens ? ` It opens ${opens}.` : ''}`;
  }
  log.push({ tick: state.clock.tick, kind: 'goal', text, data: { keep: 1, ladder, count, from: was, era: era > eraWas ? era : -1 } });
  log.push(...after);
}

/** At an intake, once the class has moved in: every size goal the campus now stands at or above is reached. */
export function landSizeGoals(state: GameState, log: LogEntry[]): void {
  const goals = state.goals;
  if (!goals) return;
  const students = enrollment(state);
  let count = goals.size;
  while (count < SIZE_GOALS.length && students >= sizeGoal(state, count)) count += 1;
  land(state, log, 'size', count);
}

/** On rankings day, once the rank is published: every rank goal it stands at or above is reached. */
export function landRankGoals(state: GameState, log: LogEntry[]): void {
  const goals = state.goals;
  const rank = state.field.rank;
  if (!goals || rank <= 0) return;
  let count = goals.rank;
  while (count < RANK_GOALS.length && rank <= RANK_GOALS[count]!) count += 1;
  land(state, log, 'rank', count);
}

/** The goals reached, newest first, as the Size panel lists them: "Year 3 · 55,000 students". */
export function goalsReached(state: GameState): string[] {
  const goals = state.goals;
  if (!goals) return [];
  return [...goals.reached].reverse().map((entry) => {
    const what = entry.ladder === 'size' ? `${headCount(sizeGoal(state, entry.n))} students` : entry.ladder === 'rank' ? `Top ${RANK_GOALS[entry.n]}` : `The ${ERAS[entry.n]} era`;
    return `Year ${entry.year} · ${what}`;
  });
}
