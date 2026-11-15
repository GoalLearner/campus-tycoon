import { enrollment, type GameState, type StudentRef } from '../sim';
import { RINGS } from '../sim/systems/web';
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
import { aboutStudent, postsOf, postWeekStart, viralOf, type Post } from '../sim/systems/quadline';
import { BULLY_COMMENTS, OFFICIAL_LINES, OFFICIAL_REPLIES, TOPIC_HEADLINE, VIRAL_HEADLINES, type CauseTopic } from '../sim/config/quadline';
import { TRAIT, traitOf } from '../sim/systems/identity';
import { bullyingTimes } from '../sim/systems/policies';
import type { OfficialPost } from '../sim/types';
import { classYearOf, firstNameOf, socialProfile, studentName } from '../sim/systems/students';
import { idIn, refIn, type WebView } from './socialView';
import { rackPosts } from './wheels';

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
  const kept = postsOf(view.posts, view.viral).filter((post) => enrolled(state, post.author));
  // Bike parking (DESIGN.md 64.6): the app's own complaints while racks are short, among the rest by when they went up.
  const racks = rackPosts(view, state, enrollment(state));
  return racks.length === 0 ? kept : [...kept, ...racks].sort((x, y) => y.week - x.week || y.minute - x.minute);
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
    opp: () => teamName(state, post.kind === POST.teamNews ? post.b : post.a),
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
  const ago = Math.max(0, state.clock.tick - (postWeekStart(post.week) + post.minute));
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
  let likes = Math.round(followers * engage * (0.35 + 1.1 * share(hashInts(post.luck, 17)))) + 1;
  // A viral post is liked by many more than follow its author: about as many again as shared it (63.14).
  if (post.viral) likes = Math.max(likes, Math.round(viralOf(post.kind, post.luck).shares * (1.3 + 0.7 * share(hashInts(post.luck, 21)))));
  const comments = Math.max(commentsFor0(view, post), Math.round(likes * (0.06 + 0.12 * share(hashInts(post.luck, 19)))));
  return { likes, comments };
}

export interface Comment {
  /** The student who wrote it, or null for an account that is not a student (the counselling center). */
  who: StudentRef | null;
  /** The account's name, when it is not a student. */
  from?: string;
  text: string;
  /** An ex or a rival throwing shade, naming the author (decision 5). */
  shade: boolean;
  /** Joining in on picking on someone (63.14). */
  joins?: boolean;
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
  [POST.professor]: 'relate',
};
/** Good news an ex or a rival may answer. */
const SHADED: ReadonlySet<number> = new Set([POST.couple, POST.best, POST.longterm, POST.backTogether, POST.praise, POST.party, POST.newBuilding, POST.commencement, POST.club, POST.gym]);
const COMMENTS_SHOWN = 6;

/** The comments a post has, made when it is opened: its author's friends, the one it is about, and maybe shade. */
export function commentsFor(view: WebView, state: GameState, post: Post): Comment[] {
  const id = idIn(view, post.author);
  if (id < 0) return [];
  if (post.kind === POST.bullyPost) return bullyComments(view, state, post, id);
  if (post.kind === POST.rumour) return rumourComments(view, state, post, id);
  const out: Comment[] = [];
  // No two comments on a post say the same: the next line of the kind is taken when one is used.
  const used = new Set<string>();
  const pick = (kind: CommentKind, h: number): string => {
    const lines = COMMENT_LINES[kind];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[(h + i) % lines.length]!;
      if (!used.has(line)) {
        used.add(line);
        return line;
      }
    }
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

// ------------------------------------------------- the app's reach (63.14) --

/** A viral post's line under it: how many shared it, and whether it went beyond the campus. */
export function viralLine(post: Post): string {
  const { shares, beyond } = viralOf(post.kind, post.luck);
  return `Shared ${shares.toLocaleString('en-US')} times · ${beyond ? 'seen beyond campus' : 'all over campus'}`;
}

const traitIn = (view: WebView, id: number, trait: number): number => traitOf(view.identity[id]!, trait);

/** Lines drawn without putting back: no two comments on one post alike (the next of the pool is taken instead). */
function drawer(): (lines: readonly string[], h: number) => string {
  const used = new Set<string>();
  return (lines, h) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[(h + i) % lines.length]!;
      if (!used.has(line)) {
        used.add(line);
        return line;
      }
    }
    return lines[h % lines.length]!;
  };
}

/**
 * Comments on picking on someone (DESIGN.md 63.14): friends of the one doing it who join in, friends of the one picked on
 * who are kind or loyal standing up for them, and with the anti-bullying program an RA among their people and the
 * counselling center saying where help is.
 */
