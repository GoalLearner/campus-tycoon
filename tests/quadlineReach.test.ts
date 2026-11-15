import { describe, expect, it } from 'vitest';
import { commentsFor, feedOf, moodLine, officialReplies, officialWords, postSubject, viralHeadline } from '../src/app/quadline';
import { happeningsOf, viewOf } from '../src/app/socialView';
import { advance, applyAction, newGame, type GameState, type StudentRef } from '../src/sim';
import { OFFICIAL_A_DAY, POST, VIRAL_KEPT, VIRAL_REACH_EACH, VIRAL_REACH_MOST } from '../src/sim/config/quadline';
import { EVENT, WEB_WEEK_TICKS } from '../src/sim/config/web';
import { hardLineProblem } from '../src/sim/config/hardLines';
import { toneProblem } from '../src/sim/config/tone';
import { officialMood, speakingUp, viralReach } from '../src/sim/systems/buzz';
import { fallApplicants } from '../src/sim/systems/demand';
import { campusTopics, officialChoice } from '../src/sim/systems/official';
import { bullyingTimes } from '../src/sim/systems/policies';
import { postContext, postsOf, viralOf, viralReachOf, type Post } from '../src/sim/systems/quadline';
import { classYearOf, studentName } from '../src/sim/systems/students';
import { TRAIT, traitOf } from '../src/sim/systems/identity';
import { catchUp, idOf, newWeb, webWeekOf } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * Quadline's reach (DESIGN.md 63.14, social stop 10): rumours that spread and change ties, posts that go viral and move
 * the school's reach, the paper's headline, the feed's mood, the university's official account, and picking on
 * someone on the app with its levers.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEEK0 = webWeekOf(MODEL);
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, WEEK0);
const EACH: Post[][] = [];
const viralWeeks: number[] = [];
for (let w = 1; w <= 12; w++) {
  const before = WEB.postNext;
  catchUp(WEB, MODEL, WEEK0 + w);
  EACH.push(postsOf(WEB.posts, new Int32Array(0)).slice(0, WEB.postNext - before));
  viralWeeks.push(postsOf(new Int32Array(0), WEB.viral).filter((post) => post.week === WEB.week).length);
}
const VIEW = viewOf(WEB, false);
const FEED = feedOf(VIEW, MODEL);
const enrolled = (ref: StudentRef): boolean => classYearOf(MODEL, ref) !== null;

/** A campus with Quadline's effects as the web read them, at a time. */
function withViral(state: GameState, viral: Array<{ at: number; size: number }>): GameState {
  const next = structuredClone(state);
  next.web.effects = { week: WEB.week, happiness: 0, scale: 1, examStress: 0, stressScale: 1, leave: 1, alone: 0, group: 0, partnered: 0, split: 0, rival: 0, study: 0, viral };
  return next;
}

describe('rumours (decision 6, Drama)', () => {
  const rumours = EACH.flat().filter((post) => post.kind === POST.rumour);

  it('are told by those who like to talk (outgoing, not kind), about someone they know, by name', () => {
    expect(rumours.length).toBeGreaterThan(5);
    for (const post of rumours) {
      const id = idOf(WEB, post.author);
      expect(traitOf(WEB.identity[id]!, TRAIT.outgoing)).toBeGreaterThanOrEqual(2);
      expect(traitOf(WEB.identity[id]!, TRAIT.kind)).toBeLessThanOrEqual(1);
      expect(postSubject(post)).not.toBeNull();
    }
  });

  it('spread and change ties: some reach a partner or a friend, and a few end a couple', () => {
    // Landed on a partner or a friend, and told as a happening by name for the cards and the paper.
    expect(WEB.events[EVENT.rumour]!).toBeGreaterThan(0);
    expect(happeningsOf(VIEW).some((one) => one.event === EVENT.rumour)).toBe(true);
  });

  it('never reach the Main Character’s romances, which are their story’s', () => {
    const mainWeb = newWeb(MODEL.seed, 1024);
    const state = structuredClone(MODEL);
    const pick = FEED.find((post) => post.kind === POST.couple)!;
    const made = applyAction(state, { type: 'makeMain', ref: pick.author });
    expect(made.ok).toBe(true);
    catchUp(mainWeb, made.state, WEEK0);
    for (let w = 1; w <= 6; w++) catchUp(mainWeb, made.state, WEEK0 + w);
    expect(mainWeb.mainId).toBeGreaterThanOrEqual(0);
    for (const post of postsOf(mainWeb.posts, mainWeb.viral).filter((one) => one.kind === POST.rumour)) {
      expect(idOf(mainWeb, post.author)).not.toBe(mainWeb.mainId);
      expect(idOf(mainWeb, postSubject(post)!)).not.toBe(mainWeb.mainId);
    }
  }, 120_000);
});

