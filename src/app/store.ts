import { upgradeNotes } from './upgradeNotes';
import {
  advance,
  ANCHOR_AFTER_WAKE_TICKS,
  DEFAULT_WAKE_HOUR,
  duration,
  TICKS_PER_DAY,
  applyAction,
  campusHappiness,
  enrollment,
  groundsLine,
  makeSandbox,
  newGame,
  parseSave,
  scaleOf,
  serialize,
  type Action,
  type ActionResult,
  type GameState,
  type LogEntry,
} from '../sim';
import { mergeAway, readSavedApp, type AwayReport, type SavedApp } from './away';
import { clock } from './clock';
import { sound } from './sound';
import { clearSaves, readSaves, readSlots, readWebRecord, requestPersistentStorage, writeSave, writeSlots, writeWebRecord, type SaveSlot, type SlotRecord } from './persistence';

/**
 * Holds the one game state and is the only thing that changes it.
 * The UI and the map read the state from here and send actions back.
 * Every action first advances the sim to now, then applies, then saves.
 */

/** Away for at least this long and the player gets the "while you were away" list. */
const AWAY_MINUTES = 10;

export type { AwayReport } from './away';

type Listener = () => void;
type LogListener = (entries: LogEntry[]) => void;
/** Told after each save lands on the phone. `puttingAway` when the app is being put away. */
type SavedListener = (puttingAway: boolean) => void;

export class Store {
  private current: GameState | null = null;
  private listeners = new Set<Listener>();
  private logListeners = new Set<LogListener>();
  private savedListeners = new Set<SavedListener>();
  private newCampusListeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSavedTick = -1;
  /** When true the game is never written to storage. Used by the dev demo. */
  private ephemeral = false;

  /**
   * Set when the player returns after a while. It is saved with the game and
   * kept until the player has seen it: closing the app first loses nothing,
   * and whatever happens before the next visit is added to it.
   */
  away: AwayReport | null = null;
  /** When the player last exported a backup or loaded one. null when never. */
  lastExportAt: number | null = null;
  /** True during the first catch-up after a save is loaded. */
  private opening = false;
  /** True when this visit began by loading a saved game: a return visit, not the one that founded it. */
  returning = false;
  /** Things that happened while the app was open, newest last. The UI drains it. */
  recent: LogEntry[] = [];
  /** Rules that are new to a save made by an older version. The UI shows them once and clears them. */
  upgradeNotes: string[] = [];
  /** True from the moment a game is founded until its first issue of the paper has been read. Not saved: it is a greeting. */
  welcome = false;
  /** True when a save was found but could not be read, and the backup was used or nothing was. */
  loadProblem: string | null = null;
  /**
   * Set while the model campus is being visited: the name of the player's own
   * university, which waits untouched in its save. Nothing is saved during a
   * visit. null at any other time.
   */
  visiting: string | null = null;
  private visitClock = 0;
  /**
   * Which campus is open (DESIGN.md 79): the player's own, or the sandbox beside it. Everything the store writes goes
   * under this slot's keys, and nothing done in the sandbox is ever written under the real campus's.
   */
  slot: SaveSlot = 'real';
  /** Which is open at the next launch, and each one's name, kept with the saves. */
  slots: SlotRecord = { open: 'real', names: {} };

  get state(): GameState {
    if (!this.current) throw new Error('No game is loaded.');
    return this.current;
  }

  /** True for a game shown from elsewhere, such as a dev demo, which is never saved. */
  get isEphemeral(): boolean {
    return this.ephemeral;
  }

