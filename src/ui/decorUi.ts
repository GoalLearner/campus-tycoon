import {
  craftsReady,
  DECOR_REACH,
  decorLift,
  decorOffers,
  decorSpec,
  decorSprite,
  dollarsShort,
  hasDaily,
  liveSeason,
  seasonDates,
  workshopView,
  type DecorOffer,
  type GameState,
  type Placed,
  type WorkshopView,
} from '../sim';
import type { BuildEntry } from './buildMenu';

/**
 * Words for decorations, the Workshop and photo mode (DESIGN.md 42.5 and
 * 42.6, as built from 42.20). Everything is read from the lists in
 * `config/decor.ts`, so a decoration a later stop adds shows up here with no
 * new code.
 */

/** A Build menu card whose id begins with this places a decoration. */
export const DECOR_ENTRY = 'decor:';
/** The card that opens the Workshop, or begins placing a Makerspace on a campus with none. */
export const WORKSHOP_ENTRY = 'workshop';

const seals = (n: number): string => `${n} Gold ${n === 1 ? 'Seal' : 'Seals'}`;

/** How many of a decoration the campus has, for its card: "2 in storage · 3 on campus". '' with none. */
function have(offer: DecorOffer): string {
  const parts: string[] = [];
  if (offer.stored > 0) parts.push(`${offer.stored} in storage`);
  if (offer.placed > 0) parts.push(`${offer.placed} on campus`);
  return parts.join(' · ');
}

function entry(state: GameState, offer: DecorOffer, category: string, cost: string, locked?: string): BuildEntry {
  const card: BuildEntry = {
    id: `${DECOR_ENTRY}${offer.spec.id}`,
    key: decorSprite(state, offer.spec.id),
    name: offer.spec.name,
    category,
    cost,
    footprint: '',
    // A card says what it is, what it costs and how many the campus has. What a decoration does is said once,
    // while one is being placed.
    upkeep: have(offer),
    effect: '',
  };
  if (locked) card.locked = locked;
  return card;
}

/**
 * The decorations of the Build menu, in the order a player wants them:
 * what is in storage, which is free to place; the Decor shelf, with the next
 * two a level will bring; the set of the season, while it is live; the shelf
 * for Gold Seals; and the Workshop. Empty on a game without the layer.
 */
export function decorEntries(state: GameState): BuildEntry[] {
  if (!hasDaily(state)) return [];
  const offers = decorOffers(state);
  const out: BuildEntry[] = [];
  for (const offer of offers) if (offer.stored > 0) out.push(entry(state, offer, 'In storage', 'Free'));
  // The shelf in the order the levels bring it, then the next two to come, so there is always something ahead.
  const level = (offer: DecorOffer): number => (offer.spec.home.kind === 'shelf' ? offer.spec.home.level : 0);
  const shelf = offers.filter((offer) => offer.spec.home.kind === 'shelf').sort((a, b) => level(a) - level(b));
  for (const offer of shelf) if (level(offer) <= state.daily.level) out.push(entry(state, offer, 'Decor', dollarsShort(offer.cost)));
  for (const offer of shelf.filter((one) => level(one) > state.daily.level).slice(0, 2)) out.push(entry(state, offer, 'Decor', '', `Level ${level(offer)}`));
  const live = liveSeason(state);
  if (live) {
    const heading = `${live.name} set, until ${seasonDates(live).split(' to ')[1]}`;
    for (const offer of offers) if (offer.spec.home.kind === 'season' && offer.spec.home.season === live.id) out.push(entry(state, offer, heading, dollarsShort(offer.cost)));
  }
  for (const offer of offers) if (offer.spec.home.kind === 'seals') out.push(entry(state, offer, 'Decor for Gold Seals', seals(offer.seals)));
  const shop = workshopView(state);
  if (shop) {
    const ready = craftsReady(state);
    const making = shop.benches.filter((bench) => bench.making !== '').length;
    out.push({
      id: WORKSHOP_ENTRY,
      key: 'build.makerspace',
      name: 'The Workshop',
      category: 'Decor made on campus',
      cost: shop.makerspace ? (ready > 0 ? `${ready} ready to collect` : making > 0 ? 'Making one now' : 'Idle') : 'Needs a Makerspace',
      footprint: '',
      upkeep: '',
      effect: 'Banners, bunting and more, made here',
    });
  }
  return out;
}

