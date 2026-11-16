import type { DayPeriod } from './daylight';
import { NO_CHAOS, type ChaosCrowd } from './mayhemShow';
import type { Weather } from './life';

/**
 * The living campus, L3 (DESIGN.md 64.4): moments the crowd gathers round. Now and then something happens where the
 * player is looking, and the people nearby stop, turn to watch, and react. This is the plain rule for which moment and
 * how the crowd takes it; `src/game/Moments.ts` stages it with the walkers, the lawns, the courts and the small scenes.
 * For show only: nothing here is saved, nothing changes a number.
 */

/**
 * The chaos sandbox, C2 (DESIGN.md 76), adds three: a shouting match between two who meet (no cloud), and two the map
 * stages at a chaos incident and the crowd watches, never chosen here: a rally, and Campus Safety chasing a prankster.
 */
export type MomentKind = 'dustup' | 'coupleFight' | 'performer' | 'danceOff' | 'proposal' | 'fountain' | 'winningShot' | 'shouting' | 'rally' | 'prank';
export const MOMENT_KINDS: readonly MomentKind[] = ['dustup', 'coupleFight', 'performer', 'danceOff', 'proposal', 'fountain', 'winningShot', 'shouting', 'rally', 'prank'];

/** What the moment could be made of now: the hour, the sky, the calendar, and what is on screen. */
export interface MomentFacts {
  period: DayPeriod;
  weather: Weather;
  /** Thursday to Saturday (63.11). */
  partyNight: boolean;
  /** Commencement day (the calendar's). */
  commencement: boolean;
  /** On screen now: a busker, a dance on a lawn, a game on the courts or the field, a fountain with someone near it,
   * a couple out together, two students walking close. */
  busker: boolean;
  dance: boolean;
  courts: boolean;
  fountain: boolean;
  couples: boolean;
  pairs: boolean;
  /** How the Chaos meter shows in the crowd (DESIGN.md 76.5); as before when left out. */
  chaos?: ChaosCrowd;
}

/**
 * How likely each moment is, when it can happen. A scuffle is a rare thing of the evening, likelier on a party night;
 * a proposal belongs to commencement; a fall into a fountain to a fine day; the rest go with what is on screen.
 */
export function momentWeights(facts: MomentFacts): Partial<Record<MomentKind, number>> {
  const fine = facts.weather === 'clear';
  const late = facts.period === 'evening' || facts.period === 'night';
  // The meter (76.5): scuffles and arguments more often the rowdier the campus, in daylight too from Rowdy, fewer when serene.
  const chaos = facts.chaos ?? NO_CHAOS;
  const out: Partial<Record<MomentKind, number>> = {};
  const add = (kind: MomentKind, weight: number): void => {
    if (weight > 0) out[kind] = weight;
  };
  add('dustup', facts.pairs && (late || chaos.daytime) && facts.weather !== 'snow' ? (facts.partyNight ? 1.2 : 0.4) * chaos.moments : 0);
  add('coupleFight', facts.couples ? 0.8 * chaos.moments : 0);
  add('shouting', facts.pairs ? chaos.shouting : 0);
  add('performer', facts.busker ? 2 : 0);
  add('danceOff', facts.dance && late ? 2.5 : 0);
  add('proposal', facts.commencement && facts.couples ? 4 : 0);
  add('fountain', facts.fountain && fine && facts.period !== 'night' ? 1 : 0);
  add('winningShot', facts.courts ? 1.5 : 0);
  return out;
}

