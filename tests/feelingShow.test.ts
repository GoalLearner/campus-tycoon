import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Emotion } from '../src/app/emotion';
import {
  BIG_KEY,
  bigMomentOf,
  cheeringAt,
  FACE_HOLD_MS,
  heldFacing,
  HELD_KEY,
  HELD_OURS,
  heldOf,
  laughingAt,
  motionAt,
  motionOf,
  MOTION_PACE,
  PACING,
  pacingAt,
  RING,
  swayAt,
  type Held,
  type Motion,
  type Today,
  type Trip,
  type Who,
} from '../src/app/feelingShow';
import { moodRingsSetting, setMoodRingsSetting } from '../src/app/life';

/**
 * The living campus, L2 (DESIGN.md 64.3): how a feeling shows on the map. The feeling itself is stop 3's (tested in
 * emotion.test.ts); these are the plain rules for how it looks, which the map only draws. Nothing here is saved.
 */

const EMOTIONS: Emotion[] = ['happy', 'excited', 'flirty', 'tense', 'embarrassed', 'sad', 'lonely', 'fine'];
const MOTIONS: Motion[] = ['bounce', 'hop', 'slump', 'stomp', 'pace', 'fidget', 'none'];

const trip = (over: Partial<Trip> = {}): Trip => ({ weather: 'clear', period: 'afternoon', from: 'home', to: 'quad', likes: new Set(), roll: 0.5, ...over });
const who = (over: Partial<Who> = {}): Who => ({ emotion: 'fine', reasons: [], chapter: null, classYear: 2, gpa: 3, roll: 0.5, ...over });
const QUIET: Today = { homeWin: false, bids: false, exams: false };

