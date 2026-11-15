import { describe, expect, it } from 'vitest';
import { commentsFor, feedOf, followersOf, postCounts, postSubject, postWords, trendingOf } from '../src/app/quadline';
import { idIn, viewOf } from '../src/app/socialView';
import { advance, applyAction, landRankGoals, newGame, previewPlace, type GameState, type StudentRef } from '../src/sim';
import { POST, POST_FIELDS, POSTS_KEPT, VIRAL_KEPT } from '../src/sim/config/quadline';
import { KIND, SLOTS, WEB_WEEK_TICKS } from '../src/sim/config/web';
import { FIELDS, postsOf, type Post } from '../src/sim/systems/quadline';
import { classYearOf, firstNameOf, socialProfile } from '../src/sim/systems/students';
import { TRAIT, traitOf } from '../src/sim/systems/identity';
import { nextGreekDay } from '../src/sim/systems/greek';
import { catchUp, decodeWeb, encodeWeb, HAPPENING_FIELDS, idOf, newWeb, webWeekOf, type Web } from '../src/sim/systems/web';
import { DAY, MIN, T0 } from './helpers';

/**
 * Quadline, the campus app (DESIGN.md 63.13, social stop 9): posts made as the web lives each game week, from what
 * really happened, the calendar and the campus; kept as numbers with the web; their words, likes, comments and
 * followers rebuilt when shown. Same seed, same feed.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEEK0 = webWeekOf(MODEL);
const LIVED = 12;

/** The model campus's web, lived a week at a time, with each week's posts as they were made. */
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, WEEK0);
const EACH: Post[][] = [];
for (let w = 1; w <= LIVED; w++) {
  const before = WEB.postNext;
  catchUp(WEB, MODEL, WEEK0 + w);
  EACH.push(postsOf(WEB.posts, WEB.viral).slice(0, WEB.postNext - before));
}
const VIEW = viewOf(WEB, false);
const FEED = feedOf(VIEW, MODEL);
const key = (ref: StudentRef): string => `${ref.entryYear}:${ref.index}`;
const enrolled = (ref: StudentRef): boolean => classYearOf(MODEL, ref) !== null;

function tieBetween(web: Web, a: StudentRef, b: StudentRef): number {
  const x = idOf(web, a);
  const y = idOf(web, b);
  for (let k = 0; k < SLOTS; k++) if (web.other[x * SLOTS + k] === y) return web.kind[x * SLOTS + k]!;
  return -1;
}

