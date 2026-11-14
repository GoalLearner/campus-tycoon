import { dateAt, type GameState, type StudentCard, type StudentRef } from '../sim';
import { hashInts } from '../sim/rng';
import { dayRead } from '../sim/systems/season';
import { firstNameOf } from '../sim/systems/students';
import { INTEREST } from '../sim/systems/identity';
import { idIn, peopleOf, type Person, type WebView } from './socialView';

/**
 * A regular's day (DESIGN.md 63.9): what they do from waking to sleep on the player's own real day, and with whom,
 * worked out from their card, their people in the social web and the calendar, the same every time for the same day.
 * Classes on a weekday, meals with their friends, the gym, their club, studying, a date, a party, a game night with
 * their roommate; on a weekend a late brunch and an afternoon out; in exams, the library; on a break, home. Each item
 * says where it happens, so the map can send a followed student there (src/game/Walkers.ts). Nothing is stored.
 */

/** The two hours a student is asleep between, by the 24-hour clock: a night owl later, a scholar a little earlier. */
export function sleepHours(card: StudentCard): [number, number] {
  if (card.archetype === 'allNighter') return [4, 9];
  if (card.quirk === 'Night owl') return [2, 10];
  if (card.archetype === 'scholar') return [23, 7];
  return [24, 8];
}

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

const first = (state: GameState, people: Person[]): string[] => people.map((one) => firstNameOf(state, one.ref));

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function withWords(state: GameState, people: Person[]): string {
  return people.length > 0 ? ` with ${names(first(state, people))}` : '';
}

/** "9 AM", "12:30 PM", "1 AM": a time of the player's day as the card says it. */
export function clockWords(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const whole = Math.floor(h + 1e-6);
  const minutes = Math.round((h - whole) * 60);
  const twelve = whole % 12 === 0 ? 12 : whole % 12;
  return `${twelve}${minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : ''} ${whole < 12 ? 'AM' : 'PM'}`;
}

const likes = (view: WebView | null, ref: StudentRef, interest: number): boolean => {
  if (!view) return false;
  const id = idIn(view, ref);
  return id >= 0 && ((view.identity[id]! >>> (18 + interest)) & 1) === 1;
};

/** The regular's day, waking to sleep. */
export function regularDay(view: WebView | null, state: GameState, ref: StudentRef, card: StudentCard): DayItem[] {
  const day = Math.floor(state.clock.tick / (24 * 60));
  const roll = (salt: number): number => (hashInts(state.seed, 9500 + salt, ref.entryYear, ref.index, day) >>> 0) / 4294967296;
  const read = dayRead(state.clock);
  const weekday = dateAt(state.clock).weekday;
  const weekend = weekday === 0 || weekday === 6;
  const [sleepAt, wakeAt] = sleepHours(card);
  // Wake to sleep in one run of hours: a student asleep at 2 AM is up until 26 on this count.
  const wake = wakeAt + (weekend ? 1.5 : 0);
  const sleep = sleepAt <= wakeAt ? sleepAt + 24 : sleepAt;
  const items: DayItem[] = [];
  const put = (from: number, to: number, where: Where, words: string, people: Person[] = []): void => {
    if (to - from < 0.25 || from >= sleep) return;
    items.push({ from, to: Math.min(to, sleep), where, words, with: people.map((one) => one.ref) });
  };

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

  let t = wake;
  put(t, t + 1, 'home', 'Getting ready');
  t += 1;

  if (!weekend) {
    // Classes in the morning, lunch with friends, a class after for the first two years.
    const classFrom = Math.max(9, t);
    if (classFrom > t) put(t, classFrom, 'food', 'Coffee before class');
    put(classFrom, classFrom + 1.25, 'class', `${card.major} lecture`);
    t = classFrom + 1.5;
    if (t < 12) {
      put(t, Math.min(12, t + 1.25), 'class', `A ${card.major} seminar`);
      t = Math.max(t + 1.25, 12);
    }
    const lunch = pick(friends, roll(1) < 0.5 ? 2 : 1, 2);
    put(t, t + 1, 'food', `Lunch${withWords(state, lunch)}`, lunch);
    t += 1;
    if (card.classYear < 2) {
      put(t + 0.5, t + 2, 'class', `A ${card.major} class`);
      t += 2;
    }
  } else {
    const brunch = pick(friends, 2, 3);
    put(t, t + 1.25, 'food', `Brunch${withWords(state, brunch)}`, brunch);
    t += 1.5;
  }

  // The afternoon: their club on its days, the gym, studying, or friends on a lawn.
  const clubDay = card.club !== null && hashInts(state.seed, 9510, ref.entryYear, ref.index, weekday) % 7 < 2;
  if (exams || (studious && roll(4) < 0.6)) {
    const mates = exams ? pick(friends, 1, 5) : [];
    put(t, t + 2.5, 'seat', exams ? `Studying for ${read.name ?? 'exams'}${withWords(state, mates)}` : 'Studying', mates);
  } else if (clubDay) put(t, t + 1.5, 'seat', `${card.club} meets`);
  else if (fit && roll(6) < 0.7) put(t, t + 1.5, 'play', 'A workout');
  else {
    const out = pick(friends, 2, 7);
    put(t, t + 2, 'quad', out.length > 0 ? `Hanging out${withWords(state, out)}` : 'Some time on the lawn', out);
  }
  t = Math.max(t + 2.5, 17.5);

  // Dinner, with their partner or friends.
  const dinner = partner.length > 0 && roll(8) < 0.6 ? partner : pick(friends, 2, 9);
  put(t, t + 1, 'food', `Dinner${withWords(state, dinner)}`, dinner);
  t += 1.25;

  // The evening: a party on its nights, a date, studying, a game night with their roommate, or in.
  const partyNight = card.party !== null && (weekday === 4 || weekday === 5 || weekday === 6);
  if (partyNight && !exams) {
    put(t, t + 1.5, 'home', 'Getting ready to go out');
    put(t + 1.5, sleep - 0.5, 'away', 'At a party', pick(friends, 2, 10));
  } else if (partner.length > 0 && roll(11) < 0.35 && !exams) put(t, t + 2.5, 'food', `A date${withWords(state, partner)}`, partner);
  else if (studious || roll(12) < 0.3) put(t, t + 2.5, 'seat', 'Studying');
  else if (gamer && roommate.length > 0) put(t, t + 2.5, 'home', `Gaming${withWords(state, roommate)}`, roommate);
  else {
    const out = pick(friends, 1, 13);
    put(t, t + 2, 'quad', out.length > 0 ? `Out${withWords(state, out)}` : 'A walk', out);
  }
  const last = items[items.length - 1];
  const home = Math.max(last ? last.to : t, t + 2);
  put(home, sleep, 'home', 'In their room');
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