function bullyComments(view: WebView, state: GameState, post: Post, id: number): Comment[] {
  const target = postSubject(post)!;
  const targetName = firstNameOf(state, target);
  const out: Comment[] = [];
  const draw = drawer();
  const line = (kind: keyof typeof BULLY_COMMENTS, h: number): string => draw(BULLY_COMMENTS[kind], h).replace('{name}', targetName);
  // Those who join in: the author's friends who are not kind and are outgoing.
  for (const tie of tiesIn(view, id)) {
    if (out.length >= 2) break;
    if (tie.kind !== KIND.friend && tie.kind !== KIND.best) continue;
    if (traitIn(view, tie.id, TRAIT.kind) > 1 || traitIn(view, tie.id, TRAIT.outgoing) < 2) continue;
    const ref = refIn(view, tie.id);
    if (enrolled(state, ref) && !same(ref, target)) out.push({ who: ref, text: line('join', hashInts(post.luck, tie.id)), shade: false, joins: true });
  }
  // Those who stand up for them: their friends who are kind or loyal.
  const tid = idIn(view, target);
  let ra: StudentRef | null = null;
  if (tid >= 0) {
    for (const tie of tiesIn(view, tid)) {
      if (tie.kind !== KIND.friend && tie.kind !== KIND.best && tie.kind !== KIND.roommate) continue;
      const ref = refIn(view, tie.id);
      if (!enrolled(state, ref) || same(ref, post.author)) continue;
      if (!ra && socialProfile(state, ref)?.nature === 'ra') ra = ref;
      if (out.filter((one) => !one.joins).length >= 2) continue;
      if (traitIn(view, tie.id, TRAIT.kind) >= 2 || traitIn(view, tie.id, TRAIT.loyal) >= 2) out.push({ who: ref, text: line('defend', hashInts(post.luck, 41, tie.id)), shade: false });
    }
  }
  // With a program that has it reported more (the anti-bullying program's own words: RAs trained to spot it, someone
  // who answers), an RA they know and the counselling center answer.
  if (bullyingTimes(state).reported > 1) {
    if (ra) out.push({ who: ra, text: BULLY_COMMENTS.ra[0], shade: false });
    out.push({ who: null, from: 'Counselling Center', text: BULLY_COMMENTS.ra[1], shade: false });
  }
  return out;
}

/** Comments on a rumour: anyone wondering, and friends of the one it is about covering for them. */
function rumourComments(view: WebView, state: GameState, post: Post, id: number): Comment[] {
  const about = postSubject(post)!;
  const aboutName = firstNameOf(state, about);
  const out: Comment[] = [];
  const draw = drawer();
  const pick = (kind: 'rumour' | 'cover', h: number): string => draw(COMMENT_LINES[kind], h).replace('{name}', aboutName);
  for (const [i, tie] of tiesIn(view, id).entries()) {
    if (out.length >= 3) break;
    const ref = refIn(view, tie.id);
    if (!enrolled(state, ref) || same(ref, about)) continue;
    out.push({ who: ref, text: pick('rumour', hashInts(post.luck, 47, i)), shade: false });
  }
  const aid = idIn(view, about);
  if (aid >= 0) {
    const friend = tiesIn(view, aid).find((tie) => (tie.kind === KIND.best || tie.kind === KIND.friend) && tie.id !== id);
    if (friend) {
      const ref = refIn(view, friend.id);
      if (enrolled(state, ref)) out.push({ who: ref, text: pick('cover', hashInts(post.luck, 53)), shade: false });
    }
  }
  return out;
}

/** What the official account's post says, its slots filled from the campus. */
export function officialWords(state: GameState, post: OfficialPost): string {
  const [what, rest] = post.about.split(':');
  const nick = state.football?.nick ?? state.school.name;
  let line: string;
  switch (post.kind) {
    case 'announce':
      line = what === 'tradition' ? OFFICIAL_LINES.announce.tradition : OFFICIAL_LINES.announce[(what as keyof typeof OFFICIAL_LINES.announce) ?? 'fair'] ?? OFFICIAL_LINES.announce.fair;
      break;
    case 'celebrate':
      line = OFFICIAL_LINES.celebrate[what as keyof typeof OFFICIAL_LINES.celebrate] ?? OFFICIAL_LINES.celebrate.semester;
      break;
    case 'apologise':
      line = OFFICIAL_LINES.apologise[what as CauseTopic] ?? OFFICIAL_LINES.apologise.dining;
      break;
    case 'welcome':
      line = OFFICIAL_LINES.welcome[what as keyof typeof OFFICIAL_LINES.welcome] ?? OFFICIAL_LINES.welcome.fall;
      break;
    default:
      line = what === 'bad' ? OFFICIAL_LINES.respond.bad : OFFICIAL_LINES.respond.good;
  }
  return line
    .replace('{tradition}', TRADITIONS[Number(rest)]?.name ?? 'big night')
    .replace('{nick}', nick);
}

