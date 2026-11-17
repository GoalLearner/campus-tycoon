import type { PlacedType } from '../types';

/**
 * What students use (the owner, 2026-11-17: "It's whether the student actually uses these facilities or not"; DESIGN.md
 * 83). Each student does some of these for fun, or none, and gets the lift of each one the campus has with room for
 * them; where they live plays no part.
 *
 * The shares are of all students who use each regularly, with a real figure where there is one [T]: about three in four
 * students use campus recreation and four in five of those weekly (Forrester for NIRSA, 2014, from the NIRSA/NASPA
 * consortium survey), so about 60% use it regularly. Of recreation's users about seven in ten use the cardio and weight
 * equipment and three in ten the pool (a public university's NASPA consortium survey, 2019), and about a quarter play
 * intramural or club sports (a Canadian university's student survey, 2023). The rest is judgement.
 */
export const PASTIMES = ['workout', 'swim', 'run', 'basketball', 'field', 'volleyball', 'tennis', 'making'] as const;
export type Pastime = (typeof PASTIMES)[number];

/** The kind of place each activity needs. Outdoor courts and basketball courts both take a game of basketball. */
export const PASTIME_OF: Partial<Record<PlacedType, Pastime>> = {
  gym: 'workout',
  pool: 'swim',
  track: 'run',
  courts: 'basketball',
  basketball: 'basketball',
  field: 'field',
  soccer: 'field',
  volleyball: 'volleyball',
  tennis: 'tennis',
  makerspace: 'making',
};

/**
 * [T] The chance a student does each regularly: with the interest that leans them to it, and without. An athlete or a
 * superfan always has the interests in fitness and sports. About 45% work out, 16% swim, 8% run laps, 12 to 13% play
 * basketball or field games, 5 to 6% volleyball or tennis and 8% use a Makerspace; about 70% do something.
 */
export const PASTIME_ODDS: Readonly<Record<Pastime, { lean: 'fitness' | 'sports' | 'art'; with: number; without: number }>> = {
  workout: { lean: 'fitness', with: 0.85, without: 0.28 },
  swim: { lean: 'fitness', with: 0.3, without: 0.1 },
  run: { lean: 'fitness', with: 0.15, without: 0.05 },
  basketball: { lean: 'sports', with: 0.3, without: 0.05 },
  field: { lean: 'sports', with: 0.3, without: 0.05 },
  volleyball: { lean: 'sports', with: 0.12, without: 0.03 },
  tennis: { lean: 'sports', with: 0.12, without: 0.03 },
  making: { lean: 'art', with: 0.2, without: 0.03 },
};

/** [T] The share who meet friends at the Student Union once it is open, by how outgoing they are. */
export const UNION_USE = { outgoing: 0.8, other: 0.45 } as const;

/** Words for each: their day's line, what the card says they use, and what a student who misses it says. */
export const PASTIME_WORDS: Readonly<Record<Pastime, { doing: string; uses: string; verb: string; place: string }>> = {
  workout: { doing: 'A workout', uses: 'the gym', verb: 'work out', place: 'a gym' },
  swim: { doing: 'A swim', uses: 'the pool', verb: 'swim', place: 'a pool' },
  run: { doing: 'Laps on the track', uses: 'the track', verb: 'run laps', place: 'a track' },
  basketball: { doing: 'Pickup basketball', uses: 'basketball', verb: 'play basketball', place: 'a court' },
  field: { doing: 'A game on the field', uses: 'field games', verb: 'play soccer', place: 'a field' },
  volleyball: { doing: 'Volleyball', uses: 'volleyball', verb: 'play volleyball', place: 'a volleyball court' },
  tennis: { doing: 'Tennis', uses: 'tennis', verb: 'play tennis', place: 'a tennis court' },
  making: { doing: 'At the Makerspace', uses: 'the Makerspace', verb: 'make things', place: 'a Makerspace' },
};
