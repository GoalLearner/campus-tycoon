import type { GameState, StudentRef } from '../sim';
import {
  CAUSE_POSTS,
  CAUSE_TOPICS,
  COMMENT_LINES,
  COMMENTER_LEAN,
  POST,
  POST_WORDS,
  postLines,
  type CommentKind,
  type PostKind,
} from '../sim/config/quadline';
import { CLUBS } from '../sim/config/students';
import { TRADITIONS } from '../sim/config/traditions';
import { FEEL, KIND, SLOTS, WEB_WEEK_TICKS } from '../sim/config/web';
import { hashInts } from '../sim/rng';
import { teamName } from '../sim/systems/football';
import { dormName, hallName } from '../sim/systems/people';
import { aboutStudent, postsOf, type Post } from '../sim/systems/quadline';
import { classYearOf, firstNameOf, socialProfile, studentName } from '../sim/systems/students';
import { idIn, refIn, type WebView } from './socialView';

/**
 * Quadline on the phone (DESIGN.md 63.13): a post's words rebuilt from its numbers and the templates, when it went up,
 * its likes and comments, a student's followers, and what is trending. Nothing here is stored: the same web and the
 * same campus give the same feed, likes and comments every time it is opened.
 */

export type { Post } from '../sim/systems/quadline';

const share = (h: number): number => (h >>> 0) / 4294967296;
const same = (a: StudentRef, b: StudentRef): boolean => a.entryYear === b.entryYear && a.index === b.index;
const enrolled = (state: GameState, ref: StudentRef): boolean => classYearOf(state, ref) !== null;

/** The feed, newest first: every kept post whose author is still a student. */
export function feedOf(view: WebView, state: GameState): Post[] {
  return postsOf(view.posts, view.viral).filter((post) => enrolled(state, post.author));
}

/** The other student a post is about, if it is about one. */
export function postSubject(post: Post): StudentRef | null {
  return aboutStudent(post.kind) ? { entryYear: post.a, index: post.b } : null;
}

const CLASS_NAMES = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const;
/** "Sophomore", or "" once they have left. */
export function classWord(state: GameState, ref: StudentRef): string {
  const year = classYearOf(state, ref);
  return year === null ? '' : (CLASS_NAMES[year] ?? '');
}

/** A building's name for a post, by its cell: a dorm's or a lecture hall's, or the campus's when it has gone. */
function placeName(state: GameState, cell: number): string {
  if (cell < 0) return 'the quad';
  const id = state.map.cells[cell]?.buildingId ?? -1;
  const building = id >= 0 ? state.map.buildings[id] : null;
  if (!building) return 'the quad';
  return building.zone === 'academic' ? hallName(state, cell) : dormName(state, cell);
}

export interface PostWordsShown {
  /** The line, its emotes still as tokens such as [heart]. */
  text: string;
  /** Its hashtag, without the #. */
  tag: string;
}

/** A post's words, rebuilt from its numbers. */
export function postWords(state: GameState, post: Post): PostWordsShown {
  const words = POST_WORDS[post.kind as PostKind] ?? POST_WORDS[POST.praise];
  const lines = postLines(post.kind, post.tone, post.a);
  const tags: readonly string[] = post.kind === POST.complaint || post.kind === POST.praise ? [CAUSE_POSTS[CAUSE_TOPICS[post.a] ?? 'walk'].tag] : words.tags;
  const line = lines[post.line % lines.length] ?? '';
  const nick = state.football?.nick ?? state.school.name;
  const subject = postSubject(post);
  const fill: Record<string, () => string> = {
    name: () => (subject ? firstNameOf(state, subject) : 'someone'),
    place: () => placeName(state, post.kind === POST.complaint || post.kind === POST.praise ? post.b : post.a),
    team: () => nick,
    opp: () => teamName(state, post.a),
    us: () => String(Math.floor(post.b / 1000)),
    them: () => String(post.b % 1000),
    tradition: () => TRADITIONS[post.a]?.name ?? 'the big night',
    club: () => CLUBS[post.a]?.name ?? 'the club',
    chapter: () => socialProfile(state, post.author)?.chapter ?? 'the chapter',
  };
  const text = line.replace(/\{(\w+)\}/g, (whole, key: string) => fill[key]?.() ?? whole);
  const tag = (tags[(post.luck >>> 8) % tags.length] ?? '').replace('{nick}', nick.replace(/[^A-Za-z0-9]/g, ''));
  return { text, tag };
}