/**
 * Students' replies to the official account (63.14): in tune with the campus, they cheer or thank it; off-key, they
 * say what is still wrong ("where are the beds tho"). An apology for something since fixed is met with credit.
 */
export function officialReplies(view: WebView, state: GameState, post: OfficialPost, weakNow: readonly CauseTopic[]): Comment[] {
  const out: Comment[] = [];
  // No two replies alike: the next line is taken when one is used.
  const used = new Set<string>();
  const pick = (lines: readonly string[], h: number): string => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[(h + i) % lines.length]!;
      if (!used.has(line)) {
        used.add(line);
        return line;
      }
    }
    return lines[h % lines.length]!;
  };
  const repliers: StudentRef[] = [];
  for (let t = 0; repliers.length < 4 && t < 60; t++) {
    const id = hashInts(view.seed, 8201, post.tick, t) % (view.classSlot * RINGS);
    const ref = refIn(view, id);
    if (enrolled(state, ref) && !repliers.some((one) => same(one, ref))) repliers.push(ref);
  }
  const [what] = post.about.split(':');
  repliers.forEach((who, i) => {
    const h = hashInts(post.tick, 8203, i);
    let text: string;
    if (post.fit < 0 && weakNow[i] && i < 2) text = OFFICIAL_REPLIES.offKey[weakNow[i]!];
    else if (post.fit < 0 && i === 1) text = pick(['we will see', 'about time'], h);
    else if (post.kind === 'apologise') text = weakNow.includes(what as CauseTopic) ? pick(OFFICIAL_REPLIES.thanks, h) : pick(OFFICIAL_REPLIES.fixed, h);
    else if (post.kind === 'welcome') text = pick(OFFICIAL_REPLIES.welcome, h);
    else if (post.kind === 'respond' && what === 'bad') text = pick(OFFICIAL_REPLIES.thanks, h);
    else if (post.fit === 0 && weakNow[0] && i === 0) text = OFFICIAL_REPLIES.offKey[weakNow[0]];
    else text = pick(OFFICIAL_REPLIES.cheer, h);
    out.push({ who, text, shade: false });
  });
  return out;
}

/**
 * The feed's mood (63.14, read only): of the last game week's posts, the share in a good mood, and what the campus is
 * most worried about (the most posted complaint): often before Happiness itself moves.
 */
export function moodLine(state: GameState, view: WebView, posts: readonly Post[]): { upbeat: number; worry: string | null; worryTag: string | null } {
  let good = 0;
  let all = 0;
  const worries = new Map<number, number>();
  for (const post of posts) {
    if (post.week < view.week - 1 || post.viral) continue;
    all += 1;
    if (post.tone === 0 && post.kind !== POST.complaint && post.kind !== POST.shade && post.kind !== POST.rumour && post.kind !== POST.bullyPost) good += 1;
    if (post.kind === POST.complaint) worries.set(post.a, (worries.get(post.a) ?? 0) + 1);
  }
  const top = [...worries.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0];
  const topic = top ? CAUSE_TOPICS[top[0]] : undefined;
  return { upbeat: all > 0 ? good / all : 0, worry: topic ? TOPIC_HEADLINE[topic] : null, worryTag: topic ? CAUSE_POSTS[topic].tag : null };
}

/** The paper's headline for a big viral moment: what went around, never who. */
export function viralHeadline(state: GameState, post: Post): string {
  const kind = Object.entries(POST).find(([, v]) => v === post.kind)?.[0] ?? 'other';
  const lines = VIRAL_HEADLINES[kind] ?? VIRAL_HEADLINES.other!;
  const topic = post.kind === POST.complaint || post.kind === POST.praise ? CAUSE_TOPICS[post.a] : undefined;
  return lines[post.luck % lines.length]!
    .replace('{topic}', topic ? TOPIC_HEADLINE[topic] : 'Campus Life')
    .replace('{place}', post.kind === POST.newBuilding ? placeName(state, post.a) : 'Building')
    .replace('{opp}', post.kind === POST.gameWon ? teamName(state, post.a) : 'a Rival')
    .replace('{tradition}', post.kind === POST.tradition ? (TRADITIONS[post.a]?.name ?? 'Tradition') : 'Tradition');
}