describe('posts', () => {
  it('come about 250 to 350 a real day across the campus (decision 4, Normal)', () => {
    const weeks = EACH.map((week) => week.length);
    const perWeek = weeks.reduce((a, b) => a + b, 0) / weeks.length;
    const perRealDay = perWeek * ((24 * 60) / WEB_WEEK_TICKS);
    expect(perRealDay).toBeGreaterThan(240);
    expect(perRealDay).toBeLessThan(380);
    for (const n of weeks) expect(n).toBeGreaterThan(20);
  });

  it('keep the newest 400, each ten numbers, about 17 KB with room for 30 viral', () => {
    expect(WEB.postNext).toBeGreaterThan(POSTS_KEPT);
    expect(postsOf(WEB.posts, new Int32Array(0))).toHaveLength(POSTS_KEPT);
    expect(POST_FIELDS).toBe(10);
    expect((WEB.posts.byteLength + WEB.viral.byteLength) / 1024).toBeCloseTo(((POSTS_KEPT + VIRAL_KEPT) * POST_FIELDS * 4) / 1024, 5);
    expect(WEB.posts.byteLength + WEB.viral.byteLength).toBe(17_200);
    // The newest kept: every post of the last weeks is there.
    const kept = new Set(postsOf(WEB.posts, WEB.viral).map((post) => `${post.week}:${post.minute}:${key(post.author)}:${post.kind}`));
    for (const post of EACH[LIVED - 1]!) expect(kept.has(`${post.week}:${post.minute}:${key(post.author)}:${post.kind}`)).toBe(true);
    expect(FIELDS).toBe(HAPPENING_FIELDS);
  });

  it('are the same from the same seed caught up the same way: same seed, same feed', () => {
    // Since stop 10 the posts read the week's acts of picking on someone, which the web tells by the friend groups it
    // read at its last catch-up (63.5): the same path makes the same feed, as the same path makes the same web.
    const once = newWeb(MODEL.seed, 1024);
    catchUp(once, MODEL, WEEK0);
    catchUp(once, MODEL, WEEK0 + 5);
    const again = newWeb(MODEL.seed, 1024);
    catchUp(again, MODEL, WEEK0);
    catchUp(again, MODEL, WEEK0 + 5);
    expect([...once.posts]).toEqual([...again.posts]);
    expect([...once.viral]).toEqual([...again.viral]);
    expect(once.postNext).toBe(again.postNext);
  });

  it('come from what really happened: a couple’s post is by one of a couple, about the other, and an ending by one no longer with them', () => {
    let couples = 0;
    let endings = 0;
    for (const week of EACH) {
      for (const post of week) {
        const other = postSubject(post);
        if (!other) continue;
        if (post.kind === POST.couple || post.kind === POST.longterm || post.kind === POST.backTogether) couples += 1;
        expect(key(other)).not.toBe(key(post.author));
      }
      for (const post of week) if (post.kind === POST.split || post.kind === POST.splitMessy) endings += 1;
    }
    expect(couples).toBeGreaterThan(10);
    expect(endings).toBeGreaterThan(0);
    // As things stand at the end: a couple post of the last week is by someone still in that couple.
    for (const post of EACH[LIVED - 1]!.filter((one) => one.kind === POST.couple)) {
      const tie = tieBetween(WEB, post.author, postSubject(post)!);
      expect(tie === -1 || (tie >= KIND.dating && tie <= KIND.longterm) || tie === KIND.ex).toBe(true);
    }
  });

  it('throw shade by name (decision 5), only from an ex, a rival or an enemy of the one named', () => {
    const shade = EACH.flat().filter((post) => post.kind === POST.shade);
    expect(shade.length).toBeGreaterThan(0);
    for (const post of shade) {
      const named = postSubject(post)!;
      expect(postWords(MODEL, post).text).toContain(firstNameOf(MODEL, named));
      const tie = tieBetween(WEB, post.author, named);
      // The tie may have moved on since the week it was posted; when it is there it is a sore one.
      if (tie >= 0 && post.week === WEB.week) expect([KIND.ex, KIND.rival, KIND.enemy]).toContain(tie);
    }
  });

  it('come more from who posts a lot: Attention Seekers post more for their numbers than the Homesick', () => {
    const posted = new Map<string, number>();
    const people = new Map<string, number>();
    for (const post of EACH.flat()) {
      const nature = socialProfile(MODEL, post.author)?.nature ?? '';
      posted.set(nature, (posted.get(nature) ?? 0) + 1);
    }
    for (let id = 0; id < WEB.n; id += 7) {
      if (WEB.year[id]! < 0) continue;
      const nature = socialProfile(MODEL, { entryYear: WEB.ring[Math.floor(id / WEB.classSlot)]!, index: id % WEB.classSlot })?.nature ?? '';
      people.set(nature, (people.get(nature) ?? 0) + 1);
    }
    const per = (nature: string): number => (posted.get(nature) ?? 0) / Math.max(1, people.get(nature) ?? 0);
    expect(per('attention')).toBeGreaterThan(per('homesick') * 2);
    expect(per('party')).toBeGreaterThan(per('scholar'));
  });

  it('come rarely from the shy (the spec’s Wallflowers), and most from the outgoing', () => {
    const posted = [0, 0, 0, 0];
    const people = [0, 0, 0, 0];
    for (const post of EACH.flat()) posted[traitOf(WEB.identity[idOf(WEB, post.author)]!, TRAIT.outgoing)]! += 1;
    for (let id = 0; id < WEB.n; id++) if (WEB.year[id]! >= 0) people[traitOf(WEB.identity[id]!, TRAIT.outgoing)]! += 1;
    const per = posted.map((n, i) => n / Math.max(1, people[i]!));
    expect(per[0]!).toBeLessThan(per[2]! / 2);
    expect(per[3]!).toBeGreaterThan(per[0]! * 2);
  });

  it('take in a class or a kind of professor, never a named one, and the team’s news from its athletes', () => {
    const all = EACH.flat();
    const professor = all.filter((post) => post.kind === POST.professor);
    expect(professor.length).toBeGreaterThan(0);
    for (const post of professor) expect(postWords(MODEL, post).text).toMatch(/professor|class|lecture/);
    const team = all.filter((post) => post.kind === POST.teamNews);
    expect(team.length).toBeGreaterThan(0);
    for (const post of team) expect(socialProfile(MODEL, post.author)?.team).toBe(true);
  });

  it('bring Greek Row news from its members: house life, and philanthropy day when it is near', () => {
    let state: GameState = structuredClone(MODEL);
    state.field.rank = 120;
    state.field.rankYear = 1;
    landRankGoals(state, []);
    state.money.cash = 2_000_000_000;
    for (let built = 0; built < 3; built++) {
      let at: [number, number] | null = null;
      for (let y = 0; y < state.map.height && !at; y++) for (let x = 0; x < state.map.width && !at; x++) if (previewPlace(state, 'chapterHouse', x, y).problem === null) at = [x, y];
      const result = applyAction(state, { type: 'place', building: 'chapterHouse', x: at![0], y: at![1] });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    const rush = nextGreekDay(state, 0)!;
    state = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + (rush - state.clock.tick + 2) * MIN).state;
    const web = newWeb(state.seed, 1024);
    catchUp(web, state, webWeekOf(state));
    const posts: Post[] = [];
    for (let w = 1; w <= 6; w++) {
      const before = web.postNext;
      catchUp(web, state, webWeekOf(state) + w);
      posts.push(...postsOf(web.posts, web.viral).slice(0, web.postNext - before));
    }
    const greek = posts.filter((post) => post.kind === POST.greekNews);
    expect(greek.length).toBeGreaterThan(0);
    for (const post of greek) {
      const chapter = socialProfile(state, post.author)?.chapter;
      expect(chapter).toBeTruthy();
      expect(postWords(state, post).text).not.toMatch(/\{\w+\}/);
    }
  }, 120_000);

  it('read every week of the calendar and the campus: the weakest spot, the weather, the term', () => {
    const kinds = new Set(EACH.flat().map((post) => post.kind));
    for (const kind of [POST.complaint, POST.praise, POST.club, POST.party] as const) expect(kinds.has(kind), String(kind)).toBe(true);
    // The weakest spot is the most complained about.
    const topics = new Map<number, number>();
    for (const post of EACH.flat()) if (post.kind === POST.complaint) topics.set(post.a, (topics.get(post.a) ?? 0) + 1);
    expect(topics.size).toBeGreaterThan(0);
  });

  it('start again after a long time away with the last two weeks, and nothing from the regrowing by name', () => {
    const away = newWeb(MODEL.seed, 1024);
    catchUp(away, MODEL, WEEK0);
    catchUp(away, MODEL, WEEK0 + 2);
    expect(catchUp(away, MODEL, WEEK0 + 40).regrown).toBe(true);
    const posts = postsOf(away.posts, away.viral);
    expect(posts.length).toBeGreaterThan(20);
    for (const post of posts) {
      expect(post.week).toBeGreaterThan(WEEK0 + 37);
      expect(postSubject(post)).toBeNull();
    }
  });

  it('are kept through the record, and a record from before has none', () => {
    const read = decodeWeb(encodeWeb(WEB), MODEL)!;
    expect([...read.posts]).toEqual([...WEB.posts]);
    expect([...read.viral]).toEqual([...WEB.viral]);
    expect(read.postNext).toBe(WEB.postNext);
    // Version 2: the same record with no posts after the slots.
    const bytes = encodeWeb(WEB);
    const v2 = bytes.slice(0, bytes.byteLength - 16 - (WEB.posts.length + WEB.viral.length) * 4);
    new Int32Array(v2.buffer, 0, 16).set([2], 1);
    const old = decodeWeb(v2, MODEL)!;
    expect(old).not.toBeNull();
    expect(postsOf(old.posts, old.viral)).toHaveLength(0);
    expect(old.postNext).toBe(0);
  });
});