  get hasGame(): boolean {
    return this.current !== null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Hear about things as they happen while the app is open. The map uses it to show students moving in. */
  onLive(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  /** Hear after each save lands on the phone. Cloud saves upload from here (DESIGN.md 48). */
  onSaved(listener: SavedListener): () => void {
    this.savedListeners.add(listener);
    return () => this.savedListeners.delete(listener);
  }

  /** Hear when the phone begins another campus: a new game, a save file loaded, or the game deleted. */
  onNewCampus(listener: Listener): () => void {
    this.newCampusListeners.add(listener);
    return () => this.newCampusListeners.delete(listener);
  }

  private newCampus(): void {
    for (const listener of this.newCampusListeners) listener();
  }

  /** True while the sandbox is open (DESIGN.md 79). */
  get inSandbox(): boolean {
    return this.slot === 'sandbox';
  }

  /** The player's own campus's name, when there is one, for the way back from the sandbox. */
  get realName(): string | null {
    return this.slots.names.real ?? null;
  }

  /** True when there is a sandbox to open. */
  get hasSandbox(): boolean {
    return this.slots.names.sandbox !== undefined;
  }

  /** Load the campus that was open last (the player's own, or the sandbox), falling back to its backup. */
  async load(): Promise<boolean> {
    if (this.current) return true;
    this.slots = await readSlots();
    if (this.slots.open === 'sandbox') {
      if (await this.loadSlot('sandbox')) return true;
      // A sandbox that cannot be read: the player's own campus opens.
      this.slots.open = 'real';
    }
    return this.loadSlot('real');
  }

  /** Load one campus's save, falling back to its backup. Returns whether a game was loaded. */
  private async loadSlot(slot: SaveSlot): Promise<boolean> {
    const stored = await readSaves(slot);
    for (const [label, text] of [
      ['save', stored.save],
      ['backup', stored.backup],
    ] as const) {
      if (!text) continue;
      const result = parseSave(text);
      if (result.ok) {
        this.current = result.state;
        this.slot = slot;
        this.slots.names[slot] = result.state.school.name;
        if (result.migratedFrom !== null) this.upgradeNotes = upgradeNotes(result.migratedFrom);
        const kept = readSavedApp(result.app);
        this.away = kept.away;
        this.lastExportAt = kept.lastExportAt;
        clock.follow(result.state.clock.lastSimulatedAt);
        this.chooseAnchor();
        if (label === 'backup') this.loadProblem = 'Your latest save could not be read, so an earlier one was loaded.';
        // Ask again on every open: a browser that said no last week may say yes once the game is used more.
        void requestPersistentStorage();
        this.opening = true;
        this.catchUp();
        this.opening = false;
        this.returning = true;
        return true;
      }
      this.loadProblem = result.reason;
    }
    return false;
  }

  /**
   * A save from before the anchor has none. It is given one here, the first
   * time it is opened: a day that starts at seven, so every day of the campus
   * week begins at nine. Nothing is shortened: its next summer runs longer to
   * get there. The player is told once, and can change it in the Menu.
   */
  private chooseAnchor(): void {
    const state = this.current;
    if (!state || state.clock.anchor !== null) return;
    const before = state.clock.week.extra;
    const result = applyAction(state, { type: 'anchor', minute: anchorFor(DEFAULT_WAKE_HOUR) });
    if (!result.ok || result.changed === 0) return;
    this.current = result.state;
    const longer = result.state.clock.week.extra - before;
    this.upgradeNotes.push(
      `New: every day of the campus week now begins at ${hourName(DEFAULT_WAKE_HOUR + 2)} your time, so classes arrive and home games kick off while you are up. Nothing is cut short: this summer runs ${duration(longer)} longer, and the new hours start with the fall. If your day starts earlier or later than ${hourName(DEFAULT_WAKE_HOUR)}, change it in the Menu.`,
    );
  }

  /**
   * Copy the player's campus into a sandbox and open it (DESIGN.md 79). The player's own is saved first and then left
   * as it is: the copy is written only under the sandbox's keys, with a copy of its social web, and replaces any
   * sandbox there was. Returns why not, or null.
   */
  async copyToSandbox(): Promise<string | null> {
    const own = this.current;
    if (!own || this.slot !== 'real' || this.visiting !== null || this.ephemeral) return 'Only your own campus can be copied into a sandbox.';
    await this.flush();
    const copy = structuredClone(own);
    makeSandbox(copy);
    const web = await readWebRecord('real');
    await clearSaves('sandbox');
    if (web) await writeWebRecord(web, 'sandbox');
    this.slots = { open: 'sandbox', names: { ...this.slots.names, real: own.school.name, sandbox: copy.school.name }, realClock: clock.offset() };
    this.enter('sandbox', copy);
    await this.flush();
    await writeSlots(this.slots);
    this.emit();
    return null;
  }

  /**
   * Found a sandbox campus (DESIGN.md 79): the model campus, as a new university, with the sandbox's rules, under the
   * sandbox's keys. A campus of the player's own, if there is one, is saved first and left as it is.
   */
  async foundSandbox(name: string, wakeHour: number = DEFAULT_WAKE_HOUR, colour?: string): Promise<void> {
    if (this.current && this.slot === 'real' && !this.ephemeral && this.visiting === null) {
      await this.flush();
      this.slots.names.real = this.current.school.name;
      this.slots.realClock = clock.offset();
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    let state = newGame({ seed, name, now: clock.now(), anchor: anchorFor(wakeHour), campus: 'model' });
    if (colour) {
      const picked = applyAction(state, { type: 'colour', colour });
      if (picked.ok) state = picked.state;
    }
    makeSandbox(state);
    await clearSaves('sandbox');
    this.slots = { ...this.slots, open: 'sandbox', names: { ...this.slots.names, sandbox: name } };
    this.ephemeral = false;
    this.visiting = null;
    this.enter('sandbox', state);
    this.welcome = enrollment(state) > 0;
    await this.flush();
    await writeSlots(this.slots);
    this.emit();
  }

  /**
   * Open the other campus (DESIGN.md 79): the one open now is saved under its own keys first, then the other is read
   * from its save and caught up to now. A skip of the tester clock made in the sandbox stays with the sandbox.
   */
  async switchTo(slot: SaveSlot): Promise<boolean> {
    if (this.visiting !== null) return false;
    if (slot === this.slot && this.current) return true;
    await this.flush();
    if (this.slot === 'real' && this.current) this.slots.realClock = clock.offset();
    this.current = null;
    this.away = null;
    this.welcome = false;
    this.recent = [];
    this.upgradeNotes = [];
    this.loadProblem = null;
    if (slot === 'real' && this.slots.realClock !== undefined) clock.restore(this.slots.realClock);
    this.slots.open = slot;
    this.slot = slot;
    await writeSlots(this.slots);
    const ok = await this.loadSlot(slot);
    this.emit();
    return ok;
  }

  /** A campus put in place by the store itself: the sandbox's copy or its founding. Nothing is carried over. */
  private enter(slot: SaveSlot, state: GameState): void {
    this.slot = slot;
    this.current = state;
    this.away = null;
    this.welcome = false;
    this.recent = [];
    this.upgradeNotes = [];
    this.loadProblem = null;
    this.lastSavedTick = -1;
  }

  /** Show a game that was built elsewhere, such as the dev demo. */
  adopt(state: GameState, options: { ephemeral: boolean }): void {
    this.current = state;
    this.ephemeral = options.ephemeral;
    this.welcome = false;
    this.away = null;
    this.recent = [];
    this.emit();
  }

  /**
   * Look at the model campus without touching the player's own game. Their
   * game is saved first and then left alone: the visit is never written
   * anywhere, and `leaveVisit` reads their own campus back from its save.
   */
  async visitModel(): Promise<void> {
    const own = this.current;
    if (!own || this.visiting !== null) return;
    await this.flush();
    this.visitClock = clock.offset();
    this.visiting = own.school.name;
    this.ephemeral = true;
    let state = newGame({ seed: own.seed, name: own.school.name, now: clock.now(), anchor: own.clock.anchor ?? anchorFor(DEFAULT_WAKE_HOUR), campus: 'model' });
    const coloured = applyAction(state, { type: 'colour', colour: own.football.colour });
    if (coloured.ok) state = coloured.state;
    this.current = state;
    this.away = null;
    this.welcome = false;
    this.recent = [];
    this.upgradeNotes = [];
    this.emit();
  }

  /** Back from the model campus to the player's own, read from its save and caught up to now. */
  async leaveVisit(): Promise<void> {
    if (this.visiting === null) return;
    this.visiting = null;
    this.ephemeral = false;
    this.current = null;
    this.away = null;
    this.welcome = false;
    this.recent = [];
    // A skip of the clock made while visiting belongs to the visit, not to the player's own campus.
    clock.restore(this.visitClock);
    await this.load();
    this.emit();
  }

  /**
   * `wakeHour` is the hour of the player's own clock their day usually starts. `colour` is the school's.
   * `campus` is which to begin on. The founding screen always asks for the model campus (DESIGN.md 35.6).
   * Left out, it is the small campus, which the tests and the long runs use and no player is offered.
   */
  startNewGame(name: string, wakeHour: number = DEFAULT_WAKE_HOUR, colour?: string, campus: 'small' | 'model' = 'small'): void {
    clock.reset();
    this.ephemeral = false;
    this.visiting = null;
    this.slot = 'real';
    this.slots = { ...this.slots, open: 'real', names: { ...this.slots.names, real: name } };
    delete this.slots.realClock;
    void writeSlots(this.slots);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    this.current = newGame({ seed, name, now: clock.now(), anchor: anchorFor(wakeHour), campus });
    if (colour) {
      const picked = applyAction(this.current, { type: 'colour', colour });
      if (picked.ok) this.current = picked.state;
    }
    this.away = null;
    // A campus that opens with students on it greets its president with the paper's first issue.
    this.welcome = enrollment(this.current) > 0;
    this.lastExportAt = null;
    this.recent = [];
    this.loadProblem = null;
    this.newCampus();
    void requestPersistentStorage();
    this.saveNow();
    this.emit();
  }

  /**
   * What the founding screen does (DESIGN.md 35.6): every game a player starts begins on the model campus. It is
   * the only way the app founds a game. The small campus is reached by the tests and the long runs alone.
   */
  foundUniversity(name: string, wakeHour: number = DEFAULT_WAKE_HOUR, colour?: string): void {
    this.startNewGame(name, wakeHour, colour, 'model');
  }

  /**
   * True when the Menu offers "Visit the model campus": a game that began on the small campus, and is not on a
   * visit already. A game that began on the model campus is there.
   */
  get offersVisit(): boolean {
    return this.current !== null && this.visiting === null && scaleOf(this.current) === 1;
  }

  /** Replace the game with one read from a save file. Returns an error message, or null on success. */
  importSave(text: string): string | null {
    if (this.slot !== 'real') return 'A save file is loaded into your own campus: go back to it first.';
    const result = parseSave(text);
    if (!result.ok) return result.reason;
    this.current = result.state;
    this.upgradeNotes = result.migratedFrom !== null ? upgradeNotes(result.migratedFrom) : [];
    clock.follow(result.state.clock.lastSimulatedAt);
    this.chooseAnchor();
    this.away = null;
    this.welcome = false;
    // The file that was just loaded is itself a backup, as old as the day it was made.
    this.lastExportAt = result.savedAt > 0 ? result.savedAt : null;
    this.recent = [];
    this.newCampus();
    this.catchUp();
    this.saveNow();
    this.emit();
    return null;
  }

  /**
   * Put a campus from the cloud in place of this phone's (DESIGN.md 48): the player chose it. It is caught up from
   * its own clock, as a save opened on the phone is. Returns an error message, or null on success.
   */
  adoptCloudSave(text: string): string | null {
    if (this.slot !== 'real') return 'A campus from the cloud goes into your own campus: go back to it first.';
    const result = parseSave(text);
    if (!result.ok) return result.reason;
    this.current = result.state;
    this.ephemeral = false;
    this.visiting = null;
    this.upgradeNotes = result.migratedFrom !== null ? upgradeNotes(result.migratedFrom) : [];
    clock.follow(result.state.clock.lastSimulatedAt);
    this.chooseAnchor();
    this.away = null;
    this.welcome = false;
    this.recent = [];
    this.catchUp();
    void this.flush(false, false);
    this.emit();
    return null;
  }

  async deleteGame(): Promise<void> {
    if (this.slot === 'sandbox') {
      // The sandbox only: the player's own campus is opened again, untouched.
      await clearSaves('sandbox');
      delete this.slots.names.sandbox;
      this.current = null;
      this.recent = [];
      if (this.slots.names.real !== undefined && (await this.switchTo('real'))) return;
      this.slot = 'real';
      this.slots.open = 'real';
      await writeSlots(this.slots);
      this.emit();
      return;
    }
    this.current = null;
    this.away = null;
    this.welcome = false;
    this.lastExportAt = null;
    this.recent = [];
    this.newCampus();
    await clearSaves('real');
    delete this.slots.names.real;
    await writeSlots(this.slots);
    this.emit();
  }

  /** A backup file. It holds the game only: an unread away list stays on this device. */
  exportText(): string {
    return serialize(this.state, clock.now());
  }

  /** The player has a fresh backup in hand. */
  markExported(): void {
    this.lastExportAt = clock.now();
    this.scheduleSave(300);
    this.emit();
  }

  /**
   * The player has read an away list. Only the list they were shown is
   * dropped: if more was added to it while it was on screen, that stays.
   */
  welcomeSeen(): void {
    this.welcome = false;
    this.emit();
  }

  awaySeen(shown: AwayReport): void {
    if (this.away !== shown) return;
    this.away = null;
    this.scheduleSave(300);
    this.emit();
  }

  private appData(): SavedApp {
    return { away: this.away, lastExportAt: this.lastExportAt };
  }

  /** Bring the sim up to now. Called every second while open, and on return. */
  catchUp(): void {
    if (!this.current) return;
    const before = this.current;
    const result = advance(before, before.clock.lastSimulatedAt, clock.now());
    if (result.state === before) return;
    this.current = result.state;

    if (result.info.ticks > 0) {
      const longAbsence = result.info.ticks >= AWAY_MINUTES || result.info.weeksSkipped > 0;
      // A list the player never read is still waiting: whatever happened since joins it, however short the gap.
      if (longAbsence || (this.opening && this.away)) {
        this.away = mergeAway(this.away, {
          minutes: result.info.ticks + result.info.weeksSkipped * 7 * 24 * 60,
          weeksSkipped: result.info.weeksSkipped,
          log: result.log,
          cashBefore: before.money.cash,
          cashAfter: result.state.money.cash,
          studentsBefore: enrollment(before),
          studentsAfter: enrollment(result.state),
        });
        // Grounds gets one line, written from everything the list now covers.
        this.away.grounds = groundsLine(result.state, this.away.log);
        this.away.groundsFirst = this.away.grounds !== '' && campusHappiness(result.state).worstPart === 'clean';
      } else {
        this.recent.push(...result.log);
        if (result.log.length > 0) for (const listener of this.logListeners) listener(result.log);
      }
      // One save a minute while open is plenty: a lost minute is replayed exactly on the next load.
      if (result.state.clock.tick - this.lastSavedTick >= 1) this.scheduleSave(1500);
      this.emit();
    }
  }

  dispatch(action: Action): ActionResult {
    this.catchUp();
    const result = applyAction(this.state, action);
    if (result.ok) {
      this.current = result.state;
      this.scheduleSave(300);
      this.emit();
      // Something built or laid has a soft sound. Clearing, hiring and the Money panel's choices have the tap's.
      if (result.changed > 0 && (action.type === 'place' || (action.type === 'paint' && action.tool !== 'clear'))) sound.ui('place');
    }
    return result;
  }

  private scheduleSave(delayMs: number): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), delayMs);
  }

