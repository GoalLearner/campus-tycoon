import Phaser from 'phaser';
import { chooseMoment, MOMENT_GAP_MS, MOMENT_MS, type MomentKind } from '../app/crowdMoments';
import type { DayPeriod } from '../app/daylight';
import type { Weather } from '../app/life';
import { hashInts, type GameState } from '../sim';
import type { Activity } from './Activity';
import type { Art } from './art';
import type { Iso } from './iso';
import type { Lawns } from './Lawns';
import type { Scenes } from './Scenes';
import { DUST_FROM_MS, DUST_MS, type Walkers } from './Walkers';

/** What the scene tells the moments: the hour, the sky, the calendar, the settings. */
export interface MomentLife {
  period: DayPeriod;
  weather: Weather;
  partyNight: boolean;
  commencement: boolean;
  reduced: boolean;
}

/**
 * The living campus, L3 (DESIGN.md 64.4): now and then, where the player is looking, a moment the crowd gathers
 * round: a scuffle (a cartoon dust cloud), a couple arguing, a busker playing to a crowd, a dance-off on a lawn, a
 * proposal at commencement, someone falling into a fountain, a game-winning shot on the courts. One at a time, with
 * a while between; none with Reduce effects or at the crowd step kept for short frames. Chosen by `chooseMoment` from
 * the seed and the clock and from what is on screen; the walkers stage the people in it and the crowd that watches.
 */
export class Moments {
  private state: GameState | null = null;
  private life: MomentLife = { period: 'afternoon', weather: 'clear', partyNight: false, commencement: false, reduced: false };
  private step = 2;
  private fountains: Array<{ x: number; y: number }> = [];
  private nextAt = 0;
  private live: { kind: MomentKind; until: number } | null = null;
  private staged = 0;
  /** A scuffle's dust cloud, while it shows. */
  private cloud: { image: Phaser.GameObjects.Image; x: number; y: number; from: number; until: number } | null = null;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
    private walkers: Walkers,
    private lawns: Lawns,
    private scenes: Scenes,
    private activity: Activity,
  ) {}

  setLife(life: MomentLife): void {
    this.life = life;
  }

  setStep(step: number): void {
    this.step = step;
  }

  /** The fountains on the map: a one-cell quad's, the reward fountain, and the stone fountain among the decorations. */
  setMap(state: GameState): void {
    this.state = state;
    this.fountains = [];
    // A quad of one cell has the fountain as its showpiece (CampusScene.quadTop).
    const { width, height, cells } = state.map;
    const isQuad = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x]!.kind === 'quad';
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isQuad(x, y) && !isQuad(x + 1, y) && !isQuad(x - 1, y) && !isQuad(x, y + 1) && !isQuad(x, y - 1)) this.fountains.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    for (const placed of state.map.placed) {
      if (placed && (placed.type === 'fountain' || (placed.type === 'decor' && placed.decor === 'fountain'))) this.fountains.push({ x: placed.x + placed.w / 2, y: placed.y + placed.h / 2 });
    }
  }

  /** The moment on now, for the dev page and pictures. */
  get now(): MomentKind | null {
    return this.live?.kind ?? null;
  }

  update(time: number): void {
    const now = this.scene.time.now;
    this.drawCloud(now);
    if (this.life.reduced || this.step <= 0 || !this.state) return;
    if (this.live && now < this.live.until) return;
    this.live = null;
    if (now < this.nextAt) return;
    const state = this.state;
    const seed = state.seed;
    const roll = (n: number): number => (hashInts(seed, state.clock.tick, this.staged, n) >>> 0) / 4294967296;
    this.nextAt = now + MOMENT_GAP_MS[0] + roll(7003) * (MOMENT_GAP_MS[1] - MOMENT_GAP_MS[0]);
    void time;
    const view = this.scene.cameras.main.worldView;
    const busker = this.scenes.buskerAt();
    const dance = this.lawns.groupIn(view, 'dance');
    const game = this.activity.gameIn(view);
    const walks = this.walkers.momentFacts(view, this.fountains);
    const sitting = this.lawns.groupIn(view, 'couple') !== null;
    const kind = chooseMoment(
      { ...this.life, busker: busker !== null, dance: dance !== null, courts: game !== null, fountain: walks.fountain, couples: walks.couples || sitting, pairs: walks.pairs },
      roll(7001),
    );
    if (!kind) return;
    this.staged += 1;
    const ms = MOMENT_MS[kind];
    let at: { x: number; y: number } | null = null;
    if (kind === 'performer') at = busker;
    else if (kind === 'danceOff') at = dance;
    else if (kind === 'winningShot' && game) {
      this.activity.bigPoint(game.id);
      at = { x: game.x, y: game.y };
    } else {
      at = this.walkers.stage(kind, view, this.fountains, ms);
      // A couple out walking, else a couple sitting on a lawn.
      if (!at && (kind === 'proposal' || kind === 'coupleFight')) at = this.lawns.stageCouple(view, kind);
    }
    if (!at) return;
    if (kind === 'dustup') this.startCloud(at, now);
    this.walkers.watch(at, kind, ms);
    this.live = { kind, until: now + ms };
  }

  /** The cloud a moment after the argument, over the two of them, about two figures wide. */
  private startCloud(at: { x: number; y: number }, now: number): void {
    if (!this.art.has('emote.dustup')) return;
    this.cloud?.image.destroy();
    const image = this.scene.add.image(0, 0, '__DEFAULT');
    this.art.apply(image, 'emote.dustup');
    image.setOrigin(0.5, 0.5).setScale(CLOUD_SCALE).setVisible(false);
    this.cloud = { image, x: at.x, y: at.y, from: now + DUST_FROM_MS, until: now + DUST_FROM_MS + DUST_MS };
  }

  private drawCloud(now: number): void {
    const cloud = this.cloud;
    if (!cloud) return;
    if (now >= cloud.until) {
      cloud.image.destroy();
      this.cloud = null;
      return;
    }
    if (now < cloud.from) return;
    // It churns: a wobble in size and a little turn, and it puffs in and out.
    const t = (now - cloud.from) / 1000;
    const left = (cloud.until - now) / 1000;
    const at = this.iso.toWorld(cloud.x, cloud.y);
    const fade = Math.min(1, t / 0.15, left / 0.25);
    cloud.image
      .setVisible(true)
      .setPosition(at.x + Math.sin(t * 23) * 1.5, at.y - CLOUD_LIFT + Math.cos(t * 19) * 1.2)
      .setScale(CLOUD_SCALE * (1 + Math.sin(t * 17) * 0.05))
      .setRotation(Math.sin(t * 11) * 0.06)
      // Drawn as a person there is: a building in front still hides it.
      .setDepth((this.iso.sum(cloud.x, cloud.y) - 1) * 4 + 2.8)
      .setAlpha(fade);
  }

  clear(): void {
    this.cloud?.image.destroy();
    this.cloud = null;
    this.live = null;
  }
}

/** The dust cloud is drawn about 60 pixels wide, its middle at about the height of a figure's chest. */
const CLOUD_SCALE = 0.75;
const CLOUD_LIFT = 18;
