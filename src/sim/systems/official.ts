import { activeEntries } from '../calendar';
import { CAUSE_OF } from '../config/students';
import { CAUSE_TOPICS, OFFICIAL_KINDS, type CauseTopic, type OfficialKind } from '../config/quadline';
import { TRADITIONS } from '../config/traditions';
import { WEB_WEEK_TICKS } from '../config/web';
import type { GameState, OfficialPost } from '../types';
import { answered, officialLeft, officialPosts, OFFICIAL_FADE } from './buzz';
import { capacity } from './capacity';
import { campusHappiness } from './happiness';
import { nextDay } from './traditions';

/**
 * The university's official account (DESIGN.md 63.14, decision 8, "Templates"): five kinds of post, up to three a
 * real day, no free text. The player picks the kind; what it is about is the campus's own (its weakest spot to
 * apologise for, the tradition coming to announce), and whether it lands well is read from the campus: in tune
 * (+1), plain (0) or off-key (-1). Students' replies follow that, and the feed's mood with it.
 */

export const OFFICIAL_KEPT = 20;

/** The campus's weak spots (the parts of Happiness below 0.45, and beds or seats when short) and its strong ones. */
export function campusTopics(state: GameState): { weak: Array<{ topic: CauseTopic; level: number }>; strong: Array<{ topic: CauseTopic; level: number }> } {
  const weak: Array<{ topic: CauseTopic; level: number }> = [];
  const strong: Array<{ topic: CauseTopic; level: number }> = [];
  for (const cause of campusHappiness(state).causes) {
    for (const part of cause.parts) {
      const topic = part.id as CauseTopic;
      if (!CAUSE_TOPICS.includes(topic) || CAUSE_OF[part.id] === undefined) continue;
      if (part.level < 0.45) weak.push({ topic, level: part.level });
      else if (part.level >= 0.75) strong.push({ topic, level: part.level });
    }
  }
  const needs = capacity(state).needs;
  for (const id of ['beds', 'seats'] as const) {
    const need = needs.find((one) => one.id === id);
    if (need?.status === 'short') weak.push({ topic: id, level: 0.2 });
    else if (need?.status === 'ok' && need.have > need.want * 1.15) strong.push({ topic: id, level: 0.8 });
  }
  weak.sort((x, y) => x.level - y.level);
  strong.sort((x, y) => y.level - x.level);
  return { weak, strong };
}

export interface OfficialChoice {
  kind: OfficialKind;
  /** What it is about, as the post keeps it: a topic, a tradition's place, 'game', 'kindness', 'fall', 'bad:<tick>'... */
  about: string;
  fit: -1 | 0 | 1;
  /** False when it cannot be posted now, with why. */
  available: boolean;
  why: string;
}

/** What a post of this kind would be about now, and how it would land. */
export function officialChoice(state: GameState, kind: OfficialKind): OfficialChoice {
  const now = state.clock.tick;
  const left = officialLeft(state);
  const done = (about: string, fit: -1 | 0 | 1, available = true, why = ''): OfficialChoice => ({
    kind,
    about,
    fit,
    available: available && left > 0,
    why: left > 0 ? why : 'Three posts a day: the account has posted three today.',
  });
  switch (kind) {
    case 'announce': {
      // Speaking up when students are being picked on, then what is coming: a tradition, a home game.
      if ((state.web.effects?.bullied ?? 0) >= 0.015) return done('kindness', 1);
      for (const kept of state.traditions?.chosen ?? []) {
        const index = TRADITIONS.findIndex((spec) => spec.id === kept.id);
        const next = index >= 0 ? nextDay(state, TRADITIONS[index]!.day) : null;
        if (next && next.at - now < 2 * WEB_WEEK_TICKS) return done(`tradition:${index}`, 1);
      }
      const game = (state.football?.season?.games ?? []).find((one) => one.home && one.opp >= 0 && one.kick >= now && one.kick - now < WEB_WEEK_TICKS);
      if (game) return done('game', 1);
      return done('fair', 0);
    }
    case 'celebrate': {
      const games = (state.football?.season?.games ?? []).filter((one) => one.opp >= 0 && one.us.length >= 4 && now - one.kick < WEB_WEEK_TICKS);
      const won = games.some((one) => one.us.reduce((a, b) => a + b, 0) > one.them.reduce((a, b) => a + b, 0));
      if (won) return done('win', 1);
      if (activeEntries(state.clock).some((entry) => entry.kind === 'commencement')) return done('graduates', 1);
      // Celebrating the semester lands only when the campus is happy and nothing is short: otherwise it is off-key.
      const { weak } = campusTopics(state);
      return done('semester', campusHappiness(state).score >= 70 && weak.length === 0 ? 1 : -1);
    }
    case 'apologise': {
      const { weak } = campusTopics(state);
      if (weak[0]) return done(weak[0].topic, 1);
      return done('dining', 0, true);
    }
    case 'welcome': {
      const near = [now - WEB_WEEK_TICKS, now, now + WEB_WEEK_TICKS].flatMap((tick) => activeEntries({ tick, week: state.clock.week }).map((entry) => entry.id));
      if (near.includes('fallStart') || near.includes('fallClasses')) return done('fall', 1);
      if (near.includes('springStart') || near.includes('springClasses')) return done('spring', 1);
      return done('fall', 0);
    }
    case 'respond': {
      // The newest viral post seen beyond campus in the last two weeks that the account has not answered.
      const viral = [...(state.web.effects?.viral ?? [])].reverse().find((one) => now - one.at < OFFICIAL_FADE && !answered(state, one.at));
      if (!viral) return done('none', 0, false, 'Nothing has gone viral lately to respond to.');
      return done(`${viral.size < 0 ? 'bad' : 'good'}:${viral.at}`, 1);
    }
  }
}

/** Post as the university: the choice of now, kept with the newest. An error when it cannot be posted. */
export function postOfficial(state: GameState, kind: OfficialKind): string | null {
  if (!OFFICIAL_KINDS.includes(kind)) return 'The account has no such post.';
  const choice = officialChoice(state, kind);
  if (!choice.available) return choice.why || 'That cannot be posted now.';
  const post: OfficialPost = { tick: state.clock.tick, kind, about: choice.about, fit: choice.fit };
  state.web.official = [...officialPosts(state), post].slice(-OFFICIAL_KEPT);
  return null;
}

/** A kept official post that makes sense: a load drops any that does not. */
export function officialSound(post: unknown): post is OfficialPost {
  if (typeof post !== 'object' || post === null) return false;
  const one = post as Record<string, unknown>;
  return (
    Number.isInteger(one.tick) &&
    typeof one.kind === 'string' &&
    (OFFICIAL_KINDS as readonly string[]).includes(one.kind) &&
    typeof one.about === 'string' &&
    one.about.length < 40 &&
    (one.fit === -1 || one.fit === 0 || one.fit === 1)
  );
}
