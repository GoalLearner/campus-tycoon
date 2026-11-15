import type { DayPeriod } from './daylight';
import { seasonOf, type LifeFacts, type Weather } from './life';
import type { Where } from './regularDay';

/**
 * The living campus, L1 (DESIGN.md 64): what students do on the lawns and quads when they are not walking. The owner's
 * words: "Fill the lawns: most people outdoors in good weather should be doing something, not walking." This is the
 * plain rule; `src/game/Lawns.ts` draws it. For show only: nothing here is saved, nothing changes a number.
 */

/** What a group on the grass is doing. */
export type LawnKind =
  | 'circle'
  | 'picnic'
  | 'sun'
  | 'nap'
  | 'study'
  | 'guitar'
  | 'frisbee'
  | 'catch'
  | 'kick'
  | 'couple'
  | 'phone'
  | 'reading'
  | 'music'
  | 'selfie'
  | 'hug'
  | 'jog'
  | 'goof'
  | 'dance'
  | 'dog';
export const LAWN_KINDS: readonly LawnKind[] = ['circle', 'picnic', 'sun', 'nap', 'study', 'guitar', 'frisbee', 'catch', 'kick', 'couple', 'phone', 'reading', 'music', 'selfie', 'hug', 'jog', 'goof', 'dance', 'dog'];

/** How many are in each, at the least and the most. */
export const LAWN_SIZE: Record<LawnKind, readonly [number, number]> = {
  circle: [3, 5],
  picnic: [2, 4],
  sun: [1, 2],
  nap: [1, 1],
  study: [1, 3],
  guitar: [2, 4],
  frisbee: [2, 3],
  catch: [2, 2],
  kick: [2, 3],
  couple: [2, 2],
  phone: [1, 1],
  reading: [1, 1],
  music: [1, 2],
  selfie: [2, 3],
  hug: [2, 2],
  jog: [1, 1],
  goof: [2, 2],
  dance: [2, 4],
  dog: [1, 1],
};

/** The share of the crowd step's lawn figures out in each part of the day, in fine weather. */
const OUT: Record<DayPeriod, number> = { morning: 0.4, afternoon: 1, evening: 0.7, night: 0.06 };

/**
 * How full the lawns are now, 0 to 1 of the crowd step's lawn figures: the afternoon most, the night hardly at all;
 * rain and snow send nearly everyone in; a cold winter, a break or a summer term thins them; a weekend fills them more.
 */
export function lawnShare(facts: LifeFacts): number {
  if (facts.students <= 0) return 0;
  const here = facts.presence ?? 1;
  if (here <= 0) return 0;
  const season = seasonOf(facts.month);
  let share = OUT[facts.period];
  share *= facts.weather === 'rain' ? 0.08 : facts.weather === 'snow' ? 0.2 : 1;
  share *= season === 'winter' ? 0.55 : season === 'summer' && !facts.term ? 0.6 : 1;
  share *= facts.weekend ? 1.15 : 1;
  share *= here < 0.5 ? Math.max(0.2, here) : 1;
  if (facts.reduced) share *= 0.5;
  return Math.max(0, Math.min(1, share));
}

/** How much of the walking crowd stays on the lawns instead, when the lawns are full: so more are doing than walking. */
export const RESTING_AT_FULL = 0.35;

/** What a group is like, for choosing what they do: from the social web and their cards. */
export interface LawnGroup {
  size: number;
  /** A couple together, and a friend group's vibe, by the web's interests ('sports', 'music', ...), or null. */
  couple: boolean;
  vibe: string | null;
  /** Interests most of them share. */
  likes: ReadonlySet<string>;
  /** Exam weeks. */
  exams: boolean;
  /** Where the first of them planned to be this hour, from their regular day: on the grass they keep close to it. */
  plan?: Where | null;
  /** How the first of them feels now, from their card's moodlets: up, down or tense, or null for fine. */
  mood?: 'up' | 'down' | 'tense' | null;
  /** Their traits on average, 0 to 3. */
  traits?: Partial<Record<'outgoing' | 'funny' | 'laidBack' | 'ambitious', number>>;
}

