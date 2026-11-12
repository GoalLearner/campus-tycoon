import { currentDaylight } from './daylight';
import { bellDue, musicVolume, SILENT, soundMix, soundVolume, type SoundFacts, type SoundMix } from './life';

/**
 * Sound (DESIGN.md section 33.6 and 33.9). An ambient soundscape that follows
 * what is on screen, soft sounds for taps, a bell on the hour of the player's
 * own clock, and light music.
 *
 * Every sound is made here, in code, from tones and filtered noise. The game
 * ships no recorded audio, so there is nothing to download, nothing to
 * license and nothing to credit. A recorded file can take the place of any
 * one of these later: each sound is one small function below.
 *
 * It is for show: nothing here is saved and nothing here changes a number.
 * How loud each part is comes from the plain rule `soundMix`. This file only
 * plays it.
 *
 * Battery: nothing is created before the player's first tap, which is also
 * what browsers require. When the page is hidden or the app goes to the
 * background the audio clock is suspended and the one timer is cleared, so
 * nothing runs. With both volumes at zero it is suspended too.
 */

type Loop = keyof SoundMix;

/** How loud each steady layer is at its fullest, before the player's volume. All of it sits well under the music and the taps. */
const LOOP_LEVEL: Record<Loop, number> = { crowd: 0.16, traffic: 0.22, birds: 0, crickets: 0, rain: 0.3 };
/** The scheduler looks this far ahead, this often. */
const TICK_MS = 200;
/** A pentatonic scale from middle C, in hertz: no note in it clashes with another. */
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
/** The roots the music rests on, each for four bars. */
const ROOTS = [130.81, 110.0, 87.31, 98.0];
const BEAT_S = 1.7;

/** The hour on the player's own clock. The bell follows it whatever light the map is showing. */
const clockHour = (): number => new Date().getHours();

