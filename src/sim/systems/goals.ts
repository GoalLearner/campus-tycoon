import { ERA_AT_RANK, ERA_AT_SIZE, ERAS, GOAL_SCALE, RANK_GOALS, SIZE_GOALS } from '../config/goals';
import { headCount } from '../format';
import { scaleOf } from '../scale';
import { enrollment } from '../selectors';
import type { GameState, Goals, LogEntry } from '../types';

/**
 * Size goals, rank goals and eras (DESIGN.md section 37).
 *
 * Only a game begun on the model campus has them: `state.goals` is null on
 * any other. A size goal lands only at an intake and a rank goal only on
 * rankings day. Once reached a goal is kept for good, whatever the campus
 * does afterwards, and an era is opened by whichever ladder gets there first.
 *
 * A goal gives a headline and a place in the list. `rewards` counts the free
 * buildings taken for size goals, and nothing gives one yet (37.7).
 */

export function newGoals(): Goals {
  return { size: 0, rank: 0, reached: [], rewards: 0 };
}

/** A size goal as this campus counts it. On the model campus at its own scale it is the number as written. */
export function sizeGoal(state: GameState, n: number): number {
  return Math.round(((SIZE_GOALS[n] ?? 0) * scaleOf(state)) / GOAL_SCALE);
}

/** The era a set of goals has opened: 0 is the start. */
export function eraOf(goals: Goals | null): number {
  if (!goals) return 0;
  let era = 0;
  for (let n = 0; n < ERA_AT_SIZE.length; n++) if (goals.size >= ERA_AT_SIZE[n]! || goals.rank >= ERA_AT_RANK[n]!) era = n + 1;
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
      ? `${state.school.name} has ${headCount(enrollment(state))} students. The ${one ? 'goal' : 'goals'} of ${list(names)} students ${one ? 'is' : 'are'} reached. ${kept}`
      : `${state.school.name} is No. ${state.field.rank} of 200 for academics. The ${one ? 'goal' : 'goals'} of the ${list(names)} ${one ? 'is' : 'are'} reached. ${kept}`;
  if (era > eraWas) text += ` The ${ERAS[era]} era begins.`;
  log.push({ tick: state.clock.tick, kind: 'goal', text, data: { keep: 1, ladder, count, from: was, era: era > eraWas ? era : -1 } });
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