/** When it went up, as a phone says it: "now", "12 m", "3 h", "2 d". */
export function postAge(state: GameState, post: Post): string {
  const ago = Math.max(0, state.clock.tick - (post.week * WEB_WEEK_TICKS + post.minute));
  if (ago < 1) return 'now';
  if (ago < 60) return `${ago} m`;
  if (ago < 24 * 60) return `${Math.floor(ago / 60)} h`;
  return `${Math.floor(ago / (24 * 60))} d`;
}

/** The ties a student holds in the view, closest first. */
function tiesIn(view: WebView, id: number): Array<{ id: number; kind: number; strength: number; feeling: number }> {
  const out: Array<{ id: number; kind: number; strength: number; feeling: number }> = [];
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = view.other[s]!;
    if (b >= 0) out.push({ id: b, kind: view.kind[s]!, strength: view.strength[s]!, feeling: view.feeling[s]! });
  }
  return out.sort((x, y) => y.strength - x.strength);
}

/** How many follow a student: everyone they know and everyone those know, as a phone counts it. */
export function followersOf(view: WebView, ref: StudentRef): number {
  const id = idIn(view, ref);
  if (id < 0) return 0;
  const seen = new Set<number>([id]);
  for (let k = 0; k < SLOTS; k++) {
    const b = view.other[id * SLOTS + k]!;
    if (b < 0) continue;
    seen.add(b);
    for (let j = 0; j < SLOTS; j++) {
      const c = view.other[b * SLOTS + j]!;
      if (c >= 0) seen.add(c);
    }
  }
  return (seen.size - 1) * 7 + (hashInts(view.seed, 8101, ref.entryYear, ref.index) % 40);
}

/** How many they follow: those they know. */
export function followingOf(view: WebView, ref: StudentRef): number {
  const id = idIn(view, ref);
  if (id < 0) return 0;
  return tiesIn(view, id).length * 9 + (hashInts(view.seed, 8103, ref.entryYear, ref.index) % 60);
}

/** How much of a following sees and likes each kind of post. */
const ENGAGE: Partial<Record<PostKind, number>> = {
  [POST.couple]: 0.45,
  [POST.backTogether]: 0.35,
  [POST.splitMessy]: 0.3,
  [POST.best]: 0.3,
  [POST.longterm]: 0.3,
  [POST.split]: 0.25,
  [POST.newBuilding]: 0.4,
  [POST.commencement]: 0.5,
  [POST.gameWon]: 0.4,
  [POST.gameDay]: 0.3,
  [POST.party]: 0.3,
  [POST.tradition]: 0.3,
  [POST.complaint]: 0.25,
  [POST.praise]: 0.2,
  [POST.roommate]: 0.25,
  [POST.shade]: 0.15,
};

/** Its likes and its comment count. */
export function postCounts(view: WebView, post: Post): { likes: number; comments: number } {
  const followers = followersOf(view, post.author);
  const engage = ENGAGE[post.kind as PostKind] ?? 0.15;
  const likes = Math.round(followers * engage * (0.35 + 1.1 * share(hashInts(post.luck, 17)))) + 1;
  const comments = Math.max(commentsFor0(view, post), Math.round(likes * (0.06 + 0.12 * share(hashInts(post.luck, 19)))));
  return { likes, comments };
}

export interface Comment {
  who: StudentRef;
  text: string;
  /** An ex or a rival throwing shade, naming the author (decision 5). */
  shade: boolean;
}

/** Which comments a kind of post draws from friends. */
const COMMENT_OF: Partial<Record<PostKind, CommentKind>> = {
  [POST.couple]: 'cheer',
  [POST.best]: 'cheer',
  [POST.longterm]: 'cheer',
  [POST.backTogether]: 'cheer',
  [POST.split]: 'comfort',
  [POST.splitMessy]: 'comfort',
  [POST.shade]: 'laugh',
  [POST.roommate]: 'relate',
  [POST.firstWeek]: 'relate',
  [POST.midterms]: 'relate',
  [POST.finals]: 'relate',
  [POST.eightAm]: 'relate',
  [POST.rain]: 'relate',
  [POST.complaint]: 'relate',
  [POST.gameLost]: 'comfort',
  [POST.food]: 'laugh',
  [POST.breakHome]: 'laugh',
  [POST.moveIn]: 'laugh',
};
/** Good news an ex or a rival may answer. */
const SHADED: ReadonlySet<number> = new Set([POST.couple, POST.best, POST.longterm, POST.backTogether, POST.praise, POST.party, POST.newBuilding, POST.commencement, POST.club, POST.gym]);
const COMMENTS_SHOWN = 6;