/** The moment to stage, chosen by weight with `roll` (0 to 1, from the seed and the clock), or null when none can. */
export function chooseMoment(facts: MomentFacts, roll: number): MomentKind | null {
  const entries = Object.entries(momentWeights(facts)) as Array<[MomentKind, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return null;
  let left = Math.max(0, Math.min(0.999999, roll)) * total;
  for (const [kind, weight] of entries) {
    left -= weight;
    if (left < 0) return kind;
  }
  return entries[entries.length - 1]![0];
}

/** How long a moment holds the crowd. */
export const MOMENT_MS: Record<MomentKind, number> = {
  dustup: 6500,
  coupleFight: 7000,
  performer: 9000,
  danceOff: 9000,
  proposal: 9000,
  fountain: 6500,
  winningShot: 6000,
  shouting: 6000,
  rally: 7000,
  prank: 5000,
};

/** Between two moments where the player is looking: long enough that each is an event. */
export const MOMENT_GAP_MS: readonly [number, number] = [20_000, 45_000];

/** The most who walk over to watch, by crowd step; others near enough stop where they are and turn. */
export const WATCHERS_AT_STEP: readonly number[] = [0, 4, 7, 10];

/** How far a moment draws people, in cells. */
export const WATCH_REACH = 3.2;

/** How the crowd takes it: the emotes watchers show, and whether some of them cheer (a jump). */
export const WATCH_REACTIONS: Record<MomentKind, { emotes: readonly string[]; cheer: boolean }> = {
  dustup: { emotes: ['exclaim', 'sweat', 'exclaim', 'laugh'], cheer: false },
  coupleFight: { emotes: ['sweat', 'exclaim', 'thought'], cheer: false },
  performer: { emotes: ['music', 'sparkle', 'music', 'laugh'], cheer: false },
  danceOff: { emotes: ['exclaim', 'laugh', 'music', 'highfive'], cheer: true },
  proposal: { emotes: ['heart', 'sparkle', 'exclaim', 'heart'], cheer: true },
  fountain: { emotes: ['laugh', 'laugh', 'exclaim', 'sweat'], cheer: false },
  winningShot: { emotes: ['exclaim', 'highfive', 'fistbump', 'laugh'], cheer: true },
  shouting: { emotes: ['exclaim', 'sweat', 'thought', 'exclaim'], cheer: false },
  rally: { emotes: ['thought', 'exclaim', 'speech', 'sparkle'], cheer: false },
  prank: { emotes: ['laugh', 'exclaim', 'laugh', 'laugh'], cheer: false },
};

/** A watcher's line on their card, for their day. */
export function watchWords(kind: MomentKind): string {
  switch (kind) {
    case 'dustup':
      return 'Saw a scuffle break out';
    case 'coupleFight':
      return 'Saw a couple arguing';
    case 'performer':
      return 'Stopped to hear a busker';
    case 'danceOff':
      return 'Cheered on a dance-off';
    case 'proposal':
      return 'Saw someone propose at commencement';
    case 'fountain':
      return 'Laughed when someone fell in the fountain';
    case 'winningShot':
      return 'Watched a game-winning shot on the courts';
    case 'shouting':
      return 'Saw a shouting match';
    case 'rally':
      return 'Stopped to watch a rally';
    case 'prank':
      return 'Saw Campus Safety chase a prankster';
  }
}

/** What the moment was, for those in it, with the other's first name where there is one. */
export function actorWords(kind: MomentKind, other: string | null, first = true): string {
  switch (kind) {
    case 'dustup':
      return other ? `Got into a scuffle with ${other}` : 'Got into a scuffle';
    case 'coupleFight':
      return other ? `Had an argument with ${other}` : 'Had an argument';
    case 'proposal':
      return other ? (first ? `Proposed to ${other} at commencement` : `Said yes to ${other} at commencement`) : 'Got engaged at commencement';
    case 'fountain':
      return 'Fell in the fountain';
    case 'winningShot':
      return 'Made the game-winning shot';
    case 'performer':
      return 'Played to a crowd';
    case 'danceOff':
      return 'Won a dance-off';
    case 'shouting':
      return other ? `Had a shouting match with ${other}` : 'Had a shouting match';
    case 'rally':
      return 'Spoke up at a rally';
    case 'prank':
      return 'Got away from Campus Safety after a prank';
  }
}
