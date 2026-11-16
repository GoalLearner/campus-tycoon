import { dateAt, type GameState, type StudentCard, type StudentRef } from '../sim';
import { hashInts } from '../sim/rng';
import { dayRead } from '../sim/systems/season';
import { semesterOf } from '../sim/systems/students';
import { INTEREST } from '../sim/systems/identity';
import { firstNamesOf, idIn, peopleOf, type Person, type WebView } from './socialView';
import { CLASS_LENGTH } from './campusDay';
import { clockText } from './clockText';

/**
 * A regular's day (DESIGN.md 63.9): what they do from waking to sleep on the player's own real day, and with whom,
 * worked out from their card, their people in the social web and the calendar, the same every time for the same day.
 * Classes on a weekday, meals with their friends, the gym, their club, studying, a date, a party, a game night with
 * their roommate; on a weekend a late brunch and an afternoon out; in exams, the library; on a break, home. Each item
 * says where it happens, so the map can send a followed student there (src/game/Walkers.ts). Nothing is stored.
 */

/**
 * The two hours a student is asleep between, by the 24-hour clock, as real students sleep (DESIGN.md 65.5): about 6 h
 * 37 min a night on average, two nights in three under seven hours, and half an hour more at the weekend, to bed later
 * and up later still (Creswell and others, PNAS 2023, by wristband). Each student keeps their own hours: a night owl
 * later, a scholar a little earlier. In finals week the all-nighters sleep a few hours from dawn, and now and then not
 * at all. Hours past midnight count on: 25 is 1 AM.
 */
export function sleepHours(card: StudentCard, weekend = false): [number, number] {
  const z = (salt: number): number => {
    // Two uniform numbers make a bell, so the hours cluster as real ones do.
    const a = (hashInts(card.ref.entryYear, card.ref.index, 9650 + salt) >>> 0) / 4294967296;
    const b = (hashInts(card.ref.entryYear, card.ref.index, 9660 + salt) >>> 0) / 4294967296;
    return (a + b - 1) * 2.45;
  };
  if (card.archetype === 'allNighter') return [29, 33];
  let bed = SLEEP.bed + SLEEP.bedSpread * z(1);
  if (card.quirk === 'Night owl') bed += 1.5;
  if (card.archetype === 'scholar') bed -= 0.5;
  bed = Math.max(22.5, Math.min(27.5, bed));
  const length = Math.max(4.5, Math.min(9, SLEEP.hours + SLEEP.hoursSpread * z(2)));
  if (weekend) return [bed + SLEEP.weekendLater, bed + SLEEP.weekendLater + length + SLEEP.weekendMore];
  return [bed, bed + length];
}

/** [T] Hours of sleep (DESIGN.md 65.5): to bed about 0:45, a school night about 6 h 27 min, a weekend 36 minutes more. */
export const SLEEP = { bed: 24.75, bedSpread: 0.75, hours: 6.45, hoursSpread: 0.8, weekendLater: 1, weekendMore: 0.6 } as const;

/** Where an item happens, as the map knows places: a dorm, a lecture hall, somewhere to eat, to play, to sit, a lawn. */
export type Where = 'home' | 'class' | 'food' | 'play' | 'seat' | 'quad' | 'away';

export interface DayItem {
  /** Hours of the player's day, from 0 up to 24 and past it for the hours after midnight. */
  from: number;
  to: number;
  where: Where;
  words: string;
  with: StudentRef[];
}

const first = (state: GameState, people: Person[]): string[] => firstNamesOf(state, people.map((one) => one.ref));

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function withWords(state: GameState, people: Person[]): string {
  return people.length > 0 ? ` with ${names(first(state, people))}` : '';
}

/** "9 AM", "12:30 PM", "1 AM": a time of the player's day as the card says it, on the device's own clock (75.1). */
export function clockWords(hour: number): string {
  return clockText(hour, true);
}

const likes = (view: WebView | null, ref: StudentRef, interest: number): boolean => {
  if (!view) return false;
  const id = idIn(view, ref);
  return id >= 0 && ((view.identity[id]! >>> (18 + interest)) & 1) === 1;
};

/**
 * [T] Daily details (R3, DESIGN.md 67.4), as shares of days: a package at the mailroom, keys left inside, sleeping
 * through the alarm (twice as often for a night owl, and only in a week they missed a class), a late-night food run on a
 * school night and at the weekend or in exams; of students, those with 8 AM classes this term; and a gym phase, a
 * run of workouts, more in January. A hall's meal plan has this many swipes a week.
 */