/**
 * What a group does, chosen by weight from who they are, the part of the day and the weather, with `roll` (0 to 1,
 * from the seed, the spot and the time) to pick among them. Always one their size allows.
 */
export function chooseLawnKind(group: LawnGroup, period: DayPeriod, weather: Weather, roll: number): LawnKind {
  const fine = weather === 'clear';
  const day = period === 'morning' || period === 'afternoon';
  const likes = (what: string): boolean => group.likes.has(what) || group.vibe === what;
  const w: Partial<Record<LawnKind, number>> = {};
  const add = (kind: LawnKind, weight: number): void => {
    const [least, most] = LAWN_SIZE[kind];
    if (group.size >= least && group.size <= most && weight > 0) w[kind] = (w[kind] ?? 0) + weight;
  };
  if (group.couple) {
    // A couple keeps to couple things: sitting close, a picnic for two, a selfie, now and then a frisbee or revision.
    add('couple', 4);
    add('picnic', fine && period !== 'night' ? 2 : 0);
    add('hug', 1);
    add('selfie', 1);
    add('sun', fine && period === 'afternoon' ? 1 : 0);
    add('frisbee', fine && day ? 0.4 : 0);
    add('study', group.exams ? 1.2 : 0.3);
    return pick(tilted(w, group), roll, group.size);
  }
  add('circle', 3);
  add('picnic', fine && period !== 'night' ? 1.5 : 0);
  add('sun', fine && period === 'afternoon' ? 1.5 : 0);
  add('nap', fine && day ? 0.6 : 0);
  add('study', (likes('studying') ? 3 : 0.6) * (group.exams ? 3 : 1));
  add('guitar', likes('music') ? 3 : 0.3);
  add('music', likes('music') ? 1.5 : 0.4);
  add('frisbee', fine ? (likes('sports') || likes('fitness') ? 3 : 0.8) : 0);
  add('catch', fine ? (likes('sports') ? 2 : 0.6) : 0);
  add('kick', fine ? (likes('sports') ? 2.5 : 0.5) : 0);
  add('phone', likes('gaming') || likes('fashion') ? 1.5 : 0.8);
  add('reading', likes('studying') || likes('art') ? 1.5 : 0.6);
  add('selfie', likes('fashion') || likes('partying') ? 1.5 : 0.4);
  add('hug', 0.3);
  add('jog', likes('fitness') ? 2 : 0.4);
  add('goof', likes('partying') || likes('gaming') ? 1 : 0.4);
  add('dance', fine && period !== 'morning' ? (likes('partying') || likes('music') ? 1.4 : 0.25) : 0);
  add('dog', 0.35);
  return pick(tilted(w, group), roll, group.size);
}

const SOCIAL: readonly LawnKind[] = ['circle', 'selfie', 'dance', 'goof', 'hug'];
const ALONE: readonly LawnKind[] = ['phone', 'reading', 'music'];

/**
 * Who they are tilts the weights (DESIGN.md 64.2): their plan for the hour (a meal makes a picnic, a game a frisbee,
 * a class between lectures a study group), their mood (up: the social kinds; down: music, reading, a nap; tense:
 * revision and a run), and their traits (outgoing pulls to company, shy to doing something alone; funny goofs; laid
 * back lies in the sun; ambitious studies).
 */
