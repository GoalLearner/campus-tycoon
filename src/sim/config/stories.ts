import type { CastMember } from '../types';
import type { ActivityId, CastTrait, GoalId, LifeNeed } from './mc';

/**
 * The story system (DESIGN.md 53.3, as built in section 58). Arcs and events
 * are data: a new one is an entry in `src/sim/config/storyLibrary.ts`, never
 * code. An arc has stages; at each stage the Main Character makes a choice
 * (the phone's rules pick it, from who they are), the game rolls the outcome
 * from real numbers, and the outcome changes their needs, grades, Stress,
 * Happiness, money or the people around them. Arcs chain into arcs. An event
 * is one stage. Failure always leads somewhere: a bad outcome is a story
 * too. The president shapes the odds through the campus, never the choices.
 *
 * Tone (sections 16 and 52): plain and kind; setbacks are normal and pass.
 * Never anything on the "still out" list of 52.1. Every size is [T].
 */

export type StoryCategory = 'roommates' | 'classes' | 'dating' | 'partying' | 'social' | 'money' | 'greek' | 'teams' | 'good';

/** What the odds may read, each 0 to 1. `effort.*` is hours of an activity lately against a full week's worth. */
export type OddsRead =
  | 'need.energy'
  | 'need.social'
  | 'need.fun'
  | 'need.study'
  | 'need.fitness'
  | 'effort.study'
  | 'effort.workout'
  | 'effort.friends'
  | 'effort.club'
  | 'effort.job'
  | 'gpa'
  | 'close.roommate'
  | 'close.friend'
  | 'close.partner'
  | 'close.crush'
  | 'campus.recreation'
  | 'campus.library'
  | 'campus.social'
  | 'campus.classes'
  | 'campus.teaching'
  | 'campus.safety'
  | 'campus.ra'
  | 'campus.oversight'
  | 'campus.parties'
  | 'campus.jobs'
  | 'campus.aid'
  | 'campus.dining'
  | 'campus.team';

/**
 * One part of the odds: `weight` times how far its read is from a middling 0.5. `up` is what helped, said as "helped by
 * {up}"; `down` what held it back, "held back by {down}".
 */
export interface OddsPart {
  read: OddsRead;
  weight: number;
  up: string;
  down: string;
}

export interface Odds {
  /** The chance of the good outcome at a middling everything. */
  base: number;
  parts: readonly OddsPart[];
}

export type StoryEffect =
  | { t: 'need'; need: LifeNeed; by: number }
  /** Points on their Happiness and their Stress, fading each day. */
  | { t: 'mood'; by: number }
  | { t: 'stress'; by: number }
  /** Grade points on this semester's grades. */
  | { t: 'gpa'; by: number }
  | { t: 'money'; by: number }
  | { t: 'close'; role: CastMember['role']; by: number }
  /** Who is around them changes: a new friend, a crush becomes a partner, a breakup, a new crush, a new roommate. */
  | { t: 'cast'; change: 'newFriend' | 'crushToPartner' | 'breakup' | 'newCrush' | 'newRoommate' }
  | { t: 'job'; job: string | null }
  | { t: 'greek'; join: boolean }
  | { t: 'team'; join: boolean };

export interface Outcome {
  /** A few words for the odds line: "Made the team". */
  title: string;
  text: string;
  effects: readonly StoryEffect[];
  /** What comes next: the arc's next stage (the default), the end, or another arc by its id, which begins. */
  next?: 'end' | string;
  /** A key moment: announced, and on the phone. */
  big?: true;
}

/** Whom the phone's rules lean toward a choice for. */
export interface Lean {
  natures?: readonly string[];
  traits?: readonly CastTrait[];
  goals?: readonly GoalId[];
  low?: readonly LifeNeed[];
  /** A weight of its own, before the leans. */
  base?: number;
}

export interface Choice {
  /** What they do, said as "{name} {label}". */
  label: string;
  lean?: Lean;
  /** null when it cannot go wrong. */
  odds: Odds | null;
  good: Outcome;
  bad?: Outcome;
}

export interface Stage {
  /** What happens, as the scene opens. */
  text: string;
  /** Real hours after the stage before (or after the arc begins) that this one comes. */
  hours: number;
  choices: readonly Choice[];
  /** Said some hours before the stage comes: a cliffhanger, on the phone. */
  cliff?: string;
}

/** What must be true for a story to begin. */
export type StoryNeed =
  | 'roommate'
  | 'partner'
  | 'crush'
  | 'single'
  | 'friend'
  | 'greekRow'
  | 'member'
  | 'notMember'
  | 'team'
  | 'notTeam'
  | 'season'
  | 'over21'
  | 'freshman'
  | 'job'
  | 'noJob'
  | 'club'
  | 'term';

export interface StorySpec {
  id: string;
  category: StoryCategory;
  /** The chapter's title in the Story tab. */
  title: string;
  kind: 'arc' | 'event';
  /** A heavy theme (52.2): hazing, a breakup, cheating, failing. Rationed by the storyteller. */
  heavy?: true;
  /** A good arc, mixed in so life is not nonstop crisis (53.5). */
  good?: true;
  weight: number;
  needs?: readonly StoryNeed[];
  /** Where on the calendar it lands, where it can (53.5): rush week, the football season, exams. */
  calendar?: 'rush' | 'season' | 'exams';
  stages: readonly Stage[];
}

// ------------------------------------------------------------ the storyteller --

/** The storyteller looks in once a real hour. */
export const STORY_STEP = 60;
/** One main arc and up to two side arcs or events at a time (53.5). */
export const SIDE_MOST = 2;
/** Quiet stretches: real hours after one story begins before another may. */
export const QUIET_HOURS = { arc: 10, event: 6 } as const;
/** The chance in a real hour that a side event begins, once the quiet stretch is over. */
export const EVENT_CHANCE = 0.12;
/** After a heavy story ends, real hours before another may begin; and the same arc again. */
export const HEAVY_COOLDOWN_HOURS = 48;
export const REPEAT_COOLDOWN_HOURS = 7 * 24;
/** A good story is this many times likelier after a bad outcome. */
export const GOOD_AFTER_BAD = 2.5;
/** The odds never go past these. */
export const ODDS_RANGE = { low: 0.08, high: 0.92 } as const;
/** A cliffhanger is said this many real hours before its stage. */
export const CLIFF_HOURS = 6;

/** Effort: hours of each activity lately that count as a full week's worth. */
export const EFFORT_FULL: Partial<Record<ActivityId, number>> = { study: 30, workout: 10, friends: 25, club: 6, job: 15 };
/** Lately: each day what came before counts this much less. */
export const RECENT_FADE = 0.85;
/** What the story did to mood and Stress fades by this share each day. */
export const STORY_FADE = 0.25;
/** The team, in words. */
export const TEAM_NAME = 'the track team';
