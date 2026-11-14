import {
  ACTIVITIES,
  ALLOWANCE,
  APART_PER_DAY,
  BIG_PER_DAY,
  CLOSE_FRIEND,
  CLOSER_PER_HOUR,
  CLUB_DAYS,
  DAY_HOURS,
  DEANS_LIST,
  DEFAULT_GOALS,
  FAME_STORY_KEPT,
  GOALS,
  GOALS_BY_NATURE,
  GPA_FROM_CLASSES,
  GPA_FROM_STUDY,
  GPA_STUDY_MIDDLE,
  MC_STEP,
  MEMORY_KEPT,
  MONEY_LOW,
  HANGOVER_ENERGY,
  PARTY_NIGHTS,
  NEED_DRIFT,
  NEED_LOW,
  NEED_NAMES,
  NEEDS,
  PLAN_LIFT,
  START_MONEY,
  CAST_TRAIT_IDS,
  CAST_TRAITS,
  type ActivityId,
  type GoalId,
  type LifeNeed,
  type CastTrait,
} from '../config/mc';
import { DRINKING_YEAR } from '../config/parties';
import { FIRST_NAMES, SURNAME_ENDS, SURNAME_STARTS } from '../config/students';
import { ANCHOR_AFTER_WAKE_TICKS, DEFAULT_WAKE_HOUR, TICK_MS } from '../config/time';
import { dollars } from '../format';
import { hashInts } from '../rng';
import type { CastMember, FameEntry, GameState, LogEntry, MainCharacter, MemoryEntry, PlanItem, Story } from '../types';
import { partiesInTown, partiesOn } from './parties';
import { dayRead, libraryShare } from './season';
import { classYearOf, sampleStudents, socialLife, studentCard, type StudentRef } from './students';
import { approvalAt } from './happiness';

/**
 * The Main Character (DESIGN.md 53.2, as built in section 57). One student
 * the player follows, chosen from any student card, stored in the save with
 * their needs, goals, money, the people around them and a timeline. The
 * phone's life system decides what they do every quarter of a real hour, from
 * their needs, their plan for the day and the campus's real numbers. It reads
 * the campus and changes nothing in it: they count only as one student, and
 * draw nothing from the game's random streams.
 *
 * They live on the player's real day: they wake when the player's day starts
 * and plan the day then, once a real day (53.1).
 */

export function newStory(): Story {
  return { mc: null, fame: [], nextCast: 1, news: [] };
}

const clamp = (n: number, low = 0, high = 100): number => Math.max(low, Math.min(high, n));
const roll = (state: GameState, ...salt: number[]): number => (hashInts(state.seed, 7001, ...salt) % 100_000) / 100_000;

// ------------------------------------------------------------- the clock --

/** The minute of the UTC day the player's day starts: two hours before the anchor, or seven in the morning. */
function wakeMinute(state: GameState): number {
  const anchor = state.clock.anchor;
  return anchor === null ? DEFAULT_WAKE_HOUR * 60 : (((anchor - ANCHOR_AFTER_WAKE_TICKS) % 1440) + 1440) % 1440;
}

/** The real minute, counted from the epoch, of the tick just run. */
function realMinute(state: GameState): number {
  return Math.floor((state.clock.nextTickAt - TICK_MS) / 60_000);
}

/** The Main Character's day: its number, the hour of it (0 when the player's day starts), and the weekday, Monday 0. */
export function mcDay(state: GameState): { day: number; hour: number; weekday: number } {
  const shifted = realMinute(state) - wakeMinute(state);
  const day = Math.floor(shifted / 1440);
  const hour = (shifted - day * 1440) / 60;
  // The first of January 1970 was a Thursday: 3 counting from Monday.
  return { day, hour, weekday: (((day + 3) % 7) + 7) % 7 };
}

// --------------------------------------------------------- choosing one --

function personName(state: GameState, salt: number): string {
  const h = (n: number): number => hashInts(state.seed, 7003, salt, n);
  return `${FIRST_NAMES[h(1) % FIRST_NAMES.length]} ${SURNAME_STARTS[h(2) % SURNAME_STARTS.length]}${SURNAME_ENDS[h(3) % SURNAME_ENDS.length]}`;
}

