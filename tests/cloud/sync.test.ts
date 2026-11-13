import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLOUD_SAVES_FLAG, CloudApi, CloudSync, cloudAddress, gunzip, gzip, type KeyValue, type Snapshot } from '../../src/app/cloud';
import { metaOf } from '../../src/app/cloudWire';
import { advance, newGame, parseSave, serialize, type GameState } from '../../src/sim';
import { startServer, type Server } from './harness';
import { DAY, T0 } from '../helpers';

/**
 * The app's side of cloud saves (DESIGN.md 48): two phones on one account,
 * against the real server on Miniflare. Nothing reaches Cloudflare or Apple.
 */

const memory = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (key) => map.get(key) ?? null, set: (key, value) => void map.set(key, value), remove: (key) => void map.delete(key) };
};

const MODEL: GameState = advance(newGame({ seed: 35, name: 'Larp University', now: T0, campus: 'model' }), T0, T0 + 1.5 * DAY).state;

function snapshotOf(state: GameState, at: number): Snapshot {
  return { text: () => serialize(state, at), meta: metaOf(state) };
}

/** The same campus a little later, as another phone might have it. */
const later = (state: GameState, minutes: number): GameState => advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + minutes * 60_000).state;

interface Phone {
  sync: CloudSync;
  online: boolean;
  now: number;
}

