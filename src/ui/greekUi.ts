import {
  cannotBuildChapter,
  chapterBeds,
  chapterLift,
  chapterOf,
  chapterStatus,
  chapterTrouble,
  chapters,
  CHAPTER_NOISE_REACH,
  dollarsShort,
  duration,
  greekDrag,
  greekMembers,
  greekShare,
  hasDaily,
  hazingRisk,
  pledgeSeason,
  headCount,
  nextGreekDay,
  placedCost,
  probationIn,
  type Chapter,
  type ChapterStatus,
  type GameState,
  type Placed,
} from '../sim';
import type { BuildEntry } from './buildMenu';

/**
 * Greek Row on screen (DESIGN.md 51): the chapter house's card in the Build
 * menu, a house's line when tapped, and its chapter's panel.
 */

/** The chapter house's card, under Greek Row, on a game with goals. Before the Growth era, or at the most, it says why. */
export function greekEntries(state: GameState, scale: number, card: (type: Placed['type']) => BuildEntry): BuildEntry[] {
  if (!hasDaily(state)) return [];
  const entry = card('chapterHouse');
  const why = cannotBuildChapter(state);
  if (why) entry.locked = why.replace(/\.$/, '');
  else entry.cost = dollarsShort(placedCost('chapterHouse', scale));
  return [entry];
}

export const STATUS_NAME: Record<ChapterStatus, string> = { good: 'Good standing', warning: 'On Warning', probation: 'On Probation', suspended: 'Suspended' };