function traitsFor(state: GameState, salt: number): CastTrait[] {
  const first = CAST_TRAIT_IDS[hashInts(state.seed, 7005, salt, 1) % CAST_TRAIT_IDS.length]!;
  let second = CAST_TRAIT_IDS[hashInts(state.seed, 7005, salt, 2) % CAST_TRAIT_IDS.length]!;
  if (second === first) second = CAST_TRAIT_IDS[(CAST_TRAIT_IDS.indexOf(first) + 5) % CAST_TRAIT_IDS.length]!;
  return [first, second];
}

function castMember(state: GameState, role: CastMember['role'], closeness: number, avoid: readonly string[]): CastMember {
  const story = state.story;
  const id = story.nextCast;
  story.nextCast += 1;
  let name = personName(state, id);
  for (let n = 1; avoid.includes(name) && n < 20; n++) name = personName(state, id * 31 + n);
  return { id, role, name, traits: traitsFor(state, id), closeness, since: state.clock.tick };
}

/** Why a student cannot be made the Main Character now, or null when they can. */
export function cannotMakeMain(state: GameState, ref: StudentRef): string | null {
  if (!state.story) return 'This campus has no stories yet.';
  if (classYearOf(state, ref) === null) return 'They are no longer enrolled.';
  const mc = state.story.mc;
  if (mc && mc.ref.entryYear === ref.entryYear && mc.ref.index === ref.index) return 'They are your main character already.';
  return null;
}

function remember(state: GameState, mc: MainCharacter, text: string, big = false, log?: LogEntry[]): void {
  const entry: MemoryEntry = { tick: state.clock.tick, text };
  // Key moments are kept to two or three a real day (53.1): past that, a moment is remembered, not announced.
  if (big) {
    const day = mcDay(state).day;
    if (mc.big.day !== day) mc.big = { day, count: 0 };
    if (mc.big.count < BIG_PER_DAY) {
      entry.big = true;
      mc.big.count += 1;
    }
  }
  mc.memory.push(entry);
  if (mc.memory.length > MEMORY_KEPT) mc.memory.splice(0, mc.memory.length - MEMORY_KEPT);
  if (log) log.push({ tick: state.clock.tick, kind: 'mc', text, data: entry.big ? { big: 1, name: mc.name, day: mcDay(state).day } : { name: mc.name } });
  else state.story.news.push(text);
}

/** Lines from an action, said on the next tick. */
export function tellMain(state: GameState, log: LogEntry[]): void {
  const news = state.story?.news;
  if (!news || news.length === 0) return;
  for (const text of news) log.push({ tick: state.clock.tick, kind: 'mc', text, data: { name: state.story.mc?.name ?? '' } });
  state.story.news = [];
}

/**
 * Make a student the Main Character. One at a time: the one before goes to the hall of fame, set aside. Their name,
 * major and nature come from their card; the people around them are made now and stored.
 */
export function makeMain(state: GameState, ref: StudentRef): string | null {
  const why = cannotMakeMain(state, ref);
  if (why) return why;
  const card = studentCard(state, ref);
  if (!card) return 'They are no longer enrolled.';
  if (state.story.mc) retire(state, state.story.mc, 'setAside', null);
  const nature = card.archetype;
  const goals = [...(GOALS_BY_NATURE[nature] ?? DEFAULT_GOALS)] as GoalId[];
  const avoid = [card.name];
  const cast: CastMember[] = [];
  const add = (role: CastMember['role'], closeness: number): void => {
    const one = castMember(state, role, closeness, avoid);
    avoid.push(one.name);
    cast.push(one);
  };
  if (card.residence !== 'offCampus') add('roommate', 45);
  add('friend', 40);
  add('friend', 25);
  if (card.relationship.id === 'togetherHappy' || card.relationship.id === 'togetherUnhappy' || card.relationship.id === 'distanceHappy' || card.relationship.id === 'distanceStruggling') add('partner', card.relationship.id.endsWith('Happy') ? 70 : 45);
  else if (card.relationship.id === 'singleLooking') add('crush', 20);
  const mc: MainCharacter = {
    ref: { entryYear: ref.entryYear, index: ref.index },
    name: card.name,
    major: card.major,
    nature,
    quirk: card.quirk,
    chosen: state.clock.tick,
    needs: { energy: 70, social: 50, fun: 55, study: 50, fitness: 50 },
    goals,
    plan: null,
    doing: { activity: 'rest', since: state.clock.tick, why: 'Just chosen' },
    cast,
    memory: [],
    money: START_MONEY,
    gpa: null,
    semesters: 0,
    term: { study: 0, steps: 0, attended: 0, classes: 0 },
    today: {},
    job: nature === 'broke' ? 'Library desk' : null,
    club: card.club,
    hangover: false,
    big: { day: mcDay(state).day, count: 0 },
  };
  state.story.mc = mc;
  remember(state, mc, `${mc.name} is your main character: a ${card.classYearName.toLowerCase()} in ${mc.major}, ${articled(card.archetypeName)}. Their goals: ${goals.map((goal) => GOALS[goal].name.toLowerCase()).join(' and ')}.`);
  makePlan(state, mc, null);
  return null;
}

