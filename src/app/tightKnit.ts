import { CLUBS } from '../sim/config/students';
import { FRIEND_AT, KIND, SLOTS } from '../sim/config/web';
import { dormName } from '../sim/systems/people';
import type { Web } from '../sim/systems/web';
import type { GameState } from '../sim/types';

/**
 * The most tight-knit places on campus, for the Social tab (DESIGN.md 63.12). A read for show, made in the web's
 * worker each week: it names halls by the card's names, which the simulation itself never reads.
 */

/** A group of students who spend time together, and how tight-knit it is (DESIGN.md 63.12). */
export interface TightGroup {
  kind: 'hall' | 'club' | 'chapter' | 'team';
  name: string;
  members: number;
  /** Of its members' friendships, the share that stay inside it, 0 to 1: how many of the ties are among themselves. */
  share: number;
}

/** A group this small is left out: a share of a handful says little. */
export const TIGHT_FROM = 12;
/** Nor is one with fewer of its friendships inside than this: a list of the most tight-knit does not end on a stranger's. */
export const TIGHT_SHOWN = 0.05;

/**
 * The most tight-knit dorms, clubs, chapters and the varsity teams (DESIGN.md 63.12): for each, of its members'
 * friendships (a friend, a best friend, a roommate, a partner, a crush who is a friend), the share that stay inside it.
 * Nearly everyone has a friend on their own floor, so whether they have one says little; how much of their circle is
 * there says how close a place keeps people. The best two of each kind, the tightest first.
 */
export function tightKnit(web: Web, state: GameState): TightGroup[] {
  const groups = new Map<string, { kind: TightGroup['kind']; name: () => string; ids: number[] }>();
  const chapterNames = [...web.chapterIndex.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  const add = (key: string, kind: TightGroup['kind'], name: () => string, id: number): void => {
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { kind, name, ids: [id] });
  };
  for (let id = 0; id < web.n; id++) {
    if (web.year[id]! < 0) continue;
    const floor = web.place[0]![id]!;
    if (floor >= 0) add(`h${floor >> 6}`, 'hall', () => dormName(state, floor >> 6), id);
    const table = web.place[2]![id]!;
    if (table >= 0) add(`c${table >> 8}`, 'club', () => CLUBS[table >> 8]?.name ?? 'A club', id);
    const chapter = web.place[4]![id]!;
    if (chapter >= 0) add(`p${chapter}`, 'chapter', () => chapterNames[chapter] ?? 'A chapter', id);
    if (web.place[3]![id]! >= 0) add('t', 'team', () => 'The varsity teams', id);
  }
  const mark = new Int32Array(web.n).fill(-1);
  const out: TightGroup[] = [];
  let g = 0;
  for (const group of groups.values()) {
    g += 1;
    if (group.ids.length < TIGHT_FROM) continue;
    for (const id of group.ids) mark[id] = g;
    let inside = 0;
    let all = 0;
    for (const a of group.ids) {
      for (let k = 0; k < SLOTS; k++) {
        const s = a * SLOTS + k;
        const b = web.other[s]!;
        if (b < 0 || web.strength[s]! < FRIEND_AT) continue;
        const kind = web.kind[s]!;
        if (!(kind === KIND.friend || kind === KIND.best || kind === KIND.roommate || kind === KIND.crush || (kind >= KIND.dating && kind <= KIND.longterm))) continue;
        all += 1;
        if (mark[b] === g) inside += 1;
      }
    }
    if (all > 0 && inside / all >= TIGHT_SHOWN) out.push({ kind: group.kind, name: group.name(), members: group.ids.length, share: inside / all });
  }
  const best: TightGroup[] = [];
  for (const kind of ['hall', 'club', 'chapter', 'team'] as const) best.push(...out.filter((one) => one.kind === kind).sort((a, b) => b.share - a.share || b.members - a.members).slice(0, 2));
  return best.sort((a, b) => b.share - a.share || b.members - a.members);
}