describe('how a feeling moves', () => {
  it('gives each feeling its motion: a bounce when happy, a jump when excited, a slump when sad', () => {
    expect(motionOf('happy', [])).toBe('bounce');
    expect(motionOf('excited', [])).toBe('hop');
    expect(motionOf('sad', ['Split up with Toni'])).toBe('slump');
    expect(motionOf('lonely', ['Nobody close yet'])).toBe('slump');
    expect(motionOf('embarrassed', [])).toBe('fidget');
    expect(motionOf('fine', [])).toBe('none');
  });

  it('reads a tense student as angry about someone, or stressed about exams', () => {
    expect(motionOf('tense', ['Not speaking to Sasha'])).toBe('stomp');
    expect(motionOf('tense', ['A rivalry with Nico', 'Finals week'])).toBe('stomp');
    expect(motionOf('tense', ['Finals week'])).toBe('pace');
    expect(motionOf('tense', ['Midterms', 'Exams ahead'])).toBe('pace');
  });

  it('walks slower when sad and brisker when angry, never far from the usual pace', () => {
    expect(MOTION_PACE.slump).toBeLessThan(1);
    expect(MOTION_PACE.stomp).toBeGreaterThan(1);
    for (const motion of MOTIONS) {
      expect(MOTION_PACE[motion]).toBeGreaterThanOrEqual(0.75);
      // Angry is the briskest, a fifth quicker (DESIGN.md 69.1).
      expect(MOTION_PACE[motion]).toBeLessThanOrEqual(1.2);
    }
  });

  it('keeps every body near where it stands, the same at the same moment', () => {
    for (const motion of MOTIONS) {
      for (const moving of [true, false]) {
        for (let ms = 0; ms < 6000; ms += 37) {
          const pose = motionAt(motion, ms, moving, 0.3);
          expect(pose.lift).toBeGreaterThanOrEqual(-1);
          expect(pose.lift).toBeLessThanOrEqual(6);
          expect(Math.abs(pose.shake)).toBeLessThanOrEqual(2);
          expect(pose.squash).toBeGreaterThanOrEqual(0.9);
          expect(pose.squash).toBeLessThanOrEqual(1);
          expect(motionAt(motion, ms, moving, 0.3)).toEqual(pose);
        }
      }
    }
  });

  it('jumps now and then when excited, stands still when angry or stressed and stopped, and only shifts when nervous and stopped', () => {
    const lifts = Array.from({ length: 260 }, (_, i) => motionAt('hop', i * 10, true, 0).lift);
    expect(lifts.some((lift) => lift > 3)).toBe(true);
    expect(lifts.filter((lift) => lift === 0).length).toBeGreaterThan(lifts.length / 2);
    // No feeling turns anyone about (DESIGN.md 69.1, the owner's "just spinning"): stopped, angry and stressed are still.
    for (const motion of ['stomp', 'pace'] as const) {
      for (let i = 0; i < 120; i++) expect(motionAt(motion, i * 50, false, 0.37)).toEqual({ lift: 0, shake: 0, squash: 1 });
    }
    // Angry walks hard and brisk.
    expect(Array.from({ length: 60 }, (_, i) => motionAt('stomp', i * 20, true, 0).lift).some((lift) => lift > 1)).toBe(true);
    expect(MOTION_PACE.stomp).toBeGreaterThan(1.1);
    expect(motionAt('fidget', 1234, true, 0).shake).toBe(0);
    expect(motionAt('bounce', 1234, false, 0).lift).toBe(0);
    expect(motionAt('slump', 0, true, 0).squash).toBeLessThan(1);
  });

  it('paces for real: a few steps out, one turn, back, one turn, and never turns more than once in two seconds', () => {
    for (const phase of [0, 0.21, 0.66]) {
      let turns = 0;
      let lastTurn = -Infinity;
      let before = pacingAt(0, phase);
      let walked = 0;
      for (let ms = 10; ms <= 30_000; ms += 10) {
        const now = pacingAt(ms, phase);
        expect(now.along).toBeGreaterThanOrEqual(0);
        expect(now.along).toBeLessThanOrEqual(1);
        if (now.walking) walked += 1;
        // They face the way they step: out on the way out, back on the way back.
        if (now.walking && before.walking && now.along !== before.along) expect(now.along > before.along).toBe(!now.back);
        if (now.back !== before.back) {
          turns += 1;
          expect(ms - lastTurn).toBeGreaterThanOrEqual(2 * 1000 * PACING.pause);
          lastTurn = ms;
          // A turn only at an end, standing.
          expect(now.walking && before.walking).toBe(false);
        }
        before = now;
      }
      // Up and back about five times in thirty seconds, walking most of it.
      expect(turns).toBeGreaterThanOrEqual(10);
      expect(turns).toBeLessThanOrEqual(13);
      expect(walked / 3000).toBeGreaterThan(0.6);
    }
  });

  it('holds a figure’s facing for most of a second, so a wiggle in a route never shows as spinning', () => {
    // A route that asks to turn every 100 ms for ten seconds: the figure turns at most once in FACE_HOLD_MS.
    let shown: 'se' | 'sw' = 'se';
    let at = -Infinity;
    let turns = 0;
    let last = -Infinity;
    for (let ms = 0; ms < 10_000; ms += 16) {
      const want = Math.floor(ms / 100) % 2 === 0 ? 'sw' : 'se';
      const held: { dir: 'se' | 'sw'; at: number } = heldFacing<'se' | 'sw'>(shown, at, want, ms);
      if (held.dir !== shown) {
        turns += 1;
        expect(ms - last).toBeGreaterThanOrEqual(FACE_HOLD_MS);
        last = ms;
      }
      shown = held.dir;
      at = held.at;
    }
    expect(turns).toBeLessThanOrEqual(Math.ceil(10_000 / FACE_HOLD_MS));
    expect(FACE_HOLD_MS).toBeGreaterThanOrEqual(500);
    expect(FACE_HOLD_MS).toBeLessThanOrEqual(1000);
    // A real corner, long after the last turn, shows at once.
    expect(heldFacing('se', 0, 'sw', 5000)).toEqual({ dir: 'sw', at: 5000 });
  });

  it('laughs with a bounce and a shake, cheers with a jump, dances with a sway', () => {
    const laughs = Array.from({ length: 100 }, (_, i) => laughingAt(i * 13, 0));
    expect(laughs.some((pose) => pose.lift > 1)).toBe(true);
    expect(laughs.some((pose) => Math.abs(pose.shake) > 0.3)).toBe(true);
    expect(Array.from({ length: 100 }, (_, i) => cheeringAt(i * 10, 0).lift).some((lift) => lift > 4)).toBe(true);
    const sways = Array.from({ length: 100 }, (_, i) => swayAt(i * 20, 0).rotation);
    expect(Math.min(...sways)).toBeLessThan(-0.05);
    expect(Math.max(...sways)).toBeGreaterThan(0.05);
  });
});