/** Set the Main Character aside: they go to the hall of fame, and the player may choose another. */
export function setAsideMain(state: GameState): string | null {
  const mc = state.story?.mc;
  if (!mc) return 'There is no main character to set aside.';
  retire(state, mc, 'setAside', null);
  return null;
}

const articled = (name: string): string => `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;

function retire(state: GameState, mc: MainCharacter, status: FameEntry['status'], log: LogEntry[] | null): void {
  const year = state.clock.week.year;
  const from = Math.max(1, mc.ref.entryYear);
  const story = [...mc.memory.filter((one) => one.big), ...mc.memory.slice(-6)].filter((one, n, all) => all.indexOf(one) === n).sort((a, b) => a.tick - b.tick).slice(-FAME_STORY_KEPT);
  state.story.fame.push({ name: mc.name, major: mc.major, years: `Year ${from} to Year ${year}`, status, gpa: mc.gpa, story, tick: state.clock.tick });
  state.story.mc = null;
  if (log) {
    const said = status === 'graduated' ? `${mc.name} graduated${mc.gpa !== null ? ` with a ${mc.gpa.toFixed(2)}` : ''}. Their story is in the hall of fame, and a new main character can be chosen.` : `${mc.name} left the school. Their story is in the hall of fame, and a new main character can be chosen.`;
    log.push({ tick: state.clock.tick, kind: 'mc', text: said, data: { big: 1, name: mc.name, day: mcDay(state).day, retired: 1 } });
  }
}

/** A student the game suggests from the newest class, when there is no Main Character: the same one all year. */
export function suggestMain(state: GameState): StudentRef | null {
  if (!state.story || state.story.mc) return null;
  const year = state.clock.week.year;
  const newest = sampleStudents(state, 40).filter((ref) => ref.entryYear === year);
  const pool = newest.length > 0 ? newest : sampleStudents(state, 40);
  const fine = pool.filter((ref) => {
    const card = studentCard(state, ref);
    return card !== null && card.residence !== 'offCampus';
  });
  const list = fine.length > 0 ? fine : pool;
  return list.length > 0 ? list[hashInts(state.seed, 7007, year) % list.length]! : null;
}

// ------------------------------------------------------------ the plan --

interface Places {
  recreation: number;
  dining: number;
  library: number;
  social: number;
  /** True when a party on campus is possible: parties exist and the campus is not dry. */
  parties: boolean;
  exams: boolean;
  term: boolean;
}

let placesMemo: { state: GameState; day: number; places: Places } | null = null;

/** What the campus offers the Main Character today: read once a day from the real numbers at their home. */
function placesFor(state: GameState, mc: MainCharacter): Places {
  const day = mcDay(state).day;
  if (placesMemo && placesMemo.state === state && placesMemo.day === day) return placesMemo.places;
  const card = studentCard(state, mc.ref);
  const spot = card?.home ?? null;
  let recreation = 0.5;
  let dining = 0.5;
  if (spot !== null) {
    const approval = approvalAt(state, spot);
    const part = (id: string): number | undefined => approval.causes.flatMap((cause) => cause.parts).find((one) => one.id === id)?.level;
    recreation = part('recreation') ?? 0.5;
    dining = part('dining') ?? 0.5;
  }
  const kind = dayRead(state.clock).kind;
  const places: Places = {
    recreation,
    dining,
    library: libraryShare(state),
    social: socialLife(state),
    // A dry campus moves parties to the town (DESIGN.md 55): fewer, further.
    parties: (partiesOn(state) || !state.goals) && !partiesInTown(state),
    exams: kind === 'midterms' || kind === 'finals',
    term: kind === 'term' || kind === 'midterms' || kind === 'finals',
  };
  placesMemo = { state, day, places };
  return places;
}

function lowest(mc: MainCharacter): LifeNeed {
  let worst: LifeNeed = 'energy';
  for (const need of NEEDS) if (mc.needs[need] < mc.needs[worst]) worst = need;
  return worst;
}

const NEED_ACTIVITY: Record<LifeNeed, ActivityId> = { energy: 'rest', social: 'friends', fun: 'friends', study: 'study', fitness: 'workout' };

/** Once a real day, when the player's day starts: up to four things to do, each with why, from goals, needs and the calendar. */
function makePlan(state: GameState, mc: MainCharacter, log: LogEntry[] | null): void {
  const { day, weekday } = mcDay(state);
  const places = placesFor(state, mc);
  const items: PlanItem[] = [];
  const add = (activity: ActivityId, why: string): void => {
    if (items.length < 4 && !items.some((one) => one.activity === activity)) items.push({ activity, why, done: false });
  };
  if (places.exams) add('study', 'exams are this week');
  if (mc.goals.includes('deansList') && places.term) add('study', GOALS.deansList.plan.toLowerCase());
  for (const need of NEEDS) {
    if (mc.needs[need] < NEED_LOW) add(NEED_ACTIVITY[need], `${NEED_NAMES[need].toLowerCase()} ${need === 'study' ? 'are' : 'is'} low`);
  }
  if (mc.money < MONEY_LOW) add('job', 'money is short');
  if (mc.goals.includes('fit')) add('workout', GOALS.fit.plan.toLowerCase());
  if (mc.goals.includes('friends')) add('friends', GOALS.friends.plan.toLowerCase());
  if (mc.club && CLUB_DAYS.includes(weekday)) add('club', `the ${mc.club} meets today`);
  if (PARTY_NIGHTS.includes(weekday) && places.parties && (mc.goals.includes('fun') || mc.nature === 'party')) add('party', weekday === 3 ? 'it is Thursday night' : 'it is the weekend');
  if (items.length === 0) add(NEED_ACTIVITY[lowest(mc)], 'a quiet day');
  mc.plan = { day, items };
  const said = `Today's plan for ${mc.name}: ${items.map((one) => `${ACTIVITIES[one.activity].name.toLowerCase()} (${one.why})`).join(', ')}.`;
  remember(state, mc, said, false, log ?? undefined);
}

