import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASE_REVISION_HEADER, CAMPUS_META_HEADER, CAMPUS_RECORD_HEADER, MAX_SAVE_BYTES, type CampusList, type CampusMeta, type CampusRecord, type DeleteReply, type SignInReply } from '../../server/src/api';
import { startServer, type Server } from './harness';

/**
 * The cloud server (DESIGN.md 48), every route, on Miniflare with test keys
 * standing in for Apple's. Nothing here reaches Cloudflare or Apple.
 */

const DAY = 24 * 60 * 60_000;
const meta = (more: Partial<CampusMeta> = {}): CampusMeta => ({ name: 'Larp University', level: 7, rank: 120, tick: 5000, simulatedAt: Date.now(), ...more });
const save = (text = JSON.stringify({ v: 22, savedAt: 1, state: { pad: 'x'.repeat(4000) } })): Uint8Array<ArrayBuffer> => Uint8Array.from(gzipSync(text));

async function signIn(server: Server, sub: string, more: Record<string, unknown> = {}): Promise<Response> {
  return server.fetch(`${server.base}/v1/sign-in`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identityToken: await server.apple.token(sub), ...more }) });
}

async function session(server: Server, sub: string): Promise<string> {
  const reply = (await (await signIn(server, sub)).json()) as SignInReply;
  return reply.token;
}

