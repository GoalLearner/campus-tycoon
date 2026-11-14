import { hashInts } from '../rng';
import type { StudentRef } from './students';

/**
 * Who each student is to the social campus (DESIGN.md 63): gender, attraction, seven traits, nine interests and their
 * values, made from the seed, the same every time, packed in one 32-bit number. Nothing here is stored.
 *
 *   bits 0-1   gender: 0 woman, 1 man, 2 nonbinary
 *   bits 2-3   attraction: 0 to men, 1 to women, 2 to both, 3 to anyone
 *   bits 4-17  traits, 0 to 3 each: outgoing, kind, loyal, calm, funny, ambitious, laid-back
 *   bits 18-26 interests, one bit each: sports, gaming, music, fitness, partying, studying, art, faith, fashion
 *   bits 27-28 values: 0 school first, 1 fun first, 2 relationship-minded, 3 independent
 *
 * Rates: 56% women, 42% men, 2% nonbinary. Women are 57% of the students who are women or men here, near the 58% of
 * US undergraduates (National Student Clearinghouse, fall 2022). Attraction follows Gallup's February 2025 report for Gen Z adults: 23% of women and 8% of men bisexual,
 * most of everyone else straight. Never shown as a label: a card says who someone is dating, and that is all.
 */

export const TRAIT = { outgoing: 0, kind: 1, loyal: 2, calm: 3, funny: 4, ambitious: 5, laidBack: 6 } as const;
export const INTEREST = { sports: 0, gaming: 1, music: 2, fitness: 3, partying: 4, studying: 5, art: 6, faith: 7, fashion: 8 } as const;
export const GENDERS = ['woman', 'man', 'nonbinary'] as const;
export type Gender = (typeof GENDERS)[number];

const share = (h: number): number => (h >>> 0) / 4294967296;

/** Their gender, 0 woman, 1 man, 2 nonbinary: from the seed alone, so a name can be chosen without the rest. */
export function genderOf(seed: number, ref: StudentRef): number {
  const h = share(hashInts(seed, 9900, ref.entryYear, ref.index, 1));
  return h < 0.56 ? 0 : h < 0.98 ? 1 : 2;
}

function mix(h: number, v: number): number {
  h ^= v | 0;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 13;
  return Math.imul(h, 0x5bd1e995);
}

/** The whole identity. Their nature, from their card, leans their interests and values. */
export function identityOf(seed: number, ref: StudentRef, nature: string): number {
  // hashInts(seed, 9900, entryYear, index, salt), with the first four mixed once: it is called for every student.
  let prefix = 0x811c9dc5;
  prefix = mix(prefix, seed);
  prefix = mix(prefix, 9900);
  prefix = mix(prefix, ref.entryYear);
  prefix = mix(prefix, ref.index);
  const h = (salt: number): number => {
    const v = mix(prefix, salt);
    return share((v ^ (v >>> 15)) >>> 0);
  };
  const g = genderOf(seed, ref);
  const a = h(2);
  // Women: 79% to men, 18% to both, 3% to women. Men: 90% to women, 6% to both, 4% to men. Nonbinary: mostly anyone.
  const attraction = g === 0 ? (a < 0.79 ? 0 : a < 0.97 ? 2 : 1) : g === 1 ? (a < 0.9 ? 1 : a < 0.96 ? 2 : 0) : a < 0.6 ? 3 : 2;
  let bits = g | (attraction << 2);
  for (let t = 0; t < 7; t++) {
    let level = Math.min(3, Math.floor(h(10 + t) * 4));
    // A Party Animal, a Social Butterfly and the Charmer are outgoing; the Homesick and the Lost are shy.
    if (t === TRAIT.outgoing && (nature === 'party' || nature === 'butterfly' || nature === 'charmer' || nature === 'attention')) level = Math.max(level, 2);
    if (t === TRAIT.outgoing && (nature === 'homesick' || nature === 'lost')) level = Math.min(level, 1);
    if (t === TRAIT.ambitious && (nature === 'scholar' || nature === 'stressed')) level = Math.max(level, 2);
    if (t === TRAIT.laidBack && nature === 'slacker') level = 3;
    if (t === TRAIT.funny && nature === 'clown') level = 3;
    bits |= level << (4 + 2 * t);
  }
  let interests = 0;
  for (let i = 0; i < 9; i++) if (h(20 + i) < 0.28) interests |= 1 << i;
  if (nature === 'party') interests |= 1 << INTEREST.partying;
  if (nature === 'scholar' || nature === 'stressed' || nature === 'allNighter') interests |= 1 << INTEREST.studying;
  if (nature === 'athlete' || nature === 'superfan') interests |= (1 << INTEREST.sports) | (1 << INTEREST.fitness);
  bits |= interests << 18;
  const values = nature === 'scholar' || nature === 'stressed' ? 0 : nature === 'party' || nature === 'slacker' ? 1 : Math.floor(h(30) * 4);
  bits |= values << 27;
  return bits >>> 0;
}

export const traitOf = (bits: number, trait: number): number => (bits >>> (4 + 2 * trait)) & 3;
export const gender = (bits: number): number => bits & 3;

/** Does `a`, by their attraction, like `b`'s gender? */
export function likes(a: number, b: number): boolean {
  const attraction = (a >>> 2) & 3;
  const g = b & 3;
  if (attraction >= 2) return true;
  return attraction === 0 ? g === 1 || g === 2 : g === 0 || g === 2;
}

function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Chemistry, -1 to 1: shared interests, the same values, humour, kindness and calm, less jealousy against flirting, and
 * a little of the pair's own luck (`pair`, 0 to 1). Some click fast, some slowly, some clash.
 */
export function chemistry(a: number, b: number, pair: number): number {
  const shared = popcount((a >>> 18) & (b >>> 18) & 0x1ff);
  const values = ((a >>> 27) & 3) === ((b >>> 27) & 3) ? 0.2 : -0.05;
  const humour = (traitOf(a, TRAIT.funny) + traitOf(b, TRAIT.funny)) * 0.04;
  const kind = (traitOf(a, TRAIT.kind) + traitOf(b, TRAIT.kind) - 3) * 0.05;
  const jealousFlirt = (traitOf(a, TRAIT.calm) === 0 && traitOf(b, TRAIT.loyal) === 0) || (traitOf(b, TRAIT.calm) === 0 && traitOf(a, TRAIT.loyal) === 0) ? 0.15 : 0;
  const clash = Math.abs(traitOf(a, TRAIT.calm) - traitOf(b, TRAIT.calm)) * 0.06 + jealousFlirt;
  return Math.max(-1, Math.min(1, shared * 0.12 + values + humour + kind - clash + (pair - 0.5) * 0.6));
}