// ------------------------------------------------------------- each step --

interface Choice {
  activity: ActivityId;
  why: string;
}

/** What the Main Character does next, and why: bedtime, classes and meals first, then whatever their needs and plan ask most. */
function choose(state: GameState, mc: MainCharacter, classYear: number): Choice {
  const { hour, weekday } = mcDay(state);
  const places = placesFor(state, mc);
  const partyNight = PARTY_NIGHTS.includes(weekday) && places.parties;
  const atParty: boolean = mc.doing.activity === 'party';
  const bed = partyNight && atParty ? DAY_HOURS.partyBed : DAY_HOURS.bed;
  if (hour >= bed) return { activity: 'sleep', why: 'bedtime' };
  const weekdayClass = weekday < 5 && places.term && hour >= DAY_HOURS.classFrom && hour < DAY_HOURS.classTo;
  if (weekdayClass) {
    // A hangover, or no energy left, costs the morning's class: a cost the player can see.
    if ((mc.hangover && hour < DAY_HOURS.classFrom + 2) || mc.needs.energy < 10) return { activity: 'rest', why: mc.hangover ? 'a hangover' : 'too tired for class' };
    return { activity: 'class', why: 'classes' };
  }
  if (DAY_HOURS.meals.some((at) => hour >= at && hour < at + 0.5)) return { activity: 'eat', why: places.dining >= 0.5 ? 'mealtime, at the dining hall nearby' : 'mealtime, a walk away' };
  const planned = new Set(mc.plan?.items.map((one) => one.activity) ?? []);
  const options: ActivityId[] = ['study', 'friends', 'workout', 'rest'];
  if (mc.club && CLUB_DAYS.includes(weekday) && hour >= 11 && hour < 13) options.push('club');
  if (mc.job && hour >= 9 && hour < 12 && weekday < 5) options.push('job');
  if (partyNight && hour >= DAY_HOURS.partyFrom) options.push('party');
  const reach: Partial<Record<ActivityId, number>> = { workout: 0.4 + 0.6 * places.recreation, study: 0.6 + 0.4 * places.library, friends: 0.6 + 0.4 * places.social, party: places.parties ? 1 : 0.2 };
  let best: Choice = { activity: 'rest', why: 'nothing calls' };
  let top = -Infinity;
  for (const activity of options) {
    const spec = ACTIVITIES[activity];
    let value = 0;
    for (const need of NEEDS) {
      const gives = spec.gives[need] ?? 0;
      const urgency = ((100 - mc.needs[need]) / 100) ** 2;
      value += gives * urgency;
    }
    value *= reach[activity] ?? 1;
    if (activity === 'job') value += mc.money < MONEY_LOW ? 6 : 1;
    if (activity === 'party' && mc.nature === 'party') value += 4;
    if (activity === 'study' && places.exams) value += 4;
    if (planned.has(activity)) value += PLAN_LIFT * (mc.plan?.items.find((one) => one.activity === activity)?.done ? 0.3 : 1);
    // A little of their own mood in it, from the seed: never from the game's random streams.
    value += roll(state, mc.ref.entryYear, mc.ref.index, state.clock.tick, options.indexOf(activity));
    if (value > top) {
      top = value;
      const plan = mc.plan?.items.find((one) => one.activity === activity);
      const need = NEEDS.filter((one) => (spec.gives[one] ?? 0) > 0).sort((a, b) => mc.needs[a] - mc.needs[b])[0];
      best = { activity, why: plan ? `the plan: ${plan.why}` : need ? `${NEED_NAMES[need].toLowerCase()} ${need === 'study' ? 'need' : 'needs'} it` : 'a free hour' };
    }
  }
  void classYear;
  return best;
}