describe('cloud saves on the phone', () => {
  let server: Server;
  const phone = (sub = 'player-1'): Phone => {
    const one: Phone = { sync: null as unknown as CloudSync, online: true, now: Date.now() };
    one.sync = new CloudSync({
      api: new CloudApi(server.base, server.fetch),
      signIn: { signIn: async () => ({ identityToken: await server.apple.token(sub) }) },
      storage: memory(),
      online: () => one.online,
      now: () => one.now,
    });
    return one;
  };

  beforeAll(async () => {
    server = await startServer({ withKey: false });
  }, 60_000);
  afterAll(async () => {
    await server.dispose();
  });

  it('is switched off in every build, and on the dev server needs a server’s address', () => {
    expect(CLOUD_SAVES_FLAG).toBe(import.meta.env.DEV);
    expect(cloudAddress('')).toBeNull();
    expect(cloudAddress('?cloud=not-an-address')).toBeNull();
    expect(cloudAddress('?cloud=https://cloud.example/')).toBe('https://cloud.example');
    // The game reaches the sync only through the dev server's own import: a build leaves it out.
    const main = readFileSync(join(__dirname, '..', '..', 'src', 'main.ts'), 'utf8');
    expect(main).toMatch(/if \(import\.meta\.env\.DEV\) \{\s*const \{ startCloud \} = await import\('\.\/app\/cloudWire'\);/);
    expect(main.split('cloudWire').length).toBe(2);
    for (const file of ['ui/ui.ts', 'app/store.ts']) {
      const text = readFileSync(join(__dirname, '..', '..', 'src', file), 'utf8');
      expect(text, file).not.toMatch(/^import .*(cloudWire|accountUi|\/cloud')/m);
    }
  });

  it('uploads after a save once signed in and online: never before, not while offline, and at once when the app is put away', async () => {
    const a = phone();
    await a.sync.afterSave(snapshotOf(MODEL, a.now), true);
    expect(await server.rows('campuses')).toEqual([]);
    expect(await a.sync.signIn(snapshotOf(MODEL, a.now))).toBe('ok');
    expect(a.sync.status).toBe('synced');
    expect(a.sync.revision).toBe(1);
    a.online = false;
    await a.sync.afterSave(snapshotOf(MODEL, a.now), true);
    expect(a.sync.status).toBe('offline');
    expect(a.sync.revision).toBe(1);
    a.online = true;
    // Back online: within ten minutes of the last upload, a save waits; putting the app away sends it.
    a.now += 60_000;
    await a.sync.afterSave(snapshotOf(MODEL, a.now), false);
    expect(a.sync.status).toBe('waiting');
    expect(a.sync.revision).toBe(1);
    await a.sync.afterSave(snapshotOf(MODEL, a.now), true);
    expect(a.sync.revision).toBe(2);
    a.now += 11 * 60_000;
    await a.sync.afterSave(snapshotOf(MODEL, a.now), false);
    expect(a.sync.revision).toBe(3);
    await a.sync.deleteAccount();
  });

  it('brings back the whole save, byte for byte, never a merge', async () => {
    const a = phone('player-2');
    const at = Date.now();
    await a.sync.signIn(snapshotOf(MODEL, at));
    const b = phone('player-2');
    await b.sync.signIn(null);
    const listed = await b.sync.campuses();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: 'Larp University', level: MODEL.daily.level, rank: MODEL.field.rank });
    const text = await b.sync.choose(listed[0]!.id);
    expect(text).toBe(serialize(MODEL, at));
    const parsed = parseSave(text!);
    expect(parsed.ok && serialize(parsed.state, at)).toBe(serialize(MODEL, at));
    expect(b.sync.campusId).toBe(a.sync.campusId);
    await a.sync.deleteAccount();
  });

  it('asks which campus to keep when another phone saved since, shows each one’s level, rank and time, and keeps the one chosen', async () => {
    const a = phone('player-3');
    const b = phone('player-3');
    await a.sync.signIn(snapshotOf(MODEL, a.now));
    await b.sync.signIn(null);
    const id = (await b.sync.campuses())[0]!.id;
    await b.sync.choose(id);
    // Phone A plays on and uploads. Phone B, still at the old revision, saves and is put away.
    const onA = later(MODEL, 90);
    await a.sync.afterSave(snapshotOf(onA, a.now), true);
    expect(a.sync.revision).toBe(2);
    const onB = later(MODEL, 30);
    await b.sync.afterSave(snapshotOf(onB, b.now), true);
    expect(b.sync.status).toBe('conflict');
    expect(b.sync.conflict!.here).toEqual(metaOf(onB));
    expect(b.sync.conflict!.there).toMatchObject({ revision: 2, tick: onA.clock.tick, level: onA.daily.level, rank: onA.field.rank });
    expect(b.sync.conflict!.there.uploadedAt).toBeGreaterThan(0);
    // Nothing went up while the player decides, and nothing was merged.
    await b.sync.afterSave(snapshotOf(onB, b.now), true);
    expect((await a.sync.campuses())[0]!.revision).toBe(2);
    // B keeps its own: it goes up over A's.
    await b.sync.keepHere(snapshotOf(onB, b.now));
    expect(b.sync.status).toBe('synced');
    expect(b.sync.revision).toBe(3);
    // A opens again, sees that B saved since, and chooses B's.
    await a.sync.check(snapshotOf(onA, a.now));
    expect(a.sync.status).toBe('conflict');
    const kept = await a.sync.keepThere();
    expect(kept).toBe(serialize(onB, b.now));
    expect(a.sync.conflict).toBeNull();
    expect(a.sync.revision).toBe(3);
    await a.sync.deleteAccount();
  });

  it('keeps a new game on the phone as a campus of its own', async () => {
    const a = phone('player-4');
    await a.sync.signIn(snapshotOf(MODEL, a.now));
    a.sync.newCampus();
    const other = newGame({ seed: 7, name: 'Second State', now: T0, campus: 'small' });
    await a.sync.afterSave(snapshotOf(other, a.now), false);
    const names = (await a.sync.campuses()).map((one) => one.name).sort();
    expect(names).toEqual(['Larp University', 'Second State']);
    await a.sync.deleteAccount();
  });

  it('deletes the account from one phone, and the other is signed out at its next upload; each keeps its campus', async () => {
    const a = phone('player-5');
    const b = phone('player-5');
    await a.sync.signIn(snapshotOf(MODEL, a.now));
    await b.sync.signIn(null);
    const reply = await a.sync.deleteAccount();
    expect(reply).toMatchObject({ deleted: true });
    expect(a.sync.signedIn).toBe(false);
    expect((await server.rows('campuses')).length).toBe(0);
    await b.sync.afterSave(snapshotOf(MODEL, b.now), true);
    expect(b.sync.status).toBe('signedOut');
  });

  it('measures: a model campus’s save, gzipped, and how long a sync takes here', async () => {
    const a = phone('player-6');
    await a.sync.signIn(null);
    const text = serialize(MODEL, Date.now());
    const zipped = await gzip(text);
    expect(await gunzip(zipped)).toBe(text);
    const uploads: number[] = [];
    for (let n = 0; n < 10; n++) {
      a.now += 11 * 60_000;
      const started = performance.now();
      await a.sync.afterSave(snapshotOf(MODEL, a.now), false);
      uploads.push(performance.now() - started);
    }
    expect(a.sync.revision).toBe(10);
    const downloads: number[] = [];
    for (let n = 0; n < 10; n++) {
      const started = performance.now();
      await a.sync.choose(a.sync.campusId!);
      downloads.push(performance.now() - started);
    }
    const median = (list: number[]): number => [...list].sort((x, y) => x - y)[Math.floor(list.length / 2)]!;
    console.log(`cloud: save ${text.length} bytes, gzipped ${zipped.length} bytes (${a.sync.lastBytes} sent); sync (serialize, gzip, upload) median ${median(uploads).toFixed(1)} ms, most ${Math.max(...uploads).toFixed(1)} ms; download median ${median(downloads).toFixed(1)} ms`);
    expect(zipped.length).toBeLessThan(100_000);
    expect(median(uploads)).toBeLessThan(2000);
    await a.sync.deleteAccount();
  });
});