describe('the mood ring', () => {
  it('has a ring for every feeling but Fine, each its own', () => {
    expect(RING.fine).toBeNull();
    const rings = EMOTIONS.filter((emotion) => emotion !== 'fine').map((emotion) => RING[emotion]);
    expect(rings.every((ring) => ring !== null && ring.startsWith('emote.mood-'))).toBe(true);
    expect(new Set(rings).size).toBe(rings.length);
  });

  it('shows unless the player hides it', () => {
    expect(moodRingsSetting()).toBe(true);
    setMoodRingsSetting(false);
    expect(moodRingsSetting()).toBe(false);
    setMoodRingsSetting(true);
    expect(moodRingsSetting()).toBe(true);
  });
});

describe('what they carry', () => {
  const rolls = (over: Partial<Trip>): Map<Held | null, number> => {
    const out = new Map<Held | null, number>();
    for (let i = 0; i < 1000; i++) {
      const held = heldOf(trip({ ...over, roll: (i + 0.5) / 1000 }));
      out.set(held, (out.get(held) ?? 0) + 1);
    }
    return out;
  };

  it('opens an umbrella in the rain, most of the time', () => {
    expect(rolls({ weather: 'rain' }).get('umbrella')).toBeGreaterThan(500);
    expect(rolls({}).get('umbrella') ?? 0).toBe(0);
  });

  it('takes a bag or a book to class and a ball to play, and some have a phone', () => {
    const toClass = rolls({ to: 'class' });
    expect((toClass.get('bag') ?? 0) + (toClass.get('book') ?? 0)).toBeGreaterThan(250);
    expect(rolls({ to: 'play', likes: new Set(['sports']) }).get('ball')).toBeGreaterThan(300);
    expect(rolls({}).get('phone')).toBeGreaterThan(80);
  });

  it('leaves most hands empty in fine weather, and is the same for the same trip', () => {
    for (const to of ['class', 'play', 'quad', 'home', 'food', 'other'] as const) {
      expect(rolls({ to }).get(null) ?? 0).toBeGreaterThan(500);
    }
    expect(heldOf(trip({ roll: 0.9 }))).toBe(heldOf(trip({ roll: 0.9 })));
  });
});

describe('big moments', () => {
  it('breaks a heart after a break-up', () => {
    expect(bigMomentOf(who({ emotion: 'sad', reasons: ['Split up with Toni'] }), QUIET)).toBe('heartbreak');
    expect(bigMomentOf(who({ emotion: 'sad', reasons: ['Misses home'] }), QUIET)).toBeNull();
  });

  it('brings a bid to a new chapter member after rush, a bad grade in exam week, a trophy after a home win', () => {
    expect(bigMomentOf(who({ chapter: 'Alpha Rho', classYear: 0 }), { ...QUIET, bids: true })).toBe('bid');
    expect(bigMomentOf(who({ chapter: 'Alpha Rho', classYear: 3 }), { ...QUIET, bids: true })).toBeNull();
    expect(bigMomentOf(who({ gpa: 1.6, roll: 0.2 }), { ...QUIET, exams: true })).toBe('fail');
    expect(bigMomentOf(who({ gpa: 3.4, roll: 0.2 }), { ...QUIET, exams: true })).toBeNull();
    expect(bigMomentOf(who({ roll: 0.1 }), { ...QUIET, homeWin: true })).toBe('win');
    expect(bigMomentOf(who({ roll: 0.9 }), { ...QUIET, homeWin: true })).toBeNull();
  });

  it('leaves a quiet day quiet', () => {
    for (const emotion of EMOTIONS) expect(bigMomentOf(who({ emotion, reasons: ['Has a group of friends'] }), QUIET)).toBeNull();
  });
});

describe('the art', () => {
  const frames = (path: string): Record<string, unknown> => (JSON.parse(readFileSync(join(__dirname, '..', path), 'utf8')) as { frames: Record<string, unknown> }).frames;
  const built = frames('public/assets/atlas.json');

  it('puts our own drawings in the built-in atlas, and never the packs’ paid parts', () => {
    for (const key of Object.values(BIG_KEY)) expect(built[key]).toBeDefined();
    for (const key of Object.values(RING)) if (key) expect(built[key]).toBeDefined();
    for (const [held, key] of Object.entries(HELD_KEY) as Array<[Held, string]>) {
      if (HELD_OURS.has(held)) expect(built[key]).toBeDefined();
      else expect(built[key]).toBeUndefined();
    }
  });
});