/** The people they spend an activity with: friends and a partner when out with friends, the roommate when resting. */
function company(mc: MainCharacter, activity: ActivityId): CastMember[] {
  if (activity === 'friends' || activity === 'party' || activity === 'eat') return mc.cast.filter((one) => one.role === 'friend' || one.role === 'partner' || one.role === 'crush');
  if (activity === 'rest' || activity === 'sleep') return mc.cast.filter((one) => one.role === 'roommate');
  if (activity === 'club') return mc.cast.filter((one) => one.role === 'friend').slice(0, 1);
  return [];
}

function startActivity(state: GameState, mc: MainCharacter, choice: Choice, classYear: number, log: LogEntry[]): void {
  mc.doing = { activity: choice.activity, since: state.clock.tick, why: choice.why };
  const item = mc.plan?.items.find((one) => one.activity === choice.activity && !one.done);
  if (item) item.done = true;
  if (choice.activity === 'party') {
    // Drinking belongs to those of 21 and over, and costs the morning after (52.2).
    const over = classYear >= DRINKING_YEAR;
    const drinks = over && roll(state, mc.ref.index, state.clock.tick, 41) < (mc.nature === 'party' ? 0.6 : 0.3);
    if (drinks) mc.hangover = true;
    remember(state, mc, drinks ? `${mc.name} went to a party and had a few drinks. Tomorrow morning will be slow.` : over ? `${mc.name} went to a party and stuck to soda.` : `${mc.name} went to a party. Under 21, so no drinks.`, false, log);
  }
  if (choice.activity === 'rest' && choice.why === 'a hangover') remember(state, mc, `${mc.name} slept through the morning's class with a hangover.`, false, log);
}