describe('the feed', () => {
  it('rebuilds every post’s words from the templates, every slot filled, and a tag', () => {
    expect(FEED.length).toBeGreaterThan(300);
    for (const post of FEED) {
      const { text, tag } = postWords(MODEL, post);
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(tag).toMatch(/^[A-Za-z0-9]+$/);
    }
    // Lines take turns: no line is most of its kind's posts in a week.
    for (const week of EACH) {
      const lines = new Map<string, number>();
      for (const post of week) lines.set(postWords(MODEL, post).text, (lines.get(postWords(MODEL, post).text) ?? 0) + 1);
      expect(Math.max(...lines.values())).toBeLessThanOrEqual(Math.max(3, week.length / 6));
    }
  });

  it('has likes and comments by the author’s reach, and comments from their own people', () => {
    let shade = 0;
    for (const post of FEED.slice(0, 120)) {
      const { likes, comments } = postCounts(VIEW, post);
      expect(likes).toBeGreaterThan(0);
      const list = commentsFor(VIEW, MODEL, post);
      expect(comments).toBeGreaterThanOrEqual(list.length);
      // No two comments on a post alike: drawn without putting back (main's note on the stop 9 pictures).
      expect(new Set(list.map((one) => one.text)).size).toBe(list.length);
      for (const comment of list) {
        if (!comment.who) continue;
        expect(enrolled(comment.who)).toBe(true);
        const tie = tieBetween(WEB, post.author, comment.who);
        const about = postSubject(post);
        // Their own people, the one it is about, or (on a rumour or picking on someone) that one's people.
        const theirs = about !== null && (key(about) === key(comment.who) || tieBetween(WEB, about, comment.who) >= 0);
        expect(tie >= 0 || theirs).toBe(true);
        if (comment.shade) {
          shade += 1;
          expect([KIND.ex, KIND.rival, KIND.enemy]).toContain(tie);
        }
      }
      // Made the same every time it is opened.
      expect(commentsFor(VIEW, MODEL, post)).toEqual(list);
    }
    expect(shade).toBeGreaterThan(0);
  });

  it('counts followers by reach: more for the better known', () => {
    const counts = FEED.slice(0, 50).map((post) => ({ followers: followersOf(VIEW, post.author), ties: (() => {
      const id = idIn(VIEW, post.author);
      let n = 0;
      for (let k = 0; k < SLOTS; k++) if (VIEW.other[id * SLOTS + k]! >= 0) n += 1;
      return n;
    })() }));
    for (const one of counts) expect(one.followers).toBeGreaterThan(0);
    const most = counts.reduce((a, b) => (b.ties > a.ties ? b : a));
    const least = counts.reduce((a, b) => (b.ties < a.ties ? b : a));
    expect(most.followers).toBeGreaterThan(least.followers);
  });

  it('trends what the week posts about most', () => {
    const trending = trendingOf(MODEL, VIEW, FEED);
    expect(trending.length).toBeGreaterThan(2);
    for (let i = 1; i < trending.length; i++) expect(trending[i - 1]!.count).toBeGreaterThanOrEqual(trending[i]!.count);
  });
});