  saveNow(puttingAway = false): void {
    void this.flush(puttingAway);
  }

  /**
   * Write the save and wait for it to land. Used before the page reloads for an update. `puttingAway` when the app
   * is being put away; `tell` false for a save that came from the cloud, which has nothing new to send back.
   */
  async flush(puttingAway = false, tell = true): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.current || this.ephemeral) return;
    this.lastSavedTick = this.current.clock.tick;
    // Under the open campus's own keys: the sandbox's never go under the real campus's (DESIGN.md 79).
    const slot = this.slot;
    if (slot === 'sandbox' && this.current.sandbox !== true) return;
    try {
      await writeSave(serialize(this.current, clock.now(), this.appData()), slot);
    } catch {
      // Storage can fail in private browsing. The game keeps running in memory.
    }
    // Cloud saves upload the player's own campus only.
    if (tell && slot === 'real') for (const listener of this.savedListeners) listener(puttingAway);
  }

  /** Start the once-a-second heartbeat and save whenever the app is put away. */
  start(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => this.catchUp(), 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow(true);
      else this.catchUp();
    });
    window.addEventListener('pagehide', () => this.saveNow(true));
  }
}

/** The anchor for a day that starts at an hour of the player's own clock: two hours later, as a minute of the UTC day. */
export function anchorFor(wakeHour: number): number {
  const local = wakeHour * 60 + ANCHOR_AFTER_WAKE_TICKS;
  return (((local + new Date().getTimezoneOffset()) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

/** The hour of the player's own clock their day starts at, read back from the anchor a game has. */
export function wakeHourOf(anchor: number | null): number {
  if (anchor === null) return DEFAULT_WAKE_HOUR;
  const local = (((anchor - new Date().getTimezoneOffset() - ANCHOR_AFTER_WAKE_TICKS) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return Math.round(local / 60) % 24;
}

/** "7 AM", "12 noon", "9 PM". */
export function hourName(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '12 midnight';
  if (h === 12) return '12 noon';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export const store = new Store();