/** One step of the Main Character's life. Every `MC_STEP` ticks; nothing at all with none chosen. */
export function stepMain(state: GameState, log: LogEntry[]): void {
  const mc = state.story?.mc;
  if (!mc || state.clock.tick % MC_STEP !== 0) return;
  const classYear = classYearOf(state, mc.ref);
  if (classYear === null) {
    // Their class graduated, or they left: the hall of fame keeps their story.
    retire(state, mc, mc.ref.entryYear + 3 <= state.clock.week.year ? 'graduated' : 'transferred', log);
    return;
  }
  const { day } = mcDay(state);
  if (!mc.plan || mc.plan.day !== day) newDay(state, mc, log);
  const hours = MC_STEP / 60;
  const choice = choose(state, mc, classYear);
  if (choice.activity !== mc.doing.activity) startActivity(state, mc, choice, classYear, log);
  const spec = ACTIVITIES[mc.doing.activity];
  const roommate = mc.cast.find((one) => one.role === 'roommate');
  for (const need of NEEDS) {
    let delta = NEED_DRIFT[need] + (spec.gives[need] ?? 0);
    // Who they live with changes how they sleep (53.2): a loud roommate costs rest, a quiet one gives a little.
    if (need === 'energy' && mc.doing.activity === 'sleep' && roommate) delta += roommate.traits.reduce((sum, trait) => sum + (CAST_TRAITS[trait].sleep ?? 0), 0);
    if (mc.doing.activity === 'sleep' && need !== 'energy') delta = NEED_DRIFT[need] * 0.3;
    mc.needs[need] = clamp(mc.needs[need] + delta * hours);
  }
  mc.money = Math.round((mc.money - spec.spend * hours) * 100) / 100;
  mc.today[mc.doing.activity] = (mc.today[mc.doing.activity] ?? 0) + hours;
  if (dayRead(state.clock).kind !== 'break' && dayRead(state.clock).kind !== 'summer') {
    mc.term.study += mc.needs.study;
    mc.term.steps += 1;
  }
  if (mc.doing.activity === 'class') mc.term.attended += 1;
  const { hour, weekday } = mcDay(state);
  if (weekday < 5 && placesFor(state, mc).term && hour >= DAY_HOURS.classFrom && hour < DAY_HOURS.classTo) mc.term.classes += 1;
  // A hangover lasts the morning after, and is over by the afternoon: never cleared on the night it began.
  if (mc.hangover && hour >= DAY_HOURS.classTo && hour < DAY_HOURS.partyFrom) mc.hangover = false;
  for (const one of company(mc, mc.doing.activity)) {
    const before = one.closeness;
    const lift = one.traits.reduce((sum, trait) => sum + (CAST_TRAITS[trait].closer ?? 0), 0);
    one.closeness = clamp(one.closeness + (CLOSER_PER_HOUR + lift) * hours * (mc.doing.activity === 'sleep' ? 0.2 : 1));
    if (one.role === 'friend' && before < CLOSE_FRIEND && one.closeness >= CLOSE_FRIEND) remember(state, mc, `${one.name} is a close friend now.`, true, log);
  }
}

/** A new real day: yesterday in one line, the allowance, a little distance from those not seen, and today's plan. */
function newDay(state: GameState, mc: MainCharacter, log: LogEntry[]): void {
  if (mc.plan) {
    const hours = Object.entries(mc.today).filter(([, h]) => (h ?? 0) >= 1).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 4);
    const kept = mc.plan.items.filter((one) => one.done).length;
    const parts = hours.map(([activity, h]) => `${ACTIVITIES[activity as ActivityId].doing.toLowerCase()} for ${Math.round(h ?? 0)} ${Math.round(h ?? 0) === 1 ? 'hour' : 'hours'}`);
    if (parts.length > 0) remember(state, mc, `Yesterday ${mc.name} spent most of the day ${parts.join(', ')}, and kept ${kept} of ${mc.plan.items.length} plans.`, false, log);
    for (const one of mc.cast) if (!company(mc, 'friends').includes(one) || (mc.today.friends ?? 0) < 1) one.closeness = clamp(one.closeness - APART_PER_DAY);
  }
  mc.today = {};
  // A night of drinking costs the morning after (52.2): less energy, and a class is likely missed.
  if (mc.hangover) {
    mc.needs.energy = clamp(mc.needs.energy - HANGOVER_ENERGY);
    remember(state, mc, `${mc.name} woke up with a hangover.`, false, log);
  }
  mc.money += ALLOWANCE;
  if (mc.money < 0 && !mc.job) {
    mc.job = 'Dining hall';
    remember(state, mc, `${mc.name} ran out of money and took a campus job at the dining hall.`, true, log);
  }
  makePlan(state, mc, log);
}

