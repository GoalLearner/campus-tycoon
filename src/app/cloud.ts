import {
  API,
  BASE_REVISION_HEADER,
  CAMPUS_META_HEADER,
  CAMPUS_RECORD_HEADER,
  type CampusList,
  type CampusMeta,
  type CampusRecord,
  type ConflictReply,
  type DeleteReply,
  type SignInReply,
  type UploadReply,
} from '../../server/src/api';

/**
 * Cloud saves (DESIGN.md 42.9 and 48). The whole save goes up after it is
 * written, when the player has signed in and the phone is online: never a
 * merge. Each upload says which revision it was made from. When another phone
 * has saved since, nothing is overwritten: the player is asked which campus
 * to keep, with each one's level, rank and time. Catch-up stays on the phone,
 * from the save's own clock, as before. Offline, the game plays as before and
 * uploads when it can.
 *
 * Switched off in every build: only the dev server and the tests have it, and
 * only once they are given a server's address.
 */

/** The switch. Off in every build of the game; on for the dev server and the tests. */
export const CLOUD_SAVES_FLAG: boolean = import.meta.env.DEV;

/** The server's address, when cloud saves are on: `&cloud=<address>` on the dev page, or VITE_CLOUD_URL. */
export function cloudAddress(search: string): string | null {
  if (!CLOUD_SAVES_FLAG) return null;
  const fromQuery = new URLSearchParams(search).get('cloud');
  const fromEnv = (import.meta.env.VITE_CLOUD_URL as string | undefined) ?? null;
  const address = fromQuery ?? fromEnv;
  return address !== null && /^https?:\/\/[^\s]+$/.test(address) ? address.replace(/\/+$/, '') : null;
}

// ------------------------------------------------------------- the wire --

export async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** A request the server answered with an error, or that never reached it. */
export class CloudError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** What Apple gives the phone when the player signs in. */
export interface AppleCredential {
  identityToken: string;
  authorizationCode?: string;
  nonce?: string;
}