export const DETAILS = { package: 0.08, lockedOut: 0.015, alarm: 0.06, foodRun: 0.1, foodRunWeekend: 0.3, eightAm: 0.4, gym: 0.15, gymJanuary: 0.35 } as const;
export const MEAL_SWIPES = 14;
/** [T] The walk from one class to the next, inside the class change (75.2), and when the evening's clubs and parties start. */
const PASSING_WALK = 10 / 60;
export const CLUBS_FROM = 19;
export const PARTY_FROM = 21;
/** A gym phase lasts this many of the player's days (about three and a half months of the game's), then comes or goes. */
export const GYM_PHASE_DAYS = 2;

/** Where a job on campus is, as the map knows places. */
const JOB_WHERE: Readonly<Record<string, Where>> = {
  'the library desk': 'seat',
  'a dining hall': 'food',
  'the rec center front desk': 'play',
  'the mailroom': 'food',
  'a lab': 'class',
  'the campus store': 'food',
  'the tutoring center': 'seat',
};

/** The days of the week a job's shifts fall on, Sunday 0: about four hours a shift, never more than six days. */
export function shiftDays(seed: number, ref: StudentRef, hours: number): number[] {
  const count = Math.max(1, Math.min(6, Math.round(hours / 4.5)));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const start = (hashInts(seed, 9533, ref.entryYear, ref.index) >>> 0) % 7;
  const out: number[] = [];
  // Spread through the week: every other day first, then the days between.
  for (let i = 0; out.length < count && i < 14; i++) {
    const day = order[(start + (i < 7 ? i * 2 : (i - 7) * 2 + 1)) % 7]!;
    if (!out.includes(day)) out.push(day);
  }
  return out;
}