function tilted(w: Partial<Record<LawnKind, number>>, group: LawnGroup): Partial<Record<LawnKind, number>> {
  const out = { ...w };
  const times = (kinds: readonly LawnKind[], by: number): void => {
    for (const kind of kinds) if (out[kind] !== undefined) out[kind] = out[kind]! * by;
  };
  if (group.plan === 'food') times(['picnic'], 2.5);
  else if (group.plan === 'play') times(['frisbee', 'catch', 'kick'], 2);
  else if (group.plan === 'class') {
    times(['study'], 2);
    times(['reading', 'phone'], 1.5);
  } else if (group.plan === 'quad' || group.plan === 'seat') times(['circle', 'couple'], 1.3);
  if (group.mood === 'up') times([...SOCIAL, 'frisbee'], 1.4);
  else if (group.mood === 'down') {
    times(['music'], 2.5);
    times(['reading', 'nap'], 1.5);
    times(['selfie', 'dance', 'goof'], 0.3);
  } else if (group.mood === 'tense') {
    times(['study'], 2);
    times(['jog'], 1.5);
  }
  const traits = group.traits ?? {};
  if (traits.outgoing !== undefined) {
    times(SOCIAL, 0.6 + 0.3 * traits.outgoing);
    times(ALONE, 1.5 - 0.3 * traits.outgoing);
  }
  if ((traits.funny ?? 0) >= 2) {
    times(['goof'], 2);
    times(['selfie'], 1.3);
  }
  if ((traits.laidBack ?? 0) >= 2) times(['sun', 'nap'], 1.8);
  if ((traits.ambitious ?? 0) >= 2) {
    times(['study'], 1.8);
    times(['reading'], 1.3);
  }
  return out;
}

/** One kind by weight, from the roll; with nothing that fits, sitting together or on a phone. */
function pick(w: Partial<Record<LawnKind, number>>, roll: number, size: number): LawnKind {
  const entries = Object.entries(w) as Array<[LawnKind, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return size >= 3 ? 'circle' : size === 2 ? 'couple' : 'phone';
  let left = Math.max(0, Math.min(0.999999, roll)) * total;
  for (const [kind, weight] of entries) {
    left -= weight;
    if (left < 0) return kind;
  }
  return entries[entries.length - 1]![0];
}

/** The pose each kind is drawn in: sitting, lying, napping, or standing (walking on the spot for a game). */
export type LawnPose = 'sit' | 'lie' | 'nap' | 'stand' | 'move';
export const LAWN_POSE: Record<LawnKind, LawnPose> = {
  circle: 'sit',
  picnic: 'sit',
  sun: 'lie',
  nap: 'nap',
  study: 'sit',
  guitar: 'sit',
  frisbee: 'stand',
  catch: 'stand',
  kick: 'stand',
  couple: 'sit',
  phone: 'stand',
  reading: 'sit',
  music: 'lie',
  selfie: 'stand',
  hug: 'stand',
  jog: 'move',
  goof: 'move',
  dance: 'stand',
  dog: 'move',
};

/** The "Doing now" line of someone in a group on the grass. `with` is who else is there, by first name. */
export function lawnWords(kind: LawnKind, where: string, with_: readonly string[]): string {
  const others = with_.length === 0 ? '' : with_.length === 1 ? ` with ${with_[0]}` : with_.length === 2 ? ` with ${with_[0]} and ${with_[1]}` : ` with ${with_[0]} and ${with_.length - 1} friends`;
  switch (kind) {
    case 'circle':
      return `Hanging out${others} on ${where}`;
    case 'picnic':
      return `Having a picnic${others} on ${where}`;
    case 'sun':
      return `Lying in the sun on ${where}`;
    case 'nap':
      return `Napping on ${where}`;
    case 'study':
      return `Studying on the grass${others}`;
    case 'guitar':
      return `Playing guitar${others} on ${where}`;
    case 'frisbee':
      return `Throwing a frisbee${others}`;
    case 'catch':
      return `Playing catch${others}`;
    case 'kick':
      return `Kicking a ball around${others}`;
    case 'couple':
      return `Sitting on the grass${others}`;
    case 'phone':
      return `On their phone on ${where}`;
    case 'reading':
      return `Reading on ${where}`;
    case 'music':
      return `Listening to music on ${where}`;
    case 'selfie':
      return `Taking a selfie${others}`;
    case 'hug':
      return `Catching up${others}`;
    case 'jog':
      return `Out for a jog`;
    case 'goof':
      return `Goofing around${others}`;
    case 'dance':
      return `Dancing${others} on ${where}`;
    case 'dog':
      return 'Walking a dog';
  }
}
