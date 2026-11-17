import type { ProtestTopic } from '../sim/config/chaos';

/**
 * The chaos sandbox, stop C2 (DESIGN.md 76): the crowd shows it. The plain rules for how the map stages each chaos
 * incident where it happens (a dust-up, a shouting match, a prank, graffiti, a rally) and how the Chaos meter shows in
 * the everyday crowd. `src/game/Mayhem.ts` stages the incidents with these; the walkers and the moments read the rest.
 *
 * For show only, as all of the crowd is (DESIGN.md 28): nothing here is saved and no number of the game reads it. The
 * incidents themselves, when they start, who answers and when they end, are the simulation's (68.1).
 *
 * Tone (16.1, 52.2, 68): a dust-up is a cloud of dust and stars, never a drawn punch; nobody is hurt worse than a bruise;
 * the words are comic.
 */

/**
 * The kinds of chaos incident the map stages, and football's (C3, DESIGN.md 77): couches in the street, the goalposts
 * carried off after a field storming, and the rival's mascot shown round campus.
 */
export type IncidentShowKind = 'dustUp' | 'shouting' | 'prank' | 'graffiti' | 'protest';
export type ShowKind = IncidentShowKind | 'street' | 'goalposts' | 'mascot';

/** No more incidents staged at once than this, the nearest the middle of the view first: the frame budget. */
export const SHOWS_AT_ONCE = 3;

// ------------------------------------------------------------ the crowd --

/**
 * How the meter shows in the everyday crowd, by its step (Serene to Pandemonium): how often the crowd's own scuffles
 * and arguments come (times the moments of 64.4), how likely two who meet are to have a shouting match, the share of
 * strangers passing who bump and glare, the gap between moments (times 64.4's), and whether scuffles happen in daylight.
 */
export interface ChaosCrowd {
  moments: number;
  shouting: number;
  bump: number;
  gap: number;
  daytime: boolean;
}

/** A campus without chaos (the small campus of before): the crowd as it was. */
export const NO_CHAOS: ChaosCrowd = { moments: 1, shouting: 0, bump: 0, gap: 1, daytime: false };

/** [T] By the meter's step, 0 Serene to 5 Pandemonium. */
export const CHAOS_CROWD: readonly ChaosCrowd[] = [
  { moments: 0.5, shouting: 0, bump: 0, gap: 1.3, daytime: false },
  { moments: 1, shouting: 0, bump: 0.03, gap: 1, daytime: false },
  { moments: 1.3, shouting: 0.4, bump: 0.06, gap: 0.9, daytime: false },
  { moments: 1.8, shouting: 0.8, bump: 0.12, gap: 0.75, daytime: true },
  { moments: 2.4, shouting: 1.2, bump: 0.18, gap: 0.6, daytime: true },
  { moments: 3, shouting: 1.6, bump: 0.25, gap: 0.5, daytime: true },
];

/** The crowd for the meter's step, or as before on a campus with no chaos (null). */
export function chaosCrowd(step: number | null): ChaosCrowd {
  if (step === null) return NO_CHAOS;
  return CHAOS_CROWD[Math.max(0, Math.min(CHAOS_CROWD.length - 1, Math.floor(step)))]!;
}

/** Watchers of a dust-up or a chase run over to see it, this many times their walk. */
export const WATCH_RUN = 1.9;

// ------------------------------------------------------------ the shows --

/**
 * A dust-up, round by round: the two argue (a big bubble), vanish into the cloud with its stars, come out apart and
 * glaring. Three rounds at most; then they stand apart, scowling, until Campus Safety arrives, or part on their own when
 * nobody is coming. The cloud lasts as long as the crowd's own (Walkers' DUST_MS).
 */
export const DUSTUP_BEATS = { argue: 2000, cloud: 2800, apart: 6200 } as const;
export const DUSTUP_ROUNDS = 3;
const ROUND_MS = DUSTUP_BEATS.argue + DUSTUP_BEATS.cloud + DUSTUP_BEATS.apart;

export type DustupPhase = 'argue' | 'cloud' | 'apart' | 'glare';

/** Where a dust-up is, `ms` after both are in their places. */
export function dustupBeat(ms: number): { phase: DustupPhase; round: number; into: number } {
  const t = Math.max(0, ms);
  const round = Math.floor(t / ROUND_MS);
  if (round >= DUSTUP_ROUNDS) return { phase: 'glare', round: DUSTUP_ROUNDS, into: t - DUSTUP_ROUNDS * ROUND_MS };
  const into = t - round * ROUND_MS;
  if (into < DUSTUP_BEATS.argue) return { phase: 'argue', round, into };
  if (into < DUSTUP_BEATS.argue + DUSTUP_BEATS.cloud) return { phase: 'cloud', round, into: into - DUSTUP_BEATS.argue };
  return { phase: 'apart', round, into: into - DUSTUP_BEATS.argue - DUSTUP_BEATS.cloud };
}

/** With nobody coming, how long a dust-up or a shouting match is played out before the two part on their own. */
export const LEFT_ALONE_MS = { dustUp: DUSTUP_ROUNDS * ROUND_MS + 8000, shouting: 45_000, prank: 40_000, graffiti: 40_000 } as const;