class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private loops: Partial<Record<Loop, GainNode>> = {};
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mix: SoundMix = SILENT;
  private facts: SoundFacts | null = null;
  private lastHour: number | null = null;
  private hidden = false;
  /** When the next of each scattered sound is due, on the audio clock. */
  private next = { step: 0, bird: 0, cricket: 0, swoosh: 0, beat: 0 };
  private beat = 0;
  private note = 2;

  /** True once the player has tapped and the audio has started. */
  get started(): boolean {
    return this.ctx !== null;
  }

  /**
   * The first tap: make the audio. Browsers allow no sound before this, and
   * the game wants none.
   */
  unlock(): void {
    if (this.ctx) {
      this.wake();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.soundBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.soundBus.connect(ctx.destination);
    this.musicBus.connect(ctx.destination);
    // Two seconds of noise, used by everything that hisses, rumbles or patters.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.loops.crowd = this.loop('bandpass', 650, 0.6);
    this.loops.traffic = this.loop('lowpass', 150, 0.4);
    this.loops.rain = this.loop('highpass', 1400, 0.3);
    this.applyVolumes();
    this.lastHour = clockHour();
    this.wake();
  }

  /** A steady layer: the noise through one filter, silent until the mix raises it. */
  private loop(type: BiquadFilterType, frequency: number, q: number): GainNode {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.soundBus!);
    source.start();
    return gain;
  }

  /** The player moved a volume. Zero on both stops everything. */
  applyVolumes(): void {
    if (!this.ctx || !this.soundBus || !this.musicBus) return;
    const now = this.ctx.currentTime;
    this.soundBus.gain.setTargetAtTime(soundVolume(), now, 0.05);
    this.musicBus.gain.setTargetAtTime(musicVolume() * 0.5, now, 0.05);
    this.wake();
  }

  /** The page was hidden or shown, or the app went to the background or came back. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.wake();
  }

  /** Run only when there is something to hear and someone to hear it. */
  private wake(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const silent = this.hidden || (soundVolume() <= 0 && musicVolume() <= 0);
    if (silent) {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      if (ctx.state === 'running') void ctx.suspend();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume();
    if (this.timer === null) {
      // Nothing that was due while it slept is played late.
      const now = ctx.currentTime;
      this.next = { step: now + 0.3, bird: now + 1, cricket: now + 1, swoosh: now + 4, beat: now + 1.5 };
      this.lastHour = clockHour();
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
  }

  /** What is on screen, from the map, a few times a second. */
  setFacts(facts: SoundFacts): void {
    this.facts = facts;
  }

  /** The mix now in force, for tests of the wiring and the dev readout. */
  get playing(): SoundMix {
    return this.mix;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const facts = this.facts;
    this.mix = facts ? soundMix({ ...facts, period: currentDaylight().period, hidden: this.hidden || facts.hidden }) : SILENT;
    const mix = this.mix;
    for (const name of ['crowd', 'traffic', 'rain'] as const) {
      // A crowd's murmur rises and falls a little by itself.
      const waver = name === 'crowd' ? 0.75 + Math.random() * 0.5 : 1;
      this.loops[name]?.gain.setTargetAtTime(mix[name] * LOOP_LEVEL[name] * waver, now, 0.5);
    }
    // Scattered sounds: each is due at a time that the mix brings nearer or pushes away.
    if (mix.crowd > 0.03 && now >= this.next.step) {
      this.footstep(now, mix.crowd);
      this.next.step = now + (0.16 + Math.random() * 0.3) / Math.max(0.15, mix.crowd);
    }
    if (mix.birds > 0.03 && now >= this.next.bird) {
      this.bird(now, mix.birds);
      this.next.bird = now + (1.2 + Math.random() * 4.5) / mix.birds;
    }
    if (mix.crickets > 0.03 && now >= this.next.cricket) {
      this.cricket(now, mix.crickets);
      this.next.cricket = now + (0.9 + Math.random() * 1.6) / mix.crickets;
    }
    if (mix.traffic > 0.1 && now >= this.next.swoosh) {
      this.swoosh(now, mix.traffic);
      this.next.swoosh = now + (2.5 + Math.random() * 5) / mix.traffic;
    }
    if (musicVolume() > 0 && now >= this.next.beat) {
      this.music(now);
      this.next.beat = now + BEAT_S;
    }
    // A bell on the hour of the player's own clock.
    const hour = clockHour();
    if (bellDue(this.lastHour, hour, this.hidden)) this.bell(now + 0.05);
    this.lastHour = hour;
  }

  /** One tone with a soft start and a fade, into either bus. */
  private tone(bus: GainNode | null, type: OscillatorType, from: number, to: number, at: number, length: number, level: number, attack = 0.01): void {
    const ctx = this.ctx;
    if (!ctx || !bus || level <= 0) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(bus);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  /** A short piece of the noise through a filter. */
  private puff(type: BiquadFilterType, from: number, to: number, at: number, length: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.soundBus || !this.noise || level <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, at);
    if (to !== from) filter.frequency.linearRampToValueAtTime(to, at + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + Math.min(0.02, length / 3));
    gain.gain.linearRampToValueAtTime(0, at + length);
    source.connect(filter).connect(gain).connect(this.soundBus);
    source.start(at, Math.random() * 1.5);
    source.stop(at + length + 0.05);
  }

  private footstep(at: number, crowd: number): void {
    this.puff('lowpass', 420 + Math.random() * 260, 300, at, 0.05, 0.1 + 0.12 * crowd);
  }

  /** Two to four quick chirps, each a tone that climbs and falls. */
  private bird(at: number, birds: number): void {
    const pitch = 2300 + Math.random() * 1700;
    const chirps = 2 + Math.floor(Math.random() * 3);
    for (let n = 0; n < chirps; n++) {
      const t = at + n * (0.11 + Math.random() * 0.05);
      this.tone(this.soundBus, 'sine', pitch, pitch * (1.18 + Math.random() * 0.2), t, 0.08, 0.05 * birds, 0.012);
    }
  }

  /** A run of short high pulses. */
  private cricket(at: number, crickets: number): void {
    const pitch = 4100 + Math.random() * 500;
    const pulses = 5 + Math.floor(Math.random() * 6);
    for (let n = 0; n < pulses; n++) this.tone(this.soundBus, 'sine', pitch, pitch, at + n * 0.045, 0.028, 0.022 * crickets, 0.004);
  }

  /** A car going by. */
  private swoosh(at: number, traffic: number): void {
    this.puff('bandpass', 260, 760, at, 0.9, 0.12 * traffic);
    this.puff('bandpass', 760, 240, at + 0.85, 1.1, 0.1 * traffic);
  }

  /** A soft bell: one note and the overtones that make it a bell, each fading at its own pace. */
  private bell(at: number): void {
    const base = 523.25;
    for (const [times, level, length] of [[1, 0.2, 3.2], [2, 0.11, 2.4], [2.76, 0.07, 1.8], [5.4, 0.035, 1.1]] as const) {
      this.tone(this.soundBus, 'sine', base * times, base * times, at, length, level, 0.006);
    }
  }

  /** One beat of the music: now and then a plucked note that steps along the scale, and every fourth bar a low root. */
  private music(at: number): void {
    const bar = Math.floor(this.beat / 4);
    if (this.beat % 4 === 0) {
      const root = ROOTS[Math.floor(bar / 2) % ROOTS.length]!;
      this.tone(this.musicBus, 'sine', root, root, at, BEAT_S * 4.2, 0.16, 0.6);
      this.tone(this.musicBus, 'sine', root * 1.5, root * 1.5, at, BEAT_S * 4.2, 0.07, 0.9);
    }
    if (Math.random() < 0.62) {
      // A step up or down, rarely a leap, and never off the ends of the scale.
      this.note = Math.max(0, Math.min(SCALE.length - 1, this.note + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]!));
      const pitch = SCALE[this.note]!;
      this.tone(this.musicBus, 'triangle', pitch, pitch, at, 1.9, 0.14, 0.012);
      // Sometimes an answering note half a beat later.
      if (Math.random() < 0.3) {
        const answer = SCALE[Math.max(0, Math.min(SCALE.length - 1, this.note + (Math.random() < 0.5 ? 2 : -2)))]!;
        this.tone(this.musicBus, 'triangle', answer, answer, at + BEAT_S / 2, 1.5, 0.09, 0.012);
      }
    }
    this.beat += 1;
  }

  /** A soft sound for a tap, for something built, and for something that could not be done. */
  ui(kind: 'tap' | 'place' | 'error'): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.hidden) return;
    const at = ctx.currentTime + 0.005;
    if (kind === 'tap') this.tone(this.soundBus, 'sine', 720, 560, at, 0.07, 0.1, 0.004);
    else if (kind === 'place') {
      this.tone(this.soundBus, 'triangle', 392, 392, at, 0.16, 0.13, 0.006);
      this.tone(this.soundBus, 'triangle', 587.33, 587.33, at + 0.09, 0.22, 0.12, 0.006);
    } else this.tone(this.soundBus, 'triangle', 196, 164.81, at, 0.2, 0.12, 0.01);
  }
}

export const sound = new SoundEngine();

/**
 * Wire the sound to the page: the first tap starts it, a tap on any button
 * makes a soft click, and hiding the page or leaving the app stops it all.
 */
export function installSound(): void {
  const first = (): void => sound.unlock();
  window.addEventListener('pointerdown', first, { capture: true, passive: true });
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button')) sound.ui('tap');
    },
    { capture: true, passive: true },
  );
  const hide = (): void => sound.setHidden(document.hidden);
  document.addEventListener('visibilitychange', hide);
  // Leaving the page, or the app going to the background: silence at once.
  window.addEventListener('pagehide', () => sound.setHidden(true));
  window.addEventListener('pageshow', hide);
}