/** The comments a post has, made when it is opened: its author's friends, the one it is about, and maybe shade. */
export function commentsFor(view: WebView, state: GameState, post: Post): Comment[] {
  const id = idIn(view, post.author);
  if (id < 0) return [];
  const out: Comment[] = [];
  const pick = (kind: CommentKind, h: number): string => {
    const lines = COMMENT_LINES[kind];
    return lines[h % lines.length]!;
  };
  const authorName = firstNameOf(state, post.author);
  const subject = postSubject(post);
  const good = post.kind !== POST.shade && post.kind !== POST.split && post.kind !== POST.splitMessy;
  if (subject && good && enrolled(state, subject) && post.kind !== POST.shade) out.push({ who: subject, text: pick('reply', hashInts(post.luck, 23)), shade: false });
  // Friends, the closest first, the Social Butterflies the likelier (decision: a Butterfly mostly comments).
  const friends = tiesIn(view, id)
    .filter((tie) => (tie.kind === KIND.friend || tie.kind === KIND.best || tie.kind === KIND.roommate || (tie.kind >= KIND.dating && tie.kind <= KIND.longterm)) && tie.feeling !== FEEL.tense)
    .map((tie) => {
      const ref = refIn(view, tie.id);
      const nature = socialProfile(state, ref)?.nature ?? '';
      return { ref, weight: tie.strength * (COMMENTER_LEAN[nature] ?? 1) * (0.5 + share(hashInts(post.luck, tie.id))) };
    })
    .filter((one) => enrolled(state, one.ref) && !(subject && same(one.ref, subject)))
    .sort((x, y) => y.weight - x.weight);
  const kind = COMMENT_OF[post.kind as PostKind] ?? 'hype';
  for (const [i, friend] of friends.entries()) {
    if (out.length >= COMMENTS_SHOWN - 1) break;
    const h = hashInts(post.luck, 29, i);
    out.push({ who: friend.ref, text: pick(share(h) < 0.2 ? 'laugh' : kind, h >>> 3), shade: false });
  }
  // Named shade (decision 5): an ex or a rival on good news, half the time.
  if (SHADED.has(post.kind) && share(hashInts(post.luck, 31)) < 0.5) {
    const sore = tiesIn(view, id).find((tie) => tie.kind === KIND.ex || tie.kind === KIND.rival || tie.kind === KIND.enemy);
    if (sore) {
      const ref = refIn(view, sore.id);
      if (enrolled(state, ref)) out.splice(Math.min(out.length, 1 + (post.luck % 3)), 0, { who: ref, text: pick('shade', hashInts(post.luck, 37)).replace('{name}', authorName), shade: true });
    }
  }
  return out.slice(0, COMMENTS_SHOWN);
}

/** How many comments would show, without making them: the floor for the count. */
function commentsFor0(view: WebView, post: Post): number {
  const id = idIn(view, post.author);
  if (id < 0) return 0;
  let friends = 0;
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const kind = view.kind[s]!;
    if (view.other[s]! >= 0 && (kind === KIND.friend || kind === KIND.best || kind === KIND.roommate || (kind >= KIND.dating && kind <= KIND.longterm))) friends += 1;
  }
  return Math.min(COMMENTS_SHOWN, friends + (aboutStudent(post.kind) ? 1 : 0));
}

/** What the campus is posting about: the week's hashtags, the most used first. */
export function trendingOf(state: GameState, view: WebView, posts: readonly Post[], most = 5): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    if (post.week < view.week - 1) continue;
    const { tag } = postWords(state, post);
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((x, y) => y.count - x.count || x.tag.localeCompare(y.tag))
    .slice(0, most);
}

/** A student's posts in the feed, newest first. */
export function postsBy(posts: readonly Post[], ref: StudentRef): Post[] {
  return posts.filter((post) => same(post.author, ref));
}

/** Their handle, as the app shows it: their name, lower case, with a dot. */
export function handleOf(state: GameState, ref: StudentRef): string {
  return studentName(state, ref).toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.');
}