/** A semester has closed: its grades, from the card's own grades, how much they studied and the classes they went to. */
export function mcOnSemester(state: GameState, log?: LogEntry[]): void {
  const mc = state.story?.mc;
  if (!mc || mc.term.steps === 0) return;
  const card = studentCard(state, mc.ref);
  if (!card) return;
  const study = mc.term.study / mc.term.steps;
  const attended = mc.term.classes > 0 ? mc.term.attended / mc.term.classes : 1;
  const grade = Math.round(clamp(card.gpa + GPA_FROM_STUDY * (study - GPA_STUDY_MIDDLE) + GPA_FROM_CLASSES * (attended - 0.9), 1.5, 4) * 100) / 100;
  mc.gpa = mc.gpa === null ? grade : Math.round(((mc.gpa * mc.semesters + grade) / (mc.semesters + 1)) * 100) / 100;
  mc.semesters += 1;
  mc.term = { study: 0, steps: 0, attended: 0, classes: 0 };
  if (grade >= DEANS_LIST) remember(state, mc, `${mc.name} made the Dean's list with a ${grade.toFixed(2)} this semester.`, true, log);
  else if (grade < 2) remember(state, mc, `${mc.name} had a hard semester: a ${grade.toFixed(2)}. Next semester is a fresh start.`, true, log);
  else remember(state, mc, `${mc.name} finished the semester with a ${grade.toFixed(2)}, in ${Math.round(attended * 100)}% of their classes.`, false, log);
}

// ------------------------------------------------------------ the page --

/** The Main Character's mood today, 0 to 100: their card's Happiness, moved by how well their needs are met. */
export function mcHappiness(state: GameState, mc: MainCharacter): number {
  const card = studentCard(state, mc.ref);
  const base = card?.happiness ?? 50;
  const needs = NEEDS.reduce((sum, need) => sum + mc.needs[need], 0) / NEEDS.length;
  return Math.round(clamp(base + (needs - 50) * 0.2));
}

/** Their Stress, 0 to 100: the campus's as they take it, and more with their studies behind. */
export function mcStress(state: GameState, mc: MainCharacter): number {
  const card = studentCard(state, mc.ref);
  return Math.round(clamp((card?.stress ?? 20) + Math.max(0, NEED_LOW - mc.needs.study) * 0.5));
}

/** Their goals, each with how it stands now, in a few words. */
export function goalStatus(mc: MainCharacter): Array<{ name: string; status: string }> {
  return mc.goals.map((goal) => {
    switch (goal) {
      case 'deansList':
        return { name: GOALS.deansList.name, status: mc.gpa === null ? 'No grades yet' : mc.gpa >= DEANS_LIST ? `On it: ${mc.gpa.toFixed(2)}` : `${mc.gpa.toFixed(2)} so far` };
      case 'friends': {
        const close = mc.cast.filter((one) => one.role === 'friend' && one.closeness >= CLOSE_FRIEND).length;
        return { name: GOALS.friends.name, status: close > 0 ? `${close} close ${close === 1 ? 'friend' : 'friends'}` : 'Getting to know people' };
      }
      case 'fit':
        return { name: GOALS.fit.name, status: `Fitness ${Math.round(mc.needs.fitness)} of 100` };
      case 'savings':
        return { name: GOALS.savings.name, status: `${dollars(mc.money)} in the bank` };
      case 'onTime':
        return { name: GOALS.onTime.name, status: `Class of Year ${mc.ref.entryYear + 3}` };
      case 'fun':
        return { name: GOALS.fun.name, status: `Fun ${Math.round(mc.needs.fun)} of 100` };
    }
  });
}
