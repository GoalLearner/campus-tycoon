import { COVER_SHARE, LOOKS_BY_PACK, type LookGender, type LookTag } from '../config/looks';

/**
 * Picking a figure from a people pack by gender (DESIGN.md 69.3). Pure arithmetic on the pack's look table: nothing
 * here reads a save. `students.ts` decides who a student is; this decides which of the pack's looks they wear.
 */

/** As much of a people pack as picking a figure needs. The art loaders fill `pack` from the manifest. */
export interface LookPack {
  looks: number;
  crowd?: number;
  roles?: Record<string, number>;
  pack?: string;
}

/** The look table for a pack, or null for a pack nobody has tagged (it then keeps the old, gender-blind rule). */
export function lookTags(pack: LookPack | null | undefined): readonly LookTag[] | null {
  const tags = pack?.pack ? LOOKS_BY_PACK[pack.pack] : undefined;
  return tags && tags.length >= Math.min(pack!.looks, pack!.crowd ?? pack!.looks) ? tags : null;
}

/** The share of a gender's students who wear each covering. Nonbinary students wear each at half its share [J]. */
function coverShare(cover: 'hijab' | 'turban', g: LookGender): number {
  if (g === 'x') return COVER_SHARE[cover] / 2;
  return (cover === 'hijab' && g === 'f') || (cover === 'turban' && g === 'm') ? COVER_SHARE[cover] : 0;
}

/**
 * How often each look is worn by students of one gender: everyday looks evenly, each covering at its share. A woman
 * wears a feminine look or one that is either; a man a masculine one or either; a nonbinary student any of them.
 * Uniforms, kit and the older faces are never a student's.
 */
export function lookOdds(tags: readonly LookTag[], g: LookGender): Float64Array {
  const odds = new Float64Array(tags.length);
  const fits = (tag: LookTag): boolean => tag.use === 'student' && (g === 'x' || tag.g === g || tag.g === 'x');
  const covered = { hijab: 0, turban: 0 };
  let everyday = 0;
  for (const tag of tags) {
    if (!fits(tag)) continue;
    if (tag.cover) covered[tag.cover]++;
    else everyday++;
  }
  let left = 1;
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]!;
    if (!fits(tag) || !tag.cover) continue;
    odds[i] = coverShare(tag.cover, g) / covered[tag.cover];
    left -= odds[i]!;
  }
  for (let i = 0; i < tags.length; i++) if (fits(tags[i]!) && !tags[i]!.cover) odds[i] = left / Math.max(1, everyday);
  return odds;
}

/**
 * The plan that moves the old, gender-blind figures to the new odds while changing as few as it can: an old figure
 * that fits is kept as often as the new odds allow (always, for an everyday look), and the rest are drawn again from
 * whatever each look is still short of. Students in the old figures then wear the new odds exactly, on average.
 */
interface Plan {
  /** Out of how many looks the old rule drew. */
  old: number;
  /** The chance an old figure is kept, by look. */
  keep: Float64Array;
  /** The odds of each look for a figure drawn again, adding to 1. */
  refill: Float64Array;
}

const plans = new WeakMap<readonly LookTag[], Map<string, Plan>>();

function planFor(tags: readonly LookTag[], old: number, g: LookGender): Plan {
  let byPack = plans.get(tags);
  if (!byPack) plans.set(tags, (byPack = new Map()));
  const key = `${old}:${g}`;
  const known = byPack.get(key);
  if (known) return known;
  const want = lookOdds(tags, g);
  const keep = new Float64Array(tags.length);
  const refill = new Float64Array(tags.length);
  let total = 0;
  for (let i = 0; i < tags.length; i++) {
    const had = i < old ? 1 / old : 0;
    keep[i] = had > 0 ? Math.min(1, want[i]! / had) : 0;
    refill[i] = Math.max(0, want[i]! - had * keep[i]!);
    total += refill[i]!;
  }
  if (total > 0) for (let i = 0; i < tags.length; i++) refill[i] = refill[i]! / total;
  const plan = { old, keep, refill };
  byPack.set(key, plan);
  return plan;
}

/** One draw from odds that add to 1, by a number in [0, 1). */
export function drawLook(odds: Float64Array, at: number): number {
  let sum = 0;
  let last = 0;
  for (let i = 0; i < odds.length; i++) {
    if (odds[i]! <= 0) continue;
    sum += odds[i]!;
    last = i;
    if (at < sum) return i;
  }
  return last;
}

/**
 * The figure for a student who is not on a varsity roster, by their gender and three numbers of their own: `hash`, the
 * number that picked their old figure, and `keepAt` and `pickAt`, in [0, 1). `old` is how many looks the old rule drew
 * from. Returns the old figure whenever it fits.
 */
export function figureFor(tags: readonly LookTag[], old: number, g: LookGender, hash: number, keepAt: number, pickAt: number): number {
  const plan = planFor(tags, old, g);
  const had = hash % old;
  if (keepAt < plan.keep[had]!) return had;
  return drawLook(plan.refill, pickAt);
}

/** An everyday look for someone in the crowd who is not a student we know: a visitor, a commuter, a neighbour. */
export function everydayLook(pack: LookPack, at: number, pickAt: number): number {
  const tags = lookTags(pack);
  const crowd = Math.max(1, Math.min(pack.looks, pack.crowd ?? pack.looks));
  if (!tags) return Math.min(crowd - 1, Math.floor(pickAt * crowd));
  return drawLook(lookOdds(tags, at < 0.5 ? 'f' : 'm'), pickAt);
}

/** The gender a look is drawn as, or 'x' when the pack has no table for it. */
export function lookGender(pack: LookPack | null | undefined, look: number | null): LookGender {
  if (look === null) return 'x';
  return lookTags(pack)?.[look]?.g ?? 'x';
}
