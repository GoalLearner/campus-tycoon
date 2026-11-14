import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chemistryOf, companionsOf, greetingFor, reactionFor, SPARKLE_CHEMISTRY, stopsToTalk, tieOf, topicFor } from '../src/app/crowdTies';
import { viewOf } from '../src/app/socialView';
import { advance, newGame, type GameState, type StudentRef } from '../src/sim';
import { KIND, SLOTS } from '../src/sim/config/web';
import { catchUp, idOf, newWeb, refAt, webWeekOf } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * The crowd from real ties, stop 4 (DESIGN.md 63.8): who walks out together, how two who meet greet, what a face
 * shows on passing someone, and what two talk about. The map draws what these say.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, webWeekOf(MODEL));
const VIEW = viewOf(WEB, false);

/** Pairs in the web of each kind, from the first end's slot. */
function pairsOf(kind: number, most = 40): Array<[StudentRef, StudentRef]> {
  const out: Array<[StudentRef, StudentRef]> = [];
  for (let s = 0; s < WEB.n * SLOTS && out.length < most; s++) {
    const b = WEB.other[s]!;
    if (b < 0 || WEB.kind[s] !== kind) continue;
    out.push([refAt(WEB, Math.floor(s / SLOTS)), refAt(WEB, b)]);
  }
  return out;
}

describe('the crowd from real ties', () => {
  it('reads a tie from either end, and strangers have none', () => {
    for (const [a, b] of pairsOf(KIND.friend)) {
      expect(tieOf(VIEW, a, b)?.kind).toBe(KIND.friend);
      expect(tieOf(VIEW, b, a)).not.toBeNull();
    }
    const [a] = pairsOf(KIND.friend)[0]!;
    const stranger = refAt(WEB, (idOf(WEB, a) + 777) % WEB.n);
    if (tieOf(VIEW, a, stranger) === null) expect(tieOf(VIEW, stranger, a)).toBeNull();
  });

  it('brings a partner first, then the friend group, and never the main character', () => {
    let partnered = 0;
    for (const [a, b] of pairsOf(KIND.longterm, 30)) {
      const with_ = companionsOf(VIEW, MODEL, a);
      expect(with_[0]).toEqual(b);
      partnered += 1;
    }
    expect(partnered).toBeGreaterThan(0);
    // A student in a friend group brings people from it.
    const g = 0;
    const members = [...WEB.friendGroups.members.subarray(WEB.friendGroups.start[g]!, WEB.friendGroups.start[g + 1]!)].map((id) => refAt(WEB, id));
    const first = members[0]!;
    const others = companionsOf(VIEW, MODEL, first);
    for (const one of members.slice(1)) expect(others).toContainEqual(one);
    // The main character walks out alone, and nobody brings them.
    const withMain = structuredClone(MODEL) as GameState;
    (withMain.story as { mc: unknown }).mc = { ...(MODEL.story.mc ?? {}), ref: members[1] };
    expect(companionsOf(VIEW, withMain, members[1]!)).toEqual([]);
    expect(companionsOf(VIEW, withMain, first)).not.toContainEqual(members[1]);
  });

  it('greets as they know each other: a wave, a high five or a fist bump, a hug; rivals, enemies and exes do not', () => {
    expect(greetingFor({ kind: KIND.met, strength: 10 }, 0.2)).toBe('wave');
    expect(greetingFor({ kind: KIND.friend, strength: 40 }, 0.2)).toBe('highfive');
    expect(greetingFor({ kind: KIND.friend, strength: 40 }, 0.8)).toBe('fistbump');
    expect(greetingFor({ kind: KIND.best, strength: 90 }, 0.5)).toBe('hug');
    expect(greetingFor({ kind: KIND.longterm, strength: 99 }, 0.5)).toBe('hug');
    expect(greetingFor({ kind: KIND.roommate, strength: 70 }, 0.5)).toBe('hug');
    expect(greetingFor({ kind: KIND.roommate, strength: 40 }, 0.2)).toBe('highfive');
    for (const kind of [KIND.rival, KIND.enemy, KIND.ex]) expect(greetingFor({ kind, strength: 50 }, 0.5)).toBeNull();
  });

  it('shows a passing face: a heart for a crush, a sweat drop for an ex, an anger mark for a rival, a sparkle for a stranger who would click', () => {
    expect(reactionFor({ kind: KIND.crush, strength: 40 }, 0)).toBe('heart');
    expect(reactionFor({ kind: KIND.ex, strength: 40 }, 0)).toBe('sweat');
    expect(reactionFor({ kind: KIND.rival, strength: 40 }, 0)).toBe('anger');
    expect(reactionFor({ kind: KIND.enemy, strength: 90 }, 0)).toBe('anger');
    expect(reactionFor({ kind: KIND.friend, strength: 40 }, 0.9)).toBeNull();
    expect(reactionFor(null, SPARKLE_CHEMISTRY + 0.01)).toBe('sparkle');
    expect(reactionFor(null, SPARKLE_CHEMISTRY - 0.01)).toBeNull();
    // About one pair of strangers in twenty would click.
    let sparks = 0;
    let pairs = 0;
    for (let a = 0; a < WEB.n && pairs < 4000; a += 7) {
      if (WEB.year[a]! < 0) continue;
      const b = (a * 7919 + 13) % WEB.n;
      if (WEB.year[b]! < 0 || a === b) continue;
      pairs += 1;
      if (chemistryOf(VIEW, refAt(WEB, a), refAt(WEB, b)) > SPARKLE_CHEMISTRY) sparks += 1;
    }
    expect(sparks / pairs).toBeGreaterThan(0.01);
    expect(sparks / pairs).toBeLessThan(0.15);
  });

  it('stops to talk only with friends, a partner or a roommate, and talks about something both like', () => {
    expect(stopsToTalk({ kind: KIND.friend, strength: 40 })).toBe(true);
    expect(stopsToTalk({ kind: KIND.best, strength: 90 })).toBe(true);
    expect(stopsToTalk({ kind: KIND.met, strength: 10 })).toBe(false);
    expect(stopsToTalk({ kind: KIND.rival, strength: 50 })).toBe(false);
    expect(stopsToTalk(null)).toBe(false);
    const icons = new Set<string>();
    for (const [a, b] of pairsOf(KIND.friend, 400)) {
      const topic = topicFor(VIEW, a, b, Math.random());
      icons.add(topic);
      if (topic === 'speech') continue;
      // A shared interest, by the identities' interest bits.
      const shared = (WEB.identity[idOf(WEB, a)]! >>> 18) & (WEB.identity[idOf(WEB, b)]! >>> 18) & 0x1ff;
      expect(shared).not.toBe(0);
    }
    expect(icons.size).toBeGreaterThan(4);
    // A couple talks about each other now and then.
    const [a, b] = pairsOf(KIND.longterm)[0]!;
    expect(topicFor(VIEW, a, b, 0.1)).toBe('chat-love');
  });

  it('has every greeting, reaction and chat bubble in the built-in atlas', () => {
    const atlas = JSON.parse(readFileSync(new URL('../public/assets/atlas.json', import.meta.url), 'utf8')) as { frames: Record<string, unknown> };
    for (const name of ['wave', 'highfive', 'fistbump', 'hug', 'heart', 'sweat', 'anger', 'sparkle', 'speech', 'laugh', 'chat-sports', 'chat-gaming', 'chat-music', 'chat-fitness', 'chat-partying', 'chat-studying', 'chat-art', 'chat-fashion', 'chat-love']) {
      expect(atlas.frames[`emote.${name}`], name).toBeDefined();
    }
  });
});
