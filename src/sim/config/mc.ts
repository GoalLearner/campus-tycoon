/**
 * The Main Character (DESIGN.md 53.2, as built in section 57): one student
 * the player follows, chosen from any card. The phone's life system decides
 * what they do from their needs, their plan for the day and the campus's real
 * numbers, fully offline. They live on the player's real day: they wake when
 * the player's day starts and plan it then, once a real day (53.1). They
 * count toward the campus only as one student. Every size is [T].
 *
 * Tone (sections 16 and 52): plain and kind. Setbacks are normal and pass.
 * Drinking belongs to those of 21 and over, and always costs something.
 */

/** The life system decides every this many ticks: a quarter of a real hour. */
export const MC_STEP = 15;

export type LifeNeed = 'energy' | 'social' | 'fun' | 'study' | 'fitness';
export const NEEDS: readonly LifeNeed[] = ['energy', 'social', 'fun', 'study', 'fitness'];
export const NEED_NAMES: Record<LifeNeed, string> = { energy: 'Energy', social: 'Friends', fun: 'Fun', study: 'Studies', fitness: 'Fitness' };
/** What each need does on its own in a real hour: they all run down, energy fastest. */
export const NEED_DRIFT: Record<LifeNeed, number> = { energy: -4, social: -2.5, fun: -2.5, study: -1.5, fitness: -0.8 };
/** Below this a need is low, and the plan and the page say so. */
export const NEED_LOW = 35;

export type ActivityId = 'sleep' | 'class' | 'study' | 'eat' | 'friends' | 'workout' | 'club' | 'job' | 'party' | 'rest';

export interface ActivitySpec {
  name: string;
  /** What it does to each need in a real hour, on top of the drift. */
  gives: Partial<Record<LifeNeed, number>>;
  /** What it costs in a real hour, in dollars: below zero earns. */
  spend: number;
  /** The words for the page and the timeline: "At the library". */
  doing: string;
}

export const ACTIVITIES: Record<ActivityId, ActivitySpec> = {
  sleep: { name: 'Sleep', gives: { energy: 16 }, spend: 0, doing: 'Asleep' },
  class: { name: 'Class', gives: { study: 6, energy: -1 }, spend: 0, doing: 'In class' },
  study: { name: 'Study', gives: { study: 10, fun: -2, energy: -1 }, spend: 0, doing: 'Studying' },
  eat: { name: 'Eat', gives: { energy: 6, social: 2 }, spend: 4, doing: 'Eating' },
  friends: { name: 'Friends', gives: { social: 12, fun: 5 }, spend: 2, doing: 'With friends' },
  workout: { name: 'Work out', gives: { fitness: 12, fun: 3, energy: -3 }, spend: 0, doing: 'Working out' },
  club: { name: 'Club', gives: { social: 8, fun: 6 }, spend: 0, doing: 'At their club' },
  job: { name: 'Work a shift', gives: { energy: -2, fun: -2 }, spend: -14, doing: 'At their campus job' },
  party: { name: 'Party', gives: { fun: 14, social: 10, energy: -3 }, spend: 10, doing: 'At a party' },
  rest: { name: 'Rest', gives: { energy: 5, fun: 3 }, spend: 0, doing: 'Resting in their room' },
};

/** The hours of the Main Character's day, counted from when the player's day starts (about 7 in the morning). */
export const DAY_HOURS = {
  /** Asleep from this hour on: about 11 at night, or later after a party. */
  bed: 16,
  partyBed: 18,
  /** Classes on a weekday in term, in these hours: about 9 to 2. */
  classFrom: 2,
  classTo: 7,
  /** Meals near these hours. */
  meals: [0.5, 5.5, 11.5],
  /** A party is from this hour on a party night. */
  partyFrom: 14,
} as const;

/** The nights of the week, Monday 0, with parties: Thursday, Friday and Saturday. */
export const PARTY_NIGHTS: readonly number[] = [3, 4, 5];
/** What a hangover costs the morning after: so much energy when they wake. */
export const HANGOVER_ENERGY = 20;