/** The server's routes, as the app calls them. */
export class CloudApi {
  constructor(
    private readonly base: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async call(path: string, init: RequestInit, token?: string): Promise<Response> {
    const headers = new Headers(init.headers);
    if (token) headers.set('authorization', `Bearer ${token}`);
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}${API}${path}`, { ...init, headers });
    } catch {
      throw new CloudError(0, 'offline');
    }
    if (response.ok || response.status === 409) return response;
    let message = String(response.status);
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // Not JSON.
    }
    throw new CloudError(response.status, message);
  }

  async signIn(credential: AppleCredential): Promise<SignInReply> {
    const response = await this.call('/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credential) });
    return (await response.json()) as SignInReply;
  }

  async signOut(token: string): Promise<void> {
    await this.call('/sign-out', { method: 'POST' }, token);
  }

  async campuses(token: string): Promise<CampusList> {
    return (await (await this.call('/campuses', { method: 'GET' }, token)).json()) as CampusList;
  }

  async upload(token: string, campus: string, base: number, meta: CampusMeta, bytes: Uint8Array<ArrayBuffer>): Promise<{ ok: true; campus: CampusRecord } | { ok: false; conflict: CampusRecord }> {
    const response = await this.call(
      `/campuses/${encodeURIComponent(campus)}`,
      { method: 'PUT', headers: { 'content-type': 'application/gzip', [BASE_REVISION_HEADER]: String(base), [CAMPUS_META_HEADER]: JSON.stringify(meta) }, body: bytes },
      token,
    );
    if (response.status === 409) return { ok: false, conflict: ((await response.json()) as ConflictReply).conflict };
    return { ok: true, campus: ((await response.json()) as UploadReply).campus };
  }

  async download(token: string, campus: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; record: CampusRecord }> {
    const response = await this.call(`/campuses/${encodeURIComponent(campus)}`, { method: 'GET' }, token);
    const record = JSON.parse(response.headers.get(CAMPUS_RECORD_HEADER) ?? 'null') as CampusRecord | null;
    if (!record) throw new CloudError(502, 'no record');
    return { bytes: new Uint8Array(await response.arrayBuffer()), record };
  }

  async deleteAccount(token: string): Promise<DeleteReply> {
    return (await (await this.call('/account', { method: 'DELETE' }, token)).json()) as DeleteReply;
  }
}

// ------------------------------------------------------------- the sync --

/** Signing in, behind a small interface: Apple's on the phone (for the owner to switch on), a fake in tests. */
export interface SignInProvider {
  /** The credential, or null when the player closed the sheet. */
  signIn(): Promise<AppleCredential | null>;
}

/** Where the sync keeps what it remembers: the session and which campus this phone's save is. */
export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** The phone's own storage. Nothing here is in the save. */
export const localKeyValue: KeyValue = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private browsing: the sync forgets on reload.
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // As above.
    }
  },
};

const KEY = 'campus-tycoon.cloud';

interface Remembered {
  token: string;
  accountId: string;
  /** Which campus on the server this phone's save is. null until its first upload. */
  campusId: string | null;
  /** The revision this phone last uploaded or downloaded. */
  revision: number;
  /** The phone's own time of the last upload or download that landed. */
  lastSyncedAt: number | null;
}

export type SyncStatus = 'signedOut' | 'synced' | 'waiting' | 'syncing' | 'offline' | 'conflict' | 'failed';

/** Two campuses, and the player picks one. */
export interface Conflict {
  /** This phone's: its meta, and the phone's time it was last played. */
  here: CampusMeta;
  /** The one another phone uploaded. */
  there: CampusRecord;
}

/** The save as it is now: the text is only made when an upload needs it. */
export interface Snapshot {
  text: () => string;
  meta: CampusMeta;
}

export interface SyncOptions {
  api: CloudApi;
  signIn: SignInProvider;
  storage: KeyValue;
  online: () => boolean;
  now: () => number;
  /** While the game is open, at most one upload this often. Putting the app away always uploads. */
  uploadEveryMs?: number;
  /** A new campus's ID. */
  newId?: () => string;
}

/** Ten minutes: a campus open all day makes about a hundred uploads, well inside the free plan. */
export const UPLOAD_EVERY_MS = 10 * 60_000;

export class CloudSync {
  status: SyncStatus = 'signedOut';
  conflict: Conflict | null = null;
  /** The last upload's size, for the measurements. */
  lastBytes = 0;
  private remembered: Remembered | null;
  private lastUploadAt = 0;
  private dirty = false;
  private busy: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private readonly every: number;
  private readonly newId: () => string;

  constructor(private readonly options: SyncOptions) {
    this.every = options.uploadEveryMs ?? UPLOAD_EVERY_MS;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.remembered = this.read();
    if (this.remembered) this.status = 'synced';
  }

  get signedIn(): boolean {
    return this.remembered !== null;
  }

  get lastSyncedAt(): number | null {
    return this.remembered?.lastSyncedAt ?? null;
  }

  get campusId(): string | null {
    return this.remembered?.campusId ?? null;
  }

  get revision(): number {
    return this.remembered?.revision ?? 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private read(): Remembered | null {
    try {
      const value = JSON.parse(this.options.storage.get(KEY) ?? 'null') as Remembered | null;
      return value && typeof value.token === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    if (this.remembered) this.options.storage.set(KEY, JSON.stringify(this.remembered));
    else this.options.storage.remove(KEY);
  }

  /** One thing at a time: an upload never runs beside another, or beside a download. */
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.busy.then(work, work);
    this.busy = next.catch(() => undefined);
    return next;
  }

  private set(status: SyncStatus): void {
    this.status = status;
    this.emit();
  }

  /** Sign in with Apple. Then this phone's campus is checked against the account's. */
  async signIn(snapshot: Snapshot | null): Promise<'ok' | 'cancelled' | 'failed'> {
    const credential = await this.options.signIn.signIn();
    if (!credential) return 'cancelled';
    try {
      const reply = await this.options.api.signIn(credential);
      this.remembered = { token: reply.token, accountId: reply.accountId, campusId: null, revision: 0, lastSyncedAt: null };
      this.write();
      this.set('synced');
    } catch {
      this.set('failed');
      return 'failed';
    }
    if (snapshot) await this.check(snapshot);
    return 'ok';
  }

  /** Sign this phone out. Its campus stays on the phone, and on the account. */
  async signOut(): Promise<void> {
    const token = this.remembered?.token;
    this.remembered = null;
    this.conflict = null;
    this.write();
    this.set('signedOut');
    if (token) await this.options.api.signOut(token).catch(() => undefined);
  }

  /**
   * On opening, and on signing in: has another phone saved this campus since? Then the player chooses. Is it new
   * to the account? Then it goes up now.
   */
  async check(snapshot: Snapshot): Promise<void> {
    const mine = this.remembered;
    if (!mine) return;
    if (!this.options.online()) {
      this.set('offline');
      return;
    }
    await this.queue(async () => {
      try {
        const list = await this.options.api.campuses(mine.token);
        const there = mine.campusId === null ? undefined : list.campuses.find((one) => one.id === mine.campusId);
        if (there && there.revision > mine.revision) {
          this.conflict = { here: snapshot.meta, there };
          this.set('conflict');
          return;
        }
        if (!there || this.dirty) await this.send(snapshot, mine.revision);
        else this.set('synced');
      } catch (error) {
        this.failed(error);
      }
    });
  }

  /**
   * After the game was saved on the phone. Uploads when signed in and online: at once when the app is being put
   * away, otherwise at most once every ten minutes. A conflict waits for the player's choice.
   */
  afterSave(snapshot: Snapshot, puttingAway: boolean): Promise<void> {
    if (!this.remembered || this.conflict) return Promise.resolve();
    this.dirty = true;
    if (!this.options.online()) {
      if (this.status !== 'offline') this.set('offline');
      return Promise.resolve();
    }
    if (!puttingAway && this.options.now() - this.lastUploadAt < this.every) {
      if (this.status !== 'waiting') this.set('waiting');
      return Promise.resolve();
    }
    return this.queue(() => this.send(snapshot, this.revision));
  }

  /** Upload now, whatever the time since the last: the Account page's button. */
  syncNow(snapshot: Snapshot): Promise<void> {
    if (!this.remembered || this.conflict) return Promise.resolve();
    return this.queue(() => this.send(snapshot, this.revision));
  }

  private async send(snapshot: Snapshot, base: number): Promise<void> {
    const mine = this.remembered;
    if (!mine) return;
    if (!this.options.online()) {
      this.set('offline');
      return;
    }
    this.set('syncing');
    this.lastUploadAt = this.options.now();
    try {
      const bytes = await gzip(snapshot.text());
      this.lastBytes = bytes.length;
      const campusId = mine.campusId ?? this.newId();
      const result = await this.options.api.upload(mine.token, campusId, base, snapshot.meta, bytes);
      if (!result.ok) {
        this.conflict = { here: snapshot.meta, there: result.conflict };
        if (mine.campusId === null) mine.campusId = campusId;
        this.write();
        this.set('conflict');
        return;
      }
      this.dirty = false;
      mine.campusId = result.campus.id;
      mine.revision = result.campus.revision;
      mine.lastSyncedAt = this.options.now();
      this.write();
      this.set('synced');
    } catch (error) {
      this.failed(error);
    }
  }

  private failed(error: unknown): void {
    if (error instanceof CloudError && error.status === 401) {
      // The session is gone: the account was deleted elsewhere, or the session ran out. Sign in again.
      this.remembered = null;
      this.write();
      this.set('signedOut');
      return;
    }
    this.set(error instanceof CloudError && error.status === 0 ? 'offline' : 'failed');
  }

  /** Keep this phone's campus: it goes up over the other one. */
  keepHere(snapshot: Snapshot): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) return Promise.resolve();
    this.conflict = null;
    return this.queue(() => this.send(snapshot, conflict.there.revision));
  }

  /** Keep the other phone's campus: returns its save, for the phone to load in place of its own. */
  async keepThere(): Promise<string | null> {
    const conflict = this.conflict;
    if (!conflict) return null;
    const text = await this.fetchCampus(conflict.there.id);
    if (text !== null) this.conflict = null;
    this.emit();
    return text;
  }

  /** The account's campuses, newest first. */
  async campuses(): Promise<CampusRecord[]> {
    const mine = this.remembered;
    if (!mine) return [];
    try {
      return (await this.options.api.campuses(mine.token)).campuses;
    } catch (error) {
      this.failed(error);
      return [];
    }
  }

  /** Play another of the account's campuses on this phone: returns its save, for the phone to load. */
  choose(campusId: string): Promise<string | null> {
    return this.fetchCampus(campusId);
  }

  private fetchCampus(campusId: string): Promise<string | null> {
    return this.queue(async () => {
      const mine = this.remembered;
      if (!mine) return null;
      try {
        this.set('syncing');
        const { bytes, record } = await this.options.api.download(mine.token, campusId);
        const text = await gunzip(bytes);
        mine.campusId = record.id;
        mine.revision = record.revision;
        mine.lastSyncedAt = this.options.now();
        this.dirty = false;
        this.lastUploadAt = this.options.now();
        this.write();
        this.set('synced');
        return text;
      } catch (error) {
        this.failed(error);
        return null;
      }
    });
  }

  /** The phone began another campus (a new game, or a save file): it is a campus of its own on the account. */
  newCampus(): void {
    if (!this.remembered) return;
    this.remembered.campusId = null;
    this.remembered.revision = 0;
    this.conflict = null;
    this.dirty = true;
    this.lastUploadAt = 0;
    this.write();
    this.emit();
  }

  /** Delete the account and every campus in it. This phone's campus stays on the phone. */
  async deleteAccount(): Promise<DeleteReply | null> {
    const mine = this.remembered;
    if (!mine) return null;
    try {
      const reply = await this.queue(() => this.options.api.deleteAccount(mine.token));
      this.remembered = null;
      this.conflict = null;
      this.write();
      this.set('signedOut');
      return reply;
    } catch (error) {
      this.failed(error);
      return null;
    }
  }
}
