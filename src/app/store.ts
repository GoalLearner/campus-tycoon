import {
  advance,
  applyAction,
  enrollment,
  newGame,
  parseSave,
  serialize,
  type Action,
  type ActionResult,
  type GameState,
  type LogEntry,
} from '../sim';
import { clock } from './clock';
import { clearSaves, readSaves, requestPersistentStorage, writeSave } from './persistence';

/**
 * Holds the one game state and is the only thing that changes it.
 * The UI and the map read the state from here and send actions back.
 * Every action first advances the sim to now, then applies, then saves.
 */

/** Away for at least this long and the player gets the "while you were away" list. */
const AWAY_MINUTES = 10;

export interface AwayReport {
  minutes: number;
  weeksSkipped: number;
  log: LogEntry[];
  cashBefore: number;
  cashAfter: number;
  studentsBefore: number;
  studentsAfter: number;
}

type Listener = () => void;

export class Store {
  private current: GameState | null = null;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSavedTick = -1;
  /** When true the game is never written to storage. Used by the dev demo. */
  private ephemeral = false;

  /** Set when the player returns after a while. The UI shows it once and clears it. */
  away: AwayReport | null = null;
  /** Things that happened while the app was open, newest last. The UI drains it. */
  recent: LogEntry[] = [];
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
        if (label === 'backup') this.loadProblem = 'Your latest save could not be read, so an earlier one was loaded.';
        this.catchUp();
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
    this.away = null;
    this.recent = [];
    this.catchUp();
    this.saveNow();
    this.emit();
    return null;
  }

  async deleteGame(): Promise<void> {
    this.current = null;
    this.away = null;
    this.recent = [];
    await clearSaves();
    this.emit();
  }

  exportText(): string {
    return serialize(this.state, clock.now());
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
      if (longAbsence) {
        this.away = {
          minutes: result.info.ticks + result.info.weeksSkipped * 7 * 24 * 60,
          weeksSkipped: result.info.weeksSkipped,
          log: result.log,
          cashBefore: before.money.cash,
          cashAfter: result.state.money.cash,
          studentsBefore: enrollment(before),
          studentsAfter: enrollment(result.state),
        };
      } else {
        this.recent.push(...result.log);
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
    }
    return result;
  }

  private scheduleSave(delayMs: number): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), delayMs);
  }

  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.current || this.ephemeral) return;
    this.lastSavedTick = this.current.clock.tick;
    void writeSave(serialize(this.current, clock.now())).catch(() => {
      // Storage can fail in private browsing. The game keeps running in memory.
    });
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