/** The regular's day, waking to sleep. */
export function regularDay(view: WebView | null, state: GameState, ref: StudentRef, card: StudentCard): DayItem[] {
  const day = Math.floor(state.clock.tick / (24 * 60));
  const roll = (salt: number): number => (hashInts(state.seed, 9500 + salt, ref.entryYear, ref.index, day) >>> 0) / 4294967296;
  const read = dayRead(state.clock);
  const weekday = dateAt(state.clock).weekday;
  const weekend = weekday === 0 || weekday === 6;
  const [sleepAt, wakeAt] = sleepHours(card, weekend);
  // Wake to sleep in one run of hours: the hours they woke this morning, and those they go to bed tonight.
  const wake = wakeAt % 24;
  const sleep = sleepAt % 24 <= wake ? (sleepAt % 24) + 24 : sleepAt % 24;
  const items: DayItem[] = [];
  const put = (from: number, to: number, where: Where, words: string, people: Person[] = []): void => {
    if (to - from < 0.25 || from >= sleep) return;
    items.push({ from, to: Math.min(to, sleep), where, words, with: people.map((one) => one.ref) });
  };

  // Down with the flu (DESIGN.md 65.5): in bed, out once for soup.
  if (card.sick && read.kind !== 'break' && read.kind !== 'summer') {
    put(wake, wake + 4, 'home', 'In bed with the flu');
    put(wake + 4, wake + 5, 'food', 'Out for soup and tea');
    put(wake + 5, sleep, 'home', 'Back in bed with the flu');
    return items;
  }
  // Away on a break or for the summer: home, off the campus.
  if (read.kind === 'break' || read.kind === 'summer') {
    put(wake, sleep, 'away', read.kind === 'summer' ? 'Home for the summer' : `Home for ${read.name ?? 'the break'}`);
    return items;
  }

  const people = view ? peopleOf(view, state, ref) : [];
  const partner = people.filter((one) => one.role === 'partner').slice(0, 1);
  const friends = people.filter((one) => one.role === 'best' || one.role === 'friend');
  const roommate = people.filter((one) => one.role === 'roommate').slice(0, 1);
  const pick = (list: Person[], count: number, salt: number): Person[] => {
    const start = list.length > 0 ? Math.floor(roll(salt) * list.length) : 0;
    return [...list.slice(start), ...list.slice(0, start)].slice(0, count);
  };
  const exams = read.kind === 'finals' || read.kind === 'midterms';
  const fit = likes(view, ref, INTEREST.fitness) || card.archetype === 'athlete';
  const gamer = likes(view, ref, INTEREST.gaming);
  const studious = card.archetype === 'scholar' || card.archetype === 'stressed' || exams;

  // Daily details (R3, DESIGN.md 67.4): a meal plan's swipes for a student in a hall, a job's shifts, laundry once a
  // week, a package at the mailroom, keys left inside, the alarm slept through, an 8 AM class and its coffee, a
  // late-night food run, and a gym phase that comes and goes. Each from the seed and the day, the same every time.
  const owl = card.quirk === 'Night owl';
  const mealPlan = card.residence === 'dorm';
  const sinceMonday = (weekday + 6) % 7;
  const swipesLeft = Math.max(0, MEAL_SWIPES - 2 * (sinceMonday + 1));
  const job = card.money.job;
  const shiftToday = job !== null && shiftDays(state.seed, ref, job.hours).includes(weekday);
  const shiftWords = job ? `A shift at ${job.where}` : '';
  const shiftWhere: Where = job ? (job.onCampus ? JOB_WHERE[job.where] ?? 'seat' : 'away') : 'away';
  const shiftHours = job ? Math.min(5, Math.max(3, job.hours / Math.max(1, shiftDays(state.seed, ref, job.hours).length))) : 0;
  const steady = (salt: number): number => (hashInts(state.seed, 9530 + salt, ref.entryYear, ref.index) >>> 0) / 4294967296;
  const laundry = Math.floor(steady(0) * 7) === weekday;
  const slept = !weekend && card.classes !== null && card.classes.went < card.classes.of && roll(20) < (owl ? 2 : 1) * DETAILS.alarm;
  // An 8 AM class: on two weekdays a week this term, for those up early enough to make it.
  const eights = (hashInts(state.seed, 9531, ref.entryYear, ref.index, semesterOf(state)) >>> 0) / 4294967296 < DETAILS.eightAm;
  const eight = !weekend && !slept && eights && wake <= 6.75 && (weekday === 2 || weekday === 4);
  const gymPhase = (hashInts(state.seed, 9532, ref.entryYear, ref.index, Math.floor(day / GYM_PHASE_DAYS)) >>> 0) / 4294967296 < (dateAt(state.clock).month === 1 ? DETAILS.gymJanuary : DETAILS.gym);
  const meal = (words: string, last: boolean): string => (mealPlan ? `${words}${last ? (swipesLeft > 0 ? `, ${swipesLeft} meal swipes left this week` : ', the last meal swipe of the week') : ', a meal swipe'}` : words);

  let t = wake;
  if (slept) {
    put(t, t + 1.5, 'home', 'Slept through the alarm');
    t += 1.5;
    put(t, t + 0.5, 'home', 'Rushing out the door');
    t += 0.5;
  } else {
    put(t, t + 1, 'home', 'Getting ready');
    t += 1;
  }

  if (!weekend) {
    // Classes as the campus keeps them (DESIGN.md 75.2): a lecture on the hour, a seminar on the half hour, each 50
    // minutes, so a followed student walks in the class changes with everyone else. Lunch in the noon rush.
    const onHour = (at: number): number => Math.ceil(at - 1e-6);
    const onHalf = (at: number): number => Math.ceil(at * 2 - 1e-6) / 2;
    if (slept) {
      const late = Math.max(10.5, onHalf(t));
      put(late, late + CLASS_LENGTH, 'class', `A ${card.subject} seminar, the morning lecture missed`);
      t = late + CLASS_LENGTH;
    } else {
      const classFrom = eight ? 8 : Math.max(9, onHour(t));
      if (classFrom > t) put(t, classFrom, 'food', eight ? 'Coffee before an 8 AM class' : 'Coffee before class');
      put(classFrom, classFrom + CLASS_LENGTH, 'class', eight ? `An 8 AM ${card.subject} lecture` : `${card.subject} lecture`);
      t = classFrom + CLASS_LENGTH;
      // A seminar on the half hour after, when it is out before lunch.
      const seminar = classFrom + 1.5;
      if (seminar + CLASS_LENGTH <= 12) {
        put(t + PASSING_WALK, seminar, 'seat', 'Between classes');
        put(seminar, seminar + CLASS_LENGTH, 'class', `A ${card.subject} seminar`);
        t = seminar + CLASS_LENGTH;
      }
    }
    const noon = Math.max(12, t);
    if (noon - t >= 0.5) put(t + PASSING_WALK, noon, 'seat', 'Between classes');
    t = noon;
    const lunch = pick(friends, roll(1) < 0.5 ? 2 : 1, 2);
    put(t, t + CLASS_LENGTH, 'food', meal(`Lunch${withWords(state, lunch)}`, false), lunch);
    t += CLASS_LENGTH;
    if (roll(30) < DETAILS.package) {
      put(t, t + 0.5, 'food', 'Picking up a package at the mailroom');
      t += 0.5;
    }
    if (card.classYear < 2) {
      const after = onHour(t + PASSING_WALK);
      put(after, after + CLASS_LENGTH, 'class', `A ${card.subject} class`);
      t = after + CLASS_LENGTH;
    }
  } else {
    // A weekend starts late: brunch from 10:30 at the earliest (75.2).
    const brunch = pick(friends, 2, 3);
    t = Math.max(t, 10.5);
    put(t, t + 1.25, 'food', meal(`Brunch${withWords(state, brunch)}`, false), brunch);
    t += 1.5;
  }

  // The afternoon: a weekend shift, the gym, studying, or friends on a lawn. Clubs meet in the evening (75.2).
  const clubDay = card.club !== null && hashInts(state.seed, 9510, ref.entryYear, ref.index, weekday) % 7 < 2;
  if (weekend && shiftToday) put(t, t + shiftHours, shiftWhere, shiftWords);
  else if (exams || (studious && roll(4) < 0.6)) {
    const mates = exams ? pick(friends, 1, 5) : [];
    put(t, t + 2.5, 'seat', exams ? `Studying for ${read.name ?? 'exams'}${withWords(state, mates)}` : 'Studying', mates);
  } else if (gymPhase && roll(6) < 0.8) put(t, t + 1.5, 'play', 'A workout, in a gym phase');
  else if (fit && roll(6) < 0.7) put(t, t + 1.5, 'play', 'A workout');
  else {
    const out = pick(friends, 2, 7);
    put(t, t + 2, 'quad', out.length > 0 ? `Hanging out${withWords(state, out)}` : 'Some time on the lawn', out);
  }
  t = Math.max(t + (weekend && shiftToday ? shiftHours : 2.5), 17.5);

  // Dinner, with their partner or friends.
  const dinner = partner.length > 0 && roll(8) < 0.6 ? partner : pick(friends, 2, 9);
  put(t, t + 1, 'food', meal(`Dinner${withWords(state, dinner)}`, true), dinner);
  t += 1.25;
  if (laundry && !(shiftToday && !weekend)) {
    put(t, t + 1.25, 'home', 'Laundry');
    t += 1.25;
  }

  // The evening: a weekday shift, a party on its nights from 9 PM, their club at 7 on its days, a date, studying, a game
  // night with their roommate, or in.
  const partyNight = card.party !== null && (weekday === 4 || weekday === 5 || weekday === 6);
  if (!weekend && shiftToday) put(t, t + shiftHours, shiftWhere, shiftWords);
  else if (partyNight && !exams) {
    const out = Math.max(PARTY_FROM, t + 1);
    if (out - 1 - t >= 0.25) put(t, out - 1, 'home', 'In their room');
    put(Math.max(t, out - 1), out, 'home', 'Getting ready to go out');
    put(out, sleep - 0.5, 'away', 'At a party', pick(friends, 2, 10));
  } else if (clubDay && !exams) {
    const meets = Math.max(CLUBS_FROM, t);
    if (meets - t >= 0.25) put(t, meets, 'home', 'In their room');
    put(meets, meets + 1.5, 'seat', `${card.club} meets`);
  } else if (partner.length > 0 && roll(11) < 0.35 && !exams) put(t, t + 2.5, 'food', `A date${withWords(state, partner)}`, partner);
  else if (studious || roll(12) < 0.3) put(t, t + 2.5, 'seat', 'Studying');
  else if (gamer && roommate.length > 0) put(t, t + 2.5, 'home', `Gaming${withWords(state, roommate)}`, roommate);
  else {
    const out = pick(friends, 1, 13);
    put(t, t + 2, 'quad', out.length > 0 ? `Out${withWords(state, out)}` : 'A walk', out);
  }
  let last = items[items.length - 1];
  let back = Math.max(last ? last.to : t, t + 2);
  // A late-night food run, more at the weekend and in exams, more for a night owl.
  if (!(partyNight && !exams) && roll(40) < (weekend || exams ? DETAILS.foodRunWeekend : DETAILS.foodRun) * (owl ? 2 : 1) && back + 0.6 < sleep - 0.25) {
    const mates = pick(friends, 1, 41);
    put(back, back + 0.6, 'food', `A late-night food run${withWords(state, mates)}`, mates);
    back += 0.6;
  }
  // Keys left inside, now and then.
  if (roll(50) < DETAILS.lockedOut && back + 0.5 < sleep - 0.25) {
    put(back, back + 0.5, 'home', mealPlan ? 'Locked out: waiting for the RA with the spare key' : 'Locked out: waiting for the landlord with a spare key');
    back += 0.5;
  }
  last = items[items.length - 1];
  back = Math.max(back, last ? last.to : t);
  put(back, sleep, 'home', 'In their room');
  // No gaps: each thing goes on until the next begins, the way between included.
  for (let i = 0; i + 1 < items.length; i++) items[i]!.to = items[i + 1]!.from;
  if (items.length > 0) items[items.length - 1]!.to = sleep;
  items.push({ from: sleep, to: wake + 24, where: 'home', words: 'Asleep', with: [] });
  return items;
}

/** What they are doing at an hour of the player's day, or null between items. */
export function itemAt(day: DayItem[], hour: number): DayItem | null {
  for (const h of [hour, hour + 24]) {
    const item = day.find((one) => one.from <= h && h < one.to);
    if (item) return item;
  }
  // Before waking: the last night's sleep.
  return day.find((one) => one.words === 'Asleep') ?? null;
}