/** A day of the week, Monday 0 to Sunday 6, on which the Main Character's club meets. */
export const CLUB_DAYS: readonly number[] = [1, 3];

/** Dollars a real day from home, to start, and for a broke student who takes a campus job. */
export const ALLOWANCE = 25;
export const START_MONEY = 300;
/** Under this, money is short: the plan looks for shifts. */
export const MONEY_LOW = 60;

/** How much the plan lifts the activities it names. */
export const PLAN_LIFT = 8;

/** How a semester's grades follow what they did: the study need's average against a middling 55, and classes attended. */
export const GPA_FROM_STUDY = 0.012;
export const GPA_STUDY_MIDDLE = 55;
export const GPA_FROM_CLASSES = 0.5;

/** The Dean's list. */
export const DEANS_LIST = 3.5;

/** At most so many big moments a real day (53.1): two or three. */
export const BIG_PER_DAY = 2;

/** Closeness, 0 to 100: so much more for each real hour together, so much less for each real day apart. */
export const CLOSER_PER_HOUR = 1;
export const APART_PER_DAY = 2;
/** A friend becomes a close friend here. */
export const CLOSE_FRIEND = 70;

/** The traits of the people around them (53.2): problems come from who they are, and so do the good things. */
export type CastTrait = 'tidy' | 'messy' | 'loud' | 'quiet' | 'nightOwl' | 'earlyBird' | 'clingy' | 'jealous' | 'generous' | 'funny' | 'studious' | 'sporty';
export const CAST_TRAITS: Record<CastTrait, { name: string; sleep?: number; closer?: number; study?: number; fitness?: number }> = {
  tidy: { name: 'Tidy' },
  messy: { name: 'Messy', sleep: -1 },
  loud: { name: 'Loud', sleep: -3 },
  quiet: { name: 'Quiet', sleep: 1 },
  nightOwl: { name: 'Night owl', sleep: -2 },
  earlyBird: { name: 'Early bird', sleep: -1 },
  clingy: { name: 'Clingy', closer: 1 },
  jealous: { name: 'Jealous', closer: -1 },
  generous: { name: 'Generous', closer: 1 },
  funny: { name: 'Funny', closer: 1 },
  studious: { name: 'Studious', study: 1 },
  sporty: { name: 'Sporty', fitness: 1 },
};
export const CAST_TRAIT_IDS = Object.keys(CAST_TRAITS) as CastTrait[];

/** The goals a Main Character may hold: two, by their nature. */
export type GoalId = 'deansList' | 'friends' | 'fit' | 'savings' | 'onTime' | 'fun';
export const GOALS: Record<GoalId, { name: string; plan: string }> = {
  deansList: { name: 'Make the Dean’s list', plan: 'the Dean’s list needs a 3.5' },
  friends: { name: 'Find their people', plan: 'a good friend or two makes a place home' },
  fit: { name: 'Get fit', plan: 'half an hour of working out, most days' },
  savings: { name: 'Keep some money in the bank', plan: 'a shift or two keeps the account above zero' },
  onTime: { name: 'Graduate on time', plan: 'every class counts toward finishing in four years' },
  fun: { name: 'Have the full college experience', plan: 'it only happens once' },
};
/** Goals by nature, the first two that suit. */
export const GOALS_BY_NATURE: Partial<Record<string, readonly GoalId[]>> = {
  scholar: ['deansList', 'onTime'],
  stressed: ['deansList', 'friends'],
  slacker: ['fun', 'onTime'],
  butterfly: ['friends', 'fun'],
  broke: ['savings', 'onTime'],
  party: ['fun', 'friends'],
  clown: ['friends', 'fun'],
  charmer: ['friends', 'fit'],
  attention: ['fun', 'fit'],
  ra: ['friends', 'onTime'],
  commuter: ['onTime', 'savings'],
};
export const DEFAULT_GOALS: readonly GoalId[] = ['onTime', 'friends'];

/** How many entries the timeline keeps. Older ones go; the hall of fame keeps a shorter story. */
export const MEMORY_KEPT = 80;
export const FAME_STORY_KEPT = 24;
