import { off } from '../sim/config/cleanup';
import {
  COLLECT,
  COLLECT_HOURS,
  dollarsShort,
  eraName,
  ERA_AT_LEVEL,
  ERAS,
  giftWords,
  hasDaily,
  LEVEL_UNLOCKS,
  levelAt,
  levelGifts,
  readyToCollect,
  waits,
  XP_SOURCES,
  ORDER_KINDS,
  ORDER_XP_SHARE,
  type GameState,
  type XpSourceId,
} from '../sim';

/**
 * Words for the University Level (DESIGN.md section 42): the small button
 * under the top bar, the Level page it opens, and the Collect all button.
 * Everything here is read from the lists in `config/daily.ts`, so a source
 * of experience or a gift a later stop adds shows up with no new code.
 */

export interface LevelChip {
  level: number;
  seals: number;
  /** How far to the next level, 0 to 100. */
  percent: number;
}

/** The button under the top bar: the level and the Seals held. null on a game without the layer. */
export function levelChip(state: GameState): LevelChip | null {
  if (!hasDaily(state)) return null;
  const at = levelAt(state.daily.xp);
  return { level: state.daily.level, seals: state.daily.seals, percent: Math.round((100 * at.into) / at.need) };
}

export interface LevelView {
  title: string;
  level: number;
  percent: number;
  /** "140 of 180 experience to Level 6". */
  line: string;
  /** "Level 6 gives 2 Gold Seals." */
  next: string;
  /** The era as the Level page's chapter (DESIGN.md 85.1): "The Growth era · the Flagship era opens at Level 72". '' with none. */
  chapter: string;
  /** The next level past the next one that opens something: "Then Level 15 opens research labs in the Build menu." */
  opens: string;
  seals: number;
  /** What earns experience: by itself first, then by hand. */
  feeds: Array<{ name: string; value: string; itself: boolean }>;
  /** What is ready to collect now, or null when nothing is. */
  ready: { count: number; line: string } | null;
  /** Waits that Seals can finish now, each with its price and whether the Seals held cover it. */
  waits: Array<{ id: string; name: string; detail: string; price: number; can: boolean }>;
}

const seals = (n: number): string => `${n} Gold ${n === 1 ? 'Seal' : 'Seals'}`;

/** What a source pays, as the page says it. Collecting is worked out, so it says the most a building holds. */
function feedValue(id: XpSourceId): string {
  const source = XP_SOURCES[id];
  if (source.xp > 0) return `+${source.xp}`;
  // An order pays what it says: the page gives the most any one of them does.
  if (id === 'order') {
    // The kinds still asked, at the share of their experience they pay with the refill (DESIGN.md 85.3).
    const asked = ORDER_KINDS.filter((kind) => !(kind.point && off('pointOrders')));
    const most = Math.max(...asked.flatMap((kind) => kind.reward.filter((reward) => reward.kind === 'xp').map((reward) => reward.amount)));
    return `up to +${off('dailyOrder') ? Math.round((most * ORDER_XP_SHARE) / 5) * 5 : most}`;
  }
  const most = Math.max(...Object.values(COLLECT).map((rate) => Math.floor((rate?.xpPerHour ?? 0) * COLLECT_HOURS)));
  return `up to +${most}`;
}

/** The era as a chapter of the one ladder (DESIGN.md 85.1), and where the next begins. */
function chapterLine(state: GameState): string {
  if (!state.goals) return '';
  const now = eraName(state.goals);
  const era = ERAS.indexOf(now) + 1;
  const at = ERA_AT_LEVEL[era - 1];
  return at === undefined ? `The ${now} era` : `The ${now} era · the ${ERAS[era]} era begins at Level ${at}`;
}

/** The first level after the next one that opens something besides Seals, and what. '' when none is left. */
function opensLine(level: number): string {
  const ahead = Object.keys(LEVEL_UNLOCKS)
    .map(Number)
    .filter((at) => at > level + 1 && levelGifts(at).some((gift) => gift.kind === 'unlock'))
    .sort((a, b) => a - b)[0];
  if (ahead === undefined) return '';
  return `Then Level ${ahead} opens ${giftWords(levelGifts(ahead).filter((gift) => gift.kind === 'unlock'))}.`;
}

/** The Level page. null on a game without the layer. */
export function levelView(state: GameState): LevelView | null {
  if (!hasDaily(state)) return null;
  const daily = state.daily;
  const at = levelAt(daily.xp);
  const ids = Object.keys(XP_SOURCES) as XpSourceId[];
  const feeds = [...ids.filter((id) => XP_SOURCES[id].itself), ...ids.filter((id) => !XP_SOURCES[id].itself)].map((id) => ({ name: XP_SOURCES[id].name, value: feedValue(id), itself: XP_SOURCES[id].itself }));
  const ready = readyToCollect(state);
  const xp = ready.reduce((sum, one) => sum + one.xp, 0);
  const cash = ready.reduce((sum, one) => sum + one.cash, 0);
  return {
    title: `University Level ${daily.level}`,
    level: daily.level,
    percent: Math.round((100 * at.into) / at.need),
    line: `${at.into} of ${at.need} experience to Level ${daily.level + 1}`,
    next: `Level ${daily.level + 1} gives ${giftWords(levelGifts(daily.level + 1))}.`,
    chapter: chapterLine(state),
    opens: opensLine(daily.level),
    seals: daily.seals,
    feeds,
    ready: ready.length > 0 ? { count: ready.length, line: `${ready.length === 1 ? '1 building is' : `${ready.length} buildings are`} ready to collect: +${xp} experience${cash > 0 ? ` and ${dollarsShort(cash)}` : ''}.` } : null,
    waits: waits(state).map((wait) => ({ id: wait.id, name: wait.name, detail: wait.detail, price: wait.price, can: daily.seals >= wait.price })),
  };
}

/** How many markers show. The Collect all button appears from five. */
export const COLLECT_ALL_FROM = 5;

/** The Collect all button's words, or null while fewer than five buildings are ready. */
export function collectAllChip(state: GameState): string | null {
  const ready = readyToCollect(state).length;
  return ready >= COLLECT_ALL_FROM ? `Collect all · ${ready}` : null;
}

/** What a collect paid, for the toast: "+48 experience and $3,400". */
export function gainedWords(gained: { xp: number; cash: number; count: number }): string {
  const from = gained.count > 1 ? ` from ${gained.count} buildings` : '';
  return `+${gained.xp} experience${gained.cash > 0 ? ` and ${dollarsShort(gained.cash)}` : ''}${from}`;
}

/** The confirm before Seals are spent: what, and how many. */
export function finishConfirm(wait: { name: string; price: number }): string {
  return `Spend ${seals(wait.price)} to finish ${wait.name.charAt(0).toLowerCase()}${wait.name.slice(1)} now?`;
}