/** What is wrong with a chapter, and what puts it right, in plain words. Empty for a chapter with nothing wrong. */
export function troubleLines(state: GameState, chapter: Chapter): { wrong: string; fix: string } | null {
  const trouble = chapterTrouble(state, chapter);
  const wrong: string[] = [];
  const fix: string[] = [];
  if (trouble.overfull) {
    wrong.push(`${headCount(chapter.members)} members for ${headCount(chapterBeds(state))} beds`);
    fix.push('another chapter house gives them room');
  }
  if (trouble.unsafe) {
    wrong.push('Campus Safety does not reach the house');
    fix.push('a Campus Safety office in reach');
  }
  if (wrong.length === 0) return null;
  const sentence = (parts: string[]): string => {
    const text = parts.join(', and ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  };
  return { wrong: sentence(wrong), fix: `Fix: ${fix.join(', and ')}.` };
}

/** A house's line when it is tapped: its chapter's standing and size. */
export function chapterSummary(state: GameState, placed: Placed): string {
  const chapter = chapterOf(state, placed.id);
  if (!chapter) return 'A chapter house.';
  const status = chapterStatus(state, chapter);
  const lift = chapterLift(state, chapter).points;
  const parts = [`${chapter.name} · ${STATUS_NAME[status]}.`, `${headCount(chapter.members)} members, ${headCount(chapterBeds(state))} beds.`];
  const trouble = troubleLines(state, chapter);
  if (trouble) parts.push(`${trouble.wrong} ${trouble.fix}`);
  if (status === 'suspended') parts.push('Suspended for hazing until rush week: the house stands empty.');
  else parts.push(lift > 0 ? `Its members' Food & fun is ${lift} points higher.` : 'Its members feel nothing from the house while it is on Probation.');
  return parts.join(' ');
}

export interface ChapterPage {
  title: string;
  status: ChapterStatus;
  /** The standing, in words, with what is wrong and what puts it right. */
  standing: string[];
  /** Label and value rows. */
  rows: Array<[string, string]>;
  /** Greek Row as a whole, in one line. */
  row: string;
}

/** Everything a chapter's panel shows. */
export function chapterPage(state: GameState, placed: Placed): ChapterPage | null {
  const chapter = chapterOf(state, placed.id);
  if (!chapter) return null;
  const status = chapterStatus(state, chapter);
  const standing: string[] = [STATUS_NAME[status]];
  const tick = state.clock.tick;
  // A suspension or a probation for hazing lasts until rush week (DESIGN.md 55).
  if (chapter.suspendedUntil > tick) standing.push(`Suspended for hazing until rush week, in ${duration(chapter.suspendedUntil - tick)}. Its members are back in the dorms.`);
  else if (chapter.probationUntil > tick) standing.push(`On probation for hazing until rush week, in ${duration(chapter.probationUntil - tick)}. Its members lose what the house gives them, and a second report would suspend it.`);
  const trouble = troubleLines(state, chapter);
  if (trouble && status !== 'suspended') {
    standing.push(trouble.wrong, trouble.fix);
    const left = probationIn(state, chapter);
    if (left !== null) standing.push(`Probation in ${duration(Math.max(1, left))} if nothing changes.`);
    if (status === 'probation' && chapter.probationUntil <= tick) standing.push('On Probation its members lose what the house gives them, and it pranks more.');
  }
  const lift = chapterLift(state, chapter);
  const rows: Array<[string, string]> = [];
  rows.push(['Members', `${headCount(chapter.members)} in a house of ${headCount(chapterBeds(state))} beds${chapter.pledges > 0 ? ` · ${headCount(chapter.pledges)} joined ${chapter.events.some((event) => event.kind === 'rush') ? 'at the last rush' : 'when it was founded'}` : ''}`]);
  rows.push([
    'Its members feel',
    lift.points > 0 ? `Food & fun +${lift.points}: ${lift.parts.map((part) => `${part.label.toLowerCase()} +${part.points}`).join(', ')}` : status === 'suspended' ? 'Nothing: the chapter is suspended' : 'Nothing while on Probation',
  ]);
  // Its hazing risk, and why (DESIGN.md 55): reports come in pledge season, the first hours after rush week.
  if (status !== 'suspended') {
    const risk = hazingRisk(state, chapter);
    rows.push(['Hazing risk', `${risk.level}: ${risk.why.join(', ')}${pledgeSeason(state) ? '. Pledge season: reports come now' : ''}`]);
  }
  let near = 0;
  for (const building of state.map.buildings) {
    if (!building || building.stage < 1) continue;
    const distance = Math.max(Math.max(placed.x - building.x, 0, building.x - placed.x), Math.max(placed.y - building.y, 0, building.y - placed.y));
    if (distance <= CHAPTER_NOISE_REACH) near += 1;
  }
  rows.push(['Noise', near > 0 ? `Heard in ${headCount(near)} ${near === 1 ? 'dorm or lecture hall' : 'dorms and lecture halls'} within ${CHAPTER_NOISE_REACH} cells` : `No dorm or lecture hall within ${CHAPTER_NOISE_REACH} cells hears it`]);
  rows.push(['Since rush', `${chapter.pranks === 1 ? '1 prank' : `${chapter.pranks} pranks`} · ${chapter.giving === 1 ? '1 philanthropy event' : `${chapter.giving} philanthropy events`}`]);
  // Its record: the last few things it did, newest first.
  for (const event of chapter.events.slice(-3).reverse()) rows.push([`${duration(Math.max(60, state.clock.tick - event.tick))} ago`, event.text]);
  const rush = nextGreekDay(state, 0);
  const giving = nextGreekDay(state, 1);
  if (rush !== null) rows.push(['Next rush week', `In ${duration(rush - state.clock.tick)}`]);
  if (giving !== null) rows.push(['Philanthropy', `Each spring, in ${duration(giving - state.clock.tick)}`]);
  const members = greekMembers(state);
  const share = greekShare(state);
  const drag = greekDrag(state);
  const count = chapters(state).length;
  const row = `Greek Row: ${count === 1 ? '1 chapter' : `${count} chapters`}, ${headCount(members)} students, ${share >= 0.1 ? Math.round(share * 100) : Math.round(share * 1000) / 10}% of the campus. The graduation rate in the academic rating is ${drag.points} ${drag.points === 1 ? 'point' : 'points'} lower for it.`;
  return { title: chapter.name, status, standing, rows, row };
}
