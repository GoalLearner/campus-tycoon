import { upgradeNotes } from './upgradeNotes';
import {
  advance,
  applyAction,
  campusHappiness,
  enrollment,
  groundsLine,
  newGame,
  parseSave,
  serialize,
  type Action,
  type ActionResult,
  type GameState,
  type LogEntry,
} from '../sim';
import { mergeAway, readSavedApp, type AwayReport, type SavedApp } from './away';
import { clock } from './clock';
import { sound } from './sound';
import { clearSaves, readSaves, requestPersistentStorage, writeSave } from './persistence';

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

export class Store {
  private current: GameState | null = null;
  private listeners = new Set<Listener>();
  private logListeners = new Set<LogListener>();
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
  /** True when a save was found but could not be read, and the backup was used or nothing was. */
  loadProblem: string | null = null;

  get state(): GameState {
    if (!this.current) throw new Error('No game is loaded.');
    return this.current;
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

  /** Load the saved game, falling back to the backup. Returns whether a game was loaded. */
  async load(): Promise<boolean> {
    if (this.current) return true;
    const stored = await readSaves();
    for (const [label, text] of [
      ['save', stored.save],
      ['backup', stored.backup],
    ] as const) {
      if (!text) continue;
      const result = parseSave(text);
      if (result.ok) {
        this.current = result.state;
        if (result.migratedFrom !== null) this.upgradeNotes = upgradeNotes(result.migratedFrom);
        const kept = readSavedApp(result.app);
        this.away = kept.away;
        this.lastExportAt = kept.lastExportAt;
        clock.follow(result.state.clock.lastSimulatedAt);
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

  /** Show a game that was built elsewhere, such as the dev demo. */
  adopt(state: GameState, options: { ephemeral: boolean }): void {
    this.current = state;
    this.ephemeral = options.ephemeral;
    this.away = null;
    this.recent = [];
    this.emit();
  }

  startNewGame(name: string): void {
    clock.reset();
    this.ephemeral = false;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    this.current = newGame({ seed, name, now: clock.now() });
    this.away = null;
    this.lastExportAt = null;
    this.recent = [];
    this.loadProblem = null;
    void requestPersistentStorage();
    this.saveNow();
    this.emit();
  }

  /** Replace the game with one read from a save file. Returns an error message, or null on success. */
  importSave(text: string): string | null {
    const result = parseSave(text);
    if (!result.ok) return result.reason;
    this.current = result.state;
    this.upgradeNotes = result.migratedFrom !== null ? upgradeNotes(result.migratedFrom) : [];
    clock.follow(result.state.clock.lastSimulatedAt);
    this.away = null;
    // The file that was just loaded is itself a backup, as old as the day it was made.
    this.lastExportAt = result.savedAt > 0 ? result.savedAt : null;
    this.recent = [];
    this.catchUp();
    this.saveNow();
    this.emit();
    return null;
  }

  async deleteGame(): Promise<void> {
    this.current = null;
    this.away = null;
    this.lastExportAt = null;
    this.recent = [];
    await clearSaves();
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

  saveNow(): void {
    void this.flush();
  }

  /** Write the save and wait for it to land. Used before the page reloads for an update. */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.current || this.ephemeral) return;
    this.lastSavedTick = this.current.clock.tick;
    try {
      await writeSave(serialize(this.current, clock.now(), this.appData()));
    } catch {
      // Storage can fail in private browsing. The game keeps running in memory.
    }
  }

  /** Start the once-a-second heartbeat and save whenever the app is put away. */
  start(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => this.catchUp(), 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow();
      else this.catchUp();
    });
    window.addEventListener('pagehide', () => this.saveNow());
  }
}

export const store = new Store();