describe('going viral (decision 7, Light)', () => {
  it('picks a few posts a week, at most two, and keeps the newest thirty', () => {
    for (const n of viralWeeks) expect(n).toBeLessThanOrEqual(2);
    expect(viralWeeks.reduce((a, b) => a + b, 0)).toBeGreaterThan(6);
    expect(postsOf(new Int32Array(0), WEB.viral).length).toBeLessThanOrEqual(VIRAL_KEPT);
    // In the feed once, as the viral post.
    const keys = FEED.map((post) => `${post.week}:${post.minute}:${post.author.entryYear}:${post.author.index}:${post.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(FEED.some((post) => post.viral)).toBe(true);
  });

  it('moves the school’s reach only by those seen beyond campus, good up and bad down, each a little', () => {
    const reach = viralReachOf(WEB);
    for (const one of reach) {
      expect(Math.abs(one.size)).toBeLessThanOrEqual(VIRAL_REACH_EACH + 1e-9);
      expect(one.size).not.toBe(0);
    }
    for (const post of FEED.filter((one) => one.viral)) {
      const { sign } = viralOf(post.kind, post.luck);
      if (post.kind === POST.complaint || post.kind === POST.bullyPost) expect(sign).toBe(-1);
      if (post.kind === POST.newBuilding || post.kind === POST.gameWon || post.kind === POST.praise) expect(sign).toBe(1);
    }
  });

  it('moves applicants at most 3% either way, fading over two game weeks; an answered bad one half as much', () => {
    const now = MODEL.clock.tick;
    const plain = fallApplicants(MODEL).total;
    const good = withViral(MODEL, [{ at: now, size: VIRAL_REACH_EACH }, { at: now, size: VIRAL_REACH_EACH }, { at: now, size: VIRAL_REACH_EACH }]);
    expect(viralReach(good)).toBeCloseTo(VIRAL_REACH_MOST, 9);
    const ratio = fallApplicants(good).total / plain;
    expect(ratio).toBeGreaterThan(1.02);
    expect(ratio).toBeLessThan(1.031);
    const bad = withViral(MODEL, [{ at: now, size: -VIRAL_REACH_EACH }]);
    expect(viralReach(bad)).toBeCloseTo(-VIRAL_REACH_EACH, 9);
    expect(fallApplicants(bad).total).toBeLessThan(plain);
    // A game week on, half; two on, nothing.
    const later = structuredClone(bad);
    later.clock.tick += WEB_WEEK_TICKS;
    expect(viralReach(later)).toBeCloseTo(-VIRAL_REACH_EACH / 2, 6);
    later.clock.tick += WEB_WEEK_TICKS;
    expect(viralReach(later)).toBe(0);
    // The account answers it: half as much from then.
    const answered = structuredClone(bad);
    answered.web.official = [{ tick: now, kind: 'respond', about: `bad:${now}`, fit: 1 }];
    expect(viralReach(answered)).toBeCloseTo(-VIRAL_REACH_EACH / 2, 9);
  });

  it('makes the paper’s headline for a big moment: what went around, never who', () => {
    for (const post of FEED.filter((one) => one.viral)) {
      const headline = viralHeadline(MODEL, post);
      for (const word of studentName(MODEL, post.author).split(' ')) expect(headline).not.toContain(word);
      expect(headline).not.toMatch(/\{\w+\}/);
      expect(hardLineProblem(headline), headline).toBeNull();
      expect(toneProblem(headline), headline).toBeNull();
    }
  });
});

describe('the feed’s mood', () => {
  it('reads the share in a good mood and the campus’s worry, the most complained-of spot', () => {
    const mood = moodLine(MODEL, VIEW, FEED);
    expect(mood.upbeat).toBeGreaterThan(0.2);
    expect(mood.upbeat).toBeLessThan(0.95);
    const { weak } = campusTopics(MODEL);
    if (weak.length > 0) expect(mood.worry).not.toBeNull();
  });
});

describe('the official account (decision 8, Templates)', () => {
  it('posts five kinds about what the campus has, three a real day at most', () => {
    let state = structuredClone(MODEL);
    const apologise = officialChoice(state, 'apologise');
    const { weak } = campusTopics(state);
    if (weak[0]) expect(apologise).toMatchObject({ about: weak[0].topic, fit: 1 });
    expect(officialChoice(state, 'respond').available).toBe(false);
    for (let i = 0; i < OFFICIAL_A_DAY; i++) {
      const done = applyAction(state, { type: 'officialPost', kind: i === 0 ? 'apologise' : 'announce' });
      expect(done.ok).toBe(true);
      state = done.state;
    }
    expect(applyAction(state, { type: 'officialPost', kind: 'welcome' }).ok).toBe(false);
    expect(state.web.official).toHaveLength(3);
    for (const post of state.web.official!) {
      const words = officialWords(state, post);
      expect(words).not.toMatch(/\{\w+\}/);
      expect(hardLineProblem(words), words).toBeNull();
    }
  });

  it('lands in tune or off-key, and students reply to it and to how the campus is', () => {
    const state = structuredClone(MODEL);
    const { weak } = campusTopics(state);
    const celebrate = officialChoice(state, 'celebrate');
    if (weak.length > 0 && celebrate.about === 'semester') expect(celebrate.fit).toBe(-1);
    const offKey = { tick: state.clock.tick, kind: 'celebrate' as const, about: 'semester', fit: -1 };
    const replies = officialReplies(VIEW, state, offKey, weak.map((one) => one.topic));
    expect(replies.length).toBeGreaterThan(2);
    if (weak[0]) expect(replies.some((reply) => /cool|where|and the/.test(reply.text))).toBe(true);
    for (const reply of replies) {
      expect(hardLineProblem(reply.text), reply.text).toBeNull();
      expect(toneProblem(reply.text), reply.text).toBeNull();
    }
  });

  it('warms or sours the feed a little, and fades; speaking up cuts how often picking on someone starts', () => {
    const state = structuredClone(MODEL);
    state.web.official = [{ tick: state.clock.tick, kind: 'apologise', about: 'dining', fit: 1 }];
    expect(officialMood(state)).toBeGreaterThan(0);
    expect(officialMood(state)).toBeLessThanOrEqual(0.15);
    state.web.official = [{ tick: state.clock.tick, kind: 'celebrate', about: 'semester', fit: -1 }];
    expect(officialMood(state)).toBeLessThan(0);
    const before = bullyingTimes(state).start;
    state.web.official = [{ tick: state.clock.tick, kind: 'announce', about: 'kindness', fit: 1 }];
    expect(speakingUp(state)).toBe(true);
    expect(bullyingTimes(state).start).toBeCloseTo(before * 0.8, 9);
    state.clock.tick += 2 * WEB_WEEK_TICKS;
    expect(speakingUp(state)).toBe(false);
  });

  it('is kept through a save, and a load lets go of a post that makes no sense', async () => {
    const { parseSave, serialize } = await import('../src/sim/save');
    const state = structuredClone(MODEL);
    state.web.official = [
      { tick: state.clock.tick, kind: 'announce', about: 'fair', fit: 0 },
      { tick: 1.5, kind: 'shout', about: 'x', fit: 9 } as never,
    ];
    const loaded = parseSave(serialize(state, T0));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.web.official).toEqual([{ tick: state.clock.tick, kind: 'announce', about: 'fair', fit: 0 }]);
  });
});

describe('picking on someone on the app', () => {
  const posts = EACH.flat().filter((post) => post.kind === POST.bullyPost);

  it('is posted by the one doing it, naming the one picked on, in a mild name allowed', () => {
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      const target = postSubject(post)!;
      expect(enrolled(target)).toBe(true);
      expect(key(post.author)).not.toBe(key(target));
    }
  });

  it('draws those who join in and those who stand up for them; with the program, an RA and the counselling center', () => {
    const post = FEED.find((one) => one.kind === POST.bullyPost);
    if (!post) return;
    const plain = commentsFor(VIEW, MODEL, post);
    expect(plain.every((one) => one.who !== null)).toBe(true);
    const program = structuredClone(MODEL);
    program.policies.on = [...program.policies.on, 'antiBullying'];
    const helped = commentsFor(VIEW, program, post);
    expect(helped.some((one) => one.who === null && one.from === 'Counselling Center')).toBe(true);
    for (const one of helped) expect(hardLineProblem(one.text), one.text).toBeNull();
  });

  it('shows less with the anti-bullying program and the account speaking up', () => {
    const program = structuredClone(MODEL);
    program.policies.on = [...program.policies.on, 'antiBullying'];
    expect(postContext(WEB, MODEL, WEB.week).bullyShown).toBe(1);
    expect(postContext(WEB, program, WEB.week).bullyShown).toBe(0.5);
    program.web.official = [{ tick: program.clock.tick, kind: 'announce', about: 'kindness', fit: 1 }];
    expect(postContext(WEB, program, WEB.week).bullyShown).toBeCloseTo(0.3, 9);
  });
});

const key = (ref: StudentRef): string => `${ref.entryYear}:${ref.index}`;
