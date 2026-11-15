import { OFFICIAL_A_DAY, VIRAL_FADE_WEEKS, VIRAL_REACH_MOST } from '../config/quadline';
import { TICKS_PER_DAY } from '../config/time';
import { WEB_WEEK_TICKS } from '../config/web';
import type { GameState, OfficialPost } from '../types';

/**
 * What Quadline does to the campus that a tick reads (DESIGN.md 63.14), kept apart from the app's posts so the
 * campus's own reads stay light: how viral posts move the school's reach, and what the university's official account
 * has set going (the feed's mood, speaking up against picking on someone).
 */

/** How long an official post is felt, and a viral post's pull on the reach: two game weeks. */
export const OFFICIAL_FADE = 2 * WEB_WEEK_TICKS;
/** How much one well-timed official post warms the feed (fewer rough posts), or one off-key post sours it. */
export const OFFICIAL_MOOD = 0.06;
export const OFFICIAL_MOOD_MOST = 0.15;

const fade = (age: number, span: number): number => (age < 0 ? 1 : Math.max(0, 1 - age / span));

/** The account's posts, newest last; missing is none. */
export function officialPosts(state: GameState): OfficialPost[] {
  return state.web.official ?? [];
}

/** Its posts in the last real day: at most OFFICIAL_A_DAY (decision 8). */
export function officialToday(state: GameState): number {
  return officialPosts(state).filter((post) => state.clock.tick - post.tick < TICKS_PER_DAY).length;
}

export function officialLeft(state: GameState): number {
  return Math.max(0, OFFICIAL_A_DAY - officialToday(state));
}

/**
 * How the account has set the feed's mood (63.14): each post well-timed (+1) or off-key (-1), fading over two game
 * weeks. Above 0, fewer students post in a rough mood; below 0, more. Small: the feed is theirs.
 */
export function officialMood(state: GameState): number {
  let mood = 0;
  for (const post of officialPosts(state)) mood += post.fit * OFFICIAL_MOOD * fade(state.clock.tick - post.tick, OFFICIAL_FADE);
  return Math.max(-OFFICIAL_MOOD_MOST, Math.min(OFFICIAL_MOOD_MOST, mood));
}

/** True for two game weeks after the account speaks up against picking on someone (kindness week, 63.14). */
export function speakingUp(state: GameState): boolean {
  return officialPosts(state).some((post) => post.kind === 'announce' && post.about === 'kindness' && state.clock.tick - post.tick < OFFICIAL_FADE);
}

/** True when the account has answered the viral post that went up at `at`. */
export function answered(state: GameState, at: number): boolean {
  return officialPosts(state).some((post) => post.kind === 'respond' && post.about.endsWith(`:${at}`));
}

/**
 * How viral posts move the school's reach now (decision 7, "Light", through reach: main's decision of 2026-11-14):
 * each seen beyond campus widens or narrows it, fading over two game weeks; one the account has answered, if it was
 * bad, narrows it half as much from then. At most 3% either way, all of them together.
 */
export function viralReach(state: GameState): number {
  let reach = 0;
  for (const one of state.web.effects?.viral ?? []) {
    const left = fade(state.clock.tick - one.at, VIRAL_FADE_WEEKS * WEB_WEEK_TICKS);
    reach += one.size * left * (one.size < 0 && answered(state, one.at) ? 0.5 : 1);
  }
  return Math.max(-VIRAL_REACH_MOST, Math.min(VIRAL_REACH_MOST, reach));
}