function put(server: Server, token: string, campus: string, base: number, body: Uint8Array<ArrayBuffer> = save(), about: CampusMeta | string = meta()): Promise<Response> {
  return server.fetch(`${server.base}/v1/campuses/${campus}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/gzip', [BASE_REVISION_HEADER]: String(base), [CAMPUS_META_HEADER]: typeof about === 'string' ? about : JSON.stringify(about) },
    body,
  });
}

const get = (server: Server, token: string, path: string): Promise<Response> => server.fetch(`${server.base}/v1${path}`, { headers: { authorization: `Bearer ${token}` } });

describe('the cloud server, with the Sign in with Apple key', () => {
  let server: Server;
  beforeAll(async () => {
    server = await startServer({ withKey: true });
  }, 60_000);
  afterAll(async () => {
    await server.dispose();
  });

  it('signs in with a token Apple signed, keeps only Apple’s user ID and a hash of the session, and knows the same player again', async () => {
    const first = await signIn(server, 'apple-sub-1', { authorizationCode: 'code-1' });
    expect(first.status).toBe(200);
    const one = (await first.json()) as SignInReply;
    expect(one.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(one.revocable).toBe(true);
    // The one-time code was traded for a refresh token with a client secret signed by the app key.
    expect(server.apple.calls.find((call) => call.path === '/auth/token')?.form).toMatchObject({ code: 'code-1', grant_type: 'authorization_code', client_id: 'com.goallearner.campustycoon' });
    const again = (await (await signIn(server, 'apple-sub-1')).json()) as SignInReply;
    expect(again.accountId).toBe(one.accountId);
    expect(again.token).not.toBe(one.token);
    const accounts = await server.rows('accounts');
    const mine = accounts.find((row) => row.id === one.accountId)!;
    expect(Object.keys(mine).sort()).toEqual(['apple_refresh', 'apple_sub', 'created_at', 'id']);
    expect(mine.apple_refresh).toBe('refresh-code-1');
    const sessions = await server.rows('sessions');
    expect(sessions.some((row) => row.token_hash === one.token)).toBe(false);
    expect(sessions.filter((row) => row.account_id === one.accountId)).toHaveLength(2);
  });

  it('turns away every token that fails, and every route without a session', async () => {
    const apple = server.apple;
    const now = Math.floor(Date.now() / 1000);
    const bad: Array<[string, string, string]> = [
      ['signed by someone else', await apple.token('x', {}, { signer: await apple.strangerKey() }), 'signature'],
      ['for another app', await apple.token('x', { aud: 'com.example.other' }), 'audience'],
      ['not from Apple', await apple.token('x', { iss: 'https://example.com' }), 'issuer'],
      ['expired', await apple.token('x', { exp: now - 3600 }), 'expired'],
      ['issued in the future', await apple.token('x', { iat: now + 3600 }), 'issued in the future'],
      ['a key Apple never published', await apple.token('x', {}, { kid: 'no-such-key' }), 'unknown key'],
      ['no subject', await apple.token('', {}), 'no subject'],
      ['not a token', 'abc.def', 'not a token'],
    ];
    for (const [why, identityToken, reason] of bad) {
      const response = await server.fetch(`${server.base}/v1/sign-in`, { method: 'POST', body: JSON.stringify({ identityToken }) });
      expect(response.status, why).toBe(401);
      expect(((await response.json()) as { error: string }).error, why).toBe(`token: ${reason}`);
    }
    // A nonce the phone asked for must be the one in the token.
    const nonced = await apple.token('x', { nonce: 'n-1' });
    expect((await server.fetch(`${server.base}/v1/sign-in`, { method: 'POST', body: JSON.stringify({ identityToken: nonced, nonce: 'n-2' }) })).status).toBe(401);
    expect((await server.fetch(`${server.base}/v1/sign-in`, { method: 'POST', body: JSON.stringify({ identityToken: nonced, nonce: 'n-1' }) })).status).toBe(200);
    expect((await server.fetch(`${server.base}/v1/sign-in`, { method: 'POST', body: '{}' })).status).toBe(400);
    for (const [method, path] of [
      ['GET', '/campuses'],
      ['GET', '/campuses/campus-0001'],
      ['PUT', '/campuses/campus-0001'],
      ['DELETE', '/account'],
    ] as const) {
      expect((await server.fetch(`${server.base}/v1${path}`, { method })).status, `${method} ${path}`).toBe(401);
      expect((await server.fetch(`${server.base}/v1${path}`, { method, headers: { authorization: 'Bearer not-a-real-session-token-at-all' } })).status).toBe(401);
    }
  });

  it('uploads a save, lists it, and gives back the same bytes, stamped with the server’s own time', async () => {
    const token = await session(server, 'apple-sub-2');
    const body = save();
    const before = Date.now();
    const response = await put(server, token, 'campus-aaaa-0001', 0, body, meta({ simulatedAt: before - 3 * DAY }));
    expect(response.status).toBe(200);
    const { campus } = (await response.json()) as { campus: CampusRecord };
    expect(campus).toMatchObject({ id: 'campus-aaaa-0001', revision: 1, bytes: body.length, name: 'Larp University', level: 7, rank: 120, clockAhead: false });
    expect(campus.uploadedAt).toBeGreaterThanOrEqual(before);
    expect(campus.uploadedAt).toBeLessThanOrEqual(Date.now());
    const listed = (await (await get(server, token, '/campuses')).json()) as CampusList;
    expect(listed.campuses.map((one) => one.id)).toEqual(['campus-aaaa-0001']);
    const download = await get(server, token, '/campuses/campus-aaaa-0001');
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(body);
    expect(JSON.parse(download.headers.get(CAMPUS_RECORD_HEADER)!)).toMatchObject({ revision: 1 });
    expect((await get(server, token, '/campuses/campus-none-0001')).status).toBe(404);
  });

  it('tells a phone that has not seen the latest, changes nothing, and keeps only the latest save', async () => {
    const token = await session(server, 'apple-sub-3');
    expect((await put(server, token, 'campus-bbbb-0001', 0)).status).toBe(200);
    // Phone A uploads again from revision 1. Phone B, which also had revision 1, comes second.
    expect((await put(server, token, 'campus-bbbb-0001', 1, save('{"a":1}'.padEnd(200, ' ')), meta({ level: 8 }))).status).toBe(200);
    const late = await put(server, token, 'campus-bbbb-0001', 1, save('{"b":1}'.padEnd(200, ' ')), meta({ level: 3 }));
    expect(late.status).toBe(409);
    const { conflict } = (await late.json()) as { conflict: CampusRecord };
    expect(conflict).toMatchObject({ revision: 2, level: 8 });
    // A phone that never uploaded this campus is told too.
    expect((await put(server, token, 'campus-bbbb-0001', 0)).status).toBe(409);
    // B chose to keep its own: it uploads from the revision it was shown.
    const kept = await put(server, token, 'campus-bbbb-0001', conflict.revision, save('{"b":1}'.padEnd(200, ' ')), meta({ level: 3 }));
    expect(((await kept.json()) as { campus: CampusRecord }).campus).toMatchObject({ revision: 3, level: 3 });
    const objects = (await server.objects()).filter((key) => key.includes('campus-bbbb-0001'));
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatch(/\/3\.json\.gz$/);
  });

  it('keeps each account to its own campuses', async () => {
    const owner = await session(server, 'apple-sub-4');
    const stranger = await session(server, 'apple-sub-5');
    expect((await put(server, owner, 'campus-cccc-0001', 0)).status).toBe(200);
    expect((await get(server, stranger, '/campuses/campus-cccc-0001')).status).toBe(404);
    expect(((await (await get(server, stranger, '/campuses')).json()) as CampusList).campuses).toEqual([]);
    // The stranger's upload of the same campus name is a campus of their own.
    expect((await put(server, stranger, 'campus-cccc-0001', 0)).status).toBe(200);
    expect(((await (await get(server, owner, '/campuses')).json()) as CampusList).campuses[0]!.revision).toBe(1);
  });

  it('refuses what is not a save', async () => {
    const token = await session(server, 'apple-sub-6');
    expect((await put(server, token, 'campus-dddd-0001', 0, new TextEncoder().encode('{"plain":"json"}'.padEnd(64, ' ')))).status).toBe(400);
    const huge = new Uint8Array(MAX_SAVE_BYTES + 1);
    huge[0] = 0x1f;
    huge[1] = 0x8b;
    expect((await put(server, token, 'campus-dddd-0001', 0, huge)).status).toBe(413);
    expect((await put(server, token, 'bad id!', 0)).status).toBe(400);
    expect((await put(server, token, 'campus-dddd-0001', 0, save(), '{"name":""}')).status).toBe(400);
    expect((await put(server, token, 'campus-dddd-0001', 0, save(), meta({ level: -1 }))).status).toBe(400);
    expect((await put(server, token, 'campus-dddd-0001', -1)).status).toBe(400);
    expect(((await (await get(server, token, '/campuses')).json()) as CampusList).campuses).toEqual([]);
  });

  it('marks a campus whose clock runs ahead, and still keeps it', async () => {
    const token = await session(server, 'apple-sub-7');
    const ahead = await put(server, token, 'campus-eeee-0001', 0, save(), meta({ simulatedAt: Date.now() + DAY }));
    expect(ahead.status).toBe(200);
    expect(((await ahead.json()) as { campus: CampusRecord }).campus.clockAhead).toBe(true);
    // A day of game a minute after the last upload: further than real time allows.
    const honest = await put(server, token, 'campus-eeee-0002', 0, save(), meta({ simulatedAt: Date.now() - DAY }));
    expect(((await honest.json()) as { campus: CampusRecord }).campus.clockAhead).toBe(false);
    const jumped = await put(server, token, 'campus-eeee-0002', 1, save(), meta({ simulatedAt: Date.now() }));
    expect(jumped.status).toBe(200);
    expect(((await jumped.json()) as { campus: CampusRecord }).campus.clockAhead).toBe(true);
  });

  it('deletes the account and everything in it, and revokes the Apple sign-in', async () => {
    const reply = (await (await signIn(server, 'apple-sub-8', { authorizationCode: 'code-8' })).json()) as SignInReply;
    for (const campus of ['campus-ffff-0001', 'campus-ffff-0002']) expect((await put(server, reply.token, campus, 0)).status).toBe(200);
    const other = await session(server, 'apple-sub-9');
    expect((await put(server, other, 'campus-gggg-0001', 0)).status).toBe(200);
    const response = await server.fetch(`${server.base}/v1/account`, { method: 'DELETE', headers: { authorization: `Bearer ${reply.token}` } });
    expect(response.status).toBe(200);
    expect(((await response.json()) as DeleteReply).apple).toBe('revoked');
    expect(server.apple.calls.find((call) => call.path === '/auth/revoke')?.form).toMatchObject({ token: 'refresh-code-8', token_type_hint: 'refresh_token' });
    expect((await server.objects()).some((key) => key.includes(reply.accountId))).toBe(false);
    for (const table of ['accounts', 'sessions', 'campuses'] as const) {
      expect((await server.rows(table)).some((row) => row.account_id === reply.accountId || row.id === reply.accountId)).toBe(false);
    }
    expect((await get(server, reply.token, '/campuses')).status).toBe(401);
    // Someone else's campus is untouched.
    expect((await get(server, other, '/campuses/campus-gggg-0001')).status).toBe(200);
    // Signing in again is a new account, with nothing in it.
    const fresh = (await (await signIn(server, 'apple-sub-8')).json()) as SignInReply;
    expect(fresh.accountId).not.toBe(reply.accountId);
  });

  it('deletes an account when Apple says the player stopped using Sign in with Apple', async () => {
    const token = await session(server, 'apple-sub-10');
    expect((await put(server, token, 'campus-hhhh-0001', 0)).status).toBe(200);
    const payload = await server.apple.token('apple-server', { events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub-10', event_time: Date.now() }) });
    const forged = await server.apple.token('apple-server', { events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub-9' }) }, { signer: await server.apple.strangerKey() });
    expect((await server.fetch(`${server.base}/v1/apple/notices`, { method: 'POST', body: JSON.stringify({ payload: forged }) })).status).toBe(401);
    expect((await server.fetch(`${server.base}/v1/apple/notices`, { method: 'POST', body: JSON.stringify({ payload }) })).status).toBe(200);
    expect((await get(server, token, '/campuses')).status).toBe(401);
    expect((await server.objects()).some((key) => key.includes('campus-hhhh-0001'))).toBe(false);
  });

  it('signs a phone out', async () => {
    const token = await session(server, 'apple-sub-11');
    expect((await server.fetch(`${server.base}/v1/sign-out`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })).status).toBe(204);
    expect((await get(server, token, '/campuses')).status).toBe(401);
  });

  it('answers the app’s cross-origin requests', async () => {
    const response = await server.fetch(`${server.base}/v1/campuses/campus-0001`, { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain(CAMPUS_META_HEADER);
    expect(response.headers.get('access-control-expose-headers')).toContain(CAMPUS_RECORD_HEADER);
  });
});

describe('the cloud server, without the key', () => {
  let server: Server;
  beforeAll(async () => {
    server = await startServer({ withKey: false });
  }, 60_000);
  afterAll(async () => {
    await server.dispose();
  });

  it('signs in and keeps saves, and says there is nothing of Apple’s to revoke on deletion', async () => {
    const reply = (await (await signIn(server, 'apple-sub-1', { authorizationCode: 'code-1' })).json()) as SignInReply;
    expect(reply.revocable).toBe(false);
    expect(server.apple.calls).toEqual([]);
    expect((await put(server, reply.token, 'campus-aaaa-0001', 0)).status).toBe(200);
    const deleted = (await (await server.fetch(`${server.base}/v1/account`, { method: 'DELETE', headers: { authorization: `Bearer ${reply.token}` } })).json()) as DeleteReply;
    expect(deleted.apple).toBe('nothing to revoke');
    expect(await server.objects()).toEqual([]);
  });
});