/** A shouting match: each has their say in turn, this long a turn. */
export const SHOUT_TURN_MS = 1700;

/** Whose turn it is to shout, `ms` after both are in their places: 0 or 1. */
export function shoutTurn(ms: number): 0 | 1 {
  return Math.floor(Math.max(0, ms) / SHOUT_TURN_MS) % 2 === 0 ? 0 : 1;
}

/**
 * Campus Safety runs to a chaos incident (DESIGN.md 76.3): they set off later than a walk would and run, arriving on the
 * minute the simulation gave. `began` and `ends` are when the incident began and when they arrive, in real time; `cells`
 * is how far they go. Returns when they set off.
 */
export function setOff(began: number, ends: number, cells: number, runPerSecond = RUN): number {
  return Math.max(began, ends - (cells / runPerSecond) * 1000);
}

/** How far along their way someone who set off at `from` to arrive at `ends` is at `now`, 0 to 1. */
export function alongBy(from: number, ends: number, now: number): number {
  if (ends <= from) return now >= ends ? 1 : 0;
  return Math.max(0, Math.min(1, (now - from) / (ends - from)));
}

/** [T] Running, in cells a second: Campus Safety, and a prankster getting away, a little quicker. A walk is 0.85. */
export const RUN = 2.2;
export const FLEE = 2.6;
/** A prankster bolts this long before Campus Safety gets there, and Campus Safety chases this far before giving up. */
export const FLEE_BEFORE_MS = 2600;
export const CHASE_CELLS = 4.5;

/** People at a rally, by the crowd step (0 the step kept for short frames, 3 High). */
export const RALLY_AT_STEP: readonly number[] = [4, 6, 9, 12];

export function rallySize(step: number): number {
  return RALLY_AT_STEP[Math.max(0, Math.min(RALLY_AT_STEP.length - 1, step))]!;
}

/** The sign a rally holds up for each thing students protest about: a picture, no words. */
export function signKey(topic: ProtestTopic): string {
  return `emote.sign-${topic}`;
}

/** A rally chants in turn: one more voice this often, and a passer-by stops to look about this often. */
export const CHANT_MS = 2400;
export const RALLY_WATCH_MS = 30_000;

/**
 * Which incidents to stage: chaos's, where the player is looking, nearest the middle of the view first, a few at most.
 * `far` is how far each is from the middle of the view, or null when it is out of sight.
 */
export function showsFor<T extends { id: number; chaos?: IncidentShowKind }>(incidents: readonly T[], far: (incident: T) => number | null, most = SHOWS_AT_ONCE): T[] {
  const seen: Array<{ incident: T; far: number }> = [];
  for (const incident of incidents) {
    if (!incident.chaos) continue;
    const d = far(incident);
    if (d !== null) seen.push({ incident, far: d });
  }
  seen.sort((a, b) => a.far - b.far || a.incident.id - b.incident.id);
  return seen.slice(0, most).map((one) => one.incident);
}

// ------------------------------------------------------------ the cards --

/** What someone in a staged incident is doing, on their card. */
export type ShowRole = 'dustUp' | 'shouting' | 'prank' | 'graffiti' | 'protest' | 'patched' | 'street' | 'goalposts' | 'mascot';

const RALLY_WORDS: Record<ProtestTopic, string> = {
  beds: 'At a rally for more beds',
  food: 'At a rally for food near every hall',
  parking: 'At a rally about parking',
  policy: 'At a rally against a campus policy',
};

export function showWords(role: ShowRole, topic: ProtestTopic | null = null): string {
  switch (role) {
    case 'dustUp':
      return 'In a dust-up outside a dorm';
    case 'shouting':
      return 'In a shouting match outside a dorm';
    case 'prank':
      return 'Pulling a prank on a dorm';
    case 'graffiti':
      return 'Painting a very large squirrel on a dorm';
    case 'protest':
      return RALLY_WORDS[topic ?? 'beds'];
    case 'patched':
      return 'Getting a bruise patched up';
    case 'street':
      return 'Out on a couch in the street after the game';
    case 'goalposts':
      return 'Carrying the goalposts across campus';
    case 'mascot':
      return "Showing the rival's mascot round campus";
  }
}

// ------------------------------------------------------------- football --

/** Couches in the street (DESIGN.md 77.3): people out with them by the crowd step, and the two couches. */
export const STREET_AT_STEP: readonly number[] = [3, 5, 7, 8];

export function streetSize(step: number): number {
  return STREET_AT_STEP[Math.max(0, Math.min(STREET_AT_STEP.length - 1, step))]!;
}

/**
 * The goalposts carried off (77.2): this many carry them, at this pace, setting off from the stadium once the fans on
 * the field have gone (the storming's five minutes, CampusScene's STORM_TICKS), for a while after.
 */
export const CARRIERS = 6;
export const CARRY_PACE = 0.7;
export const CARRY_FROM_TICKS = 5;
export const CARRY_UNTIL_TICKS = 25;

/** The rival's mascot shown round campus (77.4): those with it, and the pace of a slow lap of a lawn. */
export const PARADE = 4;
export const PARADE_PACE = 0.55;