/** The line shown while a decoration is being placed or moved. */
export function decorPlacingLine(state: GameState, id: string, moving: boolean): string {
  const offer = decorOffers(state).find((one) => one.spec.id === id);
  if (!offer) return '';
  if (moving) return `${offer.spec.name} · moving it is free`;
  const price = offer.way === 'storage' ? 'from storage, free' : offer.way === 'cash' ? dollarsShort(offer.cost) : offer.way === 'seals' ? seals(offer.seals) : offer.locked;
  return `${offer.spec.name} · ${price}`;
}

export interface DecorPanel {
  title: string;
  /** True when it runs one way and can be turned. */
  turns: boolean;
}

/** What the panel of a decoration on the map is titled, and whether it can be turned. null for anything else. */
export function decorPanel(placed: Placed | null): DecorPanel | null {
  if (!placed || placed.type !== 'decor') return null;
  const spec = decorSpec(placed.decor);
  return spec ? { title: spec.name, turns: spec.turns === true } : null;
}

/** How much decorations lift each dorm and lecture hall within reach of a cell, by the building's id. */
export function liftsNear(state: GameState, x: number, y: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const building of state.map.buildings) {
    if (!building || building.stage < 1 || Math.max(Math.abs(building.x - x), Math.abs(building.y - y)) > DECOR_REACH) continue;
    out.set(building.id, decorLift(state.map, building.x, building.y));
  }
  return out;
}

/** How many of those buildings look better now than they did. */
export function liftedCount(before: ReadonlyMap<number, number>, after: ReadonlyMap<number, number>): number {
  let count = 0;
  for (const [id, lift] of after) if (lift > (before.get(id) ?? 0) + 1e-9) count += 1;
  return count;
}

/**
 * What placing or moving one says once it is done: its name, and how many
 * buildings near it look better for it. Nothing more is said when none does:
 * the same kind is near them already, or they have all a decoration can give.
 */
export function decorPlacedWords(state: GameState, id: string, way: 'storage' | 'cash' | 'seals' | 'moved', lifted = 0): string {
  const name = decorSpec(id)?.name ?? 'Decoration';
  const better = lifted <= 0 ? '' : lifted === 1 ? ' 1 building near it looks better.' : ` ${lifted} buildings near it look better.`;
  if (way === 'moved') return `${name} moved.${better}`;
  return `${way === 'storage' ? `${name} placed, from storage.` : `${name} placed.`}${better}`;
}

export interface WorkshopPage extends WorkshopView {
  /** One line under the title, when there is something to say: no Makerspace, or no recipe yet. '' otherwise. */
  lead: string;
}

/** The Workshop page. null on a game without the layer. */
export function workshopPage(state: GameState): WorkshopPage | null {
  const view = workshopView(state);
  if (!view) return null;
  const open = view.recipes.filter((recipe) => recipe.locked === '').length;
  const lead = !view.makerspace
    ? 'The Workshop is in the Makerspace, and this campus has none. Build one and it opens.'
    : open === 0
      ? `The first recipe comes at ${view.recipes[0]?.locked ?? 'a later level'}.`
      : '';
  return { ...view, lead };
}

/** The caption photo mode sets under the picture: the school's name, and its rank once it has one. */
export function photoCaption(state: GameState): { name: string; line: string } {
  const rank = state.field.rank;
  return { name: state.school.name, line: rank > 0 ? `No. ${rank} in the country` : `Year ${Math.max(1, state.clock.week.year)}` };
}
