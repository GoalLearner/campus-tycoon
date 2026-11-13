import {
  API,
  BASE_REVISION_HEADER,
  CAMPUS_META_HEADER,
  CAMPUS_RECORD_HEADER,
  MAX_CAMPUSES,
  MAX_SAVE_BYTES,
  type CampusList,
  type CampusMeta,
  type CampusRecord,
  type ConflictReply,
  type DeleteReply,
  type SignInReply,
  type UploadReply,
} from './api';
import { audiencesOf, checkAppleToken, hasAppleKey, refreshTokenFor, revoke } from './apple';
import type { Env } from './bindings';
import { clockMark } from './clock';
import { randomToken, sha256Hex } from './jwt';

/**
 * The Campus Tycoon cloud server (DESIGN.md 48): a Cloudflare Worker with D1
 * for accounts and small records and R2 for the saves. It keeps whole saves
 * and never reads inside one: catch-up runs on the phone from the save's own
 * clock, and the server never simulates a game. It stamps every upload with
 * its own time.
 *
 *   POST   /v1/sign-in             an Apple identity token in, a session out
 *   POST   /v1/sign-out            ends this phone's session
 *   GET    /v1/campuses            the account's campuses
 *   PUT    /v1/campuses/:id        upload a gzipped save, from the revision it was made from
 *   GET    /v1/campuses/:id        download the latest
 *   DELETE /v1/account             the account and everything in it
 *   POST   /v1/apple/notices       Apple's notice that a player stopped using Sign in with Apple
 */

/** A session lasts a year from signing in. */
const SESSION_MS = 365 * 24 * 60 * 60_000;
const CAMPUS_ID = /^[A-Za-z0-9_-]{8,64}$/;

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': `authorization, content-type, ${BASE_REVISION_HEADER}, ${CAMPUS_META_HEADER}`,
  'access-control-expose-headers': CAMPUS_RECORD_HEADER,
  'access-control-max-age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

const fail = (status: number, error: string): Response => json({ error }, status);

interface CampusRow {
  campus_id: string;
  name: string;
  revision: number;
  uploaded_at: number;
  bytes: number;
  level: number;
  rank: number;
  tick: number;
  simulated_at: number;
  lead_ms: number;
  ahead_until: number;
}

function recordOf(row: CampusRow, now: number): CampusRecord {
  return {
    id: row.campus_id,
    name: row.name,
    revision: row.revision,
    uploadedAt: row.uploaded_at,
    bytes: row.bytes,
    level: row.level,
    rank: row.rank,
    tick: row.tick,
    simulatedAt: row.simulated_at,
    clockAhead: row.ahead_until > now,
  };
}

const objectKey = (account: string, campus: string, revision: number): string => `campuses/${account}/${campus}/${revision}.json.gz`;

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The account a request's session belongs to, or null. */
async function accountOf(request: Request, env: Env, now: number): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header);
  if (!match) return null;
  const row = await env.DB.prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ?').bind(await sha256Hex(match[1]!)).first<{ account_id: string; expires_at: number }>();
  return row !== null && row.expires_at > now ? row.account_id : null;
}

function metaOf(text: string | null): CampusMeta | null {
  if (text === null || text.length > 2000) return null;
  try {
    const meta = JSON.parse(text) as Record<string, unknown>;
    const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
    if (typeof meta.name !== 'string' || meta.name.length === 0 || meta.name.length > 80) return null;
    if (!whole(meta.level) || !whole(meta.rank) || !whole(meta.tick) || !whole(meta.simulatedAt)) return null;
    return { name: meta.name, level: meta.level, rank: meta.rank, tick: meta.tick, simulatedAt: meta.simulatedAt };
  } catch {
    return null;
  }
}

async function campusRow(env: Env, account: string, campus: string): Promise<CampusRow | null> {
  return env.DB.prepare('SELECT * FROM campuses WHERE account_id = ? AND campus_id = ?').bind(account, campus).first<CampusRow>();
}

// ---------------------------------------------------------------- routes --

async function signIn(request: Request, env: Env, now: number): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.identityToken !== 'string' || body.identityToken.length > 5000) return fail(400, 'identityToken');
  const nonce = typeof body.nonce === 'string' ? body.nonce : undefined;
  const checked = await checkAppleToken(body.identityToken, audiencesOf(env), now, nonce);
  if (!checked.ok) return fail(401, `token: ${checked.reason}`);

  await env.DB.prepare('INSERT INTO accounts (id, apple_sub, created_at) VALUES (?, ?, ?) ON CONFLICT (apple_sub) DO NOTHING').bind(crypto.randomUUID(), checked.sub, now).run();
  const account = await env.DB.prepare('SELECT id, apple_refresh FROM accounts WHERE apple_sub = ?').bind(checked.sub).first<{ id: string; apple_refresh: string | null }>();
  if (!account) return fail(500, 'account');

  // With the owner's Sign in with Apple key, keep a refresh token to revoke when the account is deleted.
  let revocable = Boolean(account.apple_refresh);
  const code = body.authorizationCode;
  if (typeof code === 'string' && code.length > 0 && code.length < 1000 && hasAppleKey(env)) {
    const clientId = typeof checked.claims.aud === 'string' ? checked.claims.aud : audiencesOf(env)[0]!;
    const refresh = await refreshTokenFor(env, clientId, code, now);
    if (refresh) {
      await env.DB.prepare('UPDATE accounts SET apple_refresh = ? WHERE id = ?').bind(refresh, account.id).run();
      revocable = true;
    }
  }

  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), account.id, now, now + SESSION_MS).run();
  const reply: SignInReply = { token, accountId: account.id, revocable };
  return json(reply);
}

async function signOut(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return new Response(null, { status: 204, headers: CORS });
}

async function list(env: Env, account: string, now: number): Promise<Response> {
  const rows = await env.DB.prepare('SELECT * FROM campuses WHERE account_id = ? ORDER BY uploaded_at DESC').bind(account).all<CampusRow>();
  const reply: CampusList = { campuses: rows.results.map((row) => recordOf(row, now)), serverTime: now };
  return json(reply);
}

async function upload(request: Request, env: Env, account: string, campus: string, now: number): Promise<Response> {
  const base = Number(request.headers.get(BASE_REVISION_HEADER));
  if (!Number.isInteger(base) || base < 0) return fail(400, BASE_REVISION_HEADER);
  const meta = metaOf(request.headers.get(CAMPUS_META_HEADER));
  if (!meta) return fail(400, CAMPUS_META_HEADER);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_SAVE_BYTES) return fail(413, 'too large');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_SAVE_BYTES) return fail(413, 'too large');
  // A gzip stream, and nothing else: the server stores it as it came.
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return fail(400, 'not gzip');

  const current = await campusRow(env, account, campus);
  if (current && current.revision !== base) {
    const reply: ConflictReply = { conflict: recordOf(current, now) };
    return json(reply, 409);
  }
  if (!current) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM campuses WHERE account_id = ?').bind(account).first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_CAMPUSES) return fail(403, 'too many campuses');
  }

  const revision = (current?.revision ?? 0) + 1;
  const mark = clockMark(current ? { uploadedAt: current.uploaded_at, simulatedAt: current.simulated_at, leadMs: current.lead_ms } : null, meta.simulatedAt, now);
  const key = objectKey(account, campus, revision);
  await env.SAVES.put(key, bytes, { httpMetadata: { contentType: 'application/gzip' } });

  const values = [meta.name, revision, now, bytes.length, meta.level, meta.rank, meta.tick, meta.simulatedAt, mark.leadMs, mark.aheadUntil];
  // Written only if nobody else has written since: two phones uploading at once cannot both win.
  const written = current
    ? await env.DB.prepare(
        'UPDATE campuses SET name = ?, revision = ?, uploaded_at = ?, bytes = ?, level = ?, rank = ?, tick = ?, simulated_at = ?, lead_ms = ?, ahead_until = ? WHERE account_id = ? AND campus_id = ? AND revision = ?',
      )
        .bind(...values, account, campus, current.revision)
        .run()
    : await env.DB.prepare(
        'INSERT INTO campuses (name, revision, uploaded_at, bytes, level, rank, tick, simulated_at, lead_ms, ahead_until, account_id, campus_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, campus_id) DO NOTHING',
      )
        .bind(...values, account, campus)
        .run();
  if (written.meta.changes !== 1) {
    await env.SAVES.delete(key);
    const latest = await campusRow(env, account, campus);
    if (!latest) return fail(409, 'conflict');
    const reply: ConflictReply = { conflict: recordOf(latest, now) };
    return json(reply, 409);
  }
  // Only the latest is kept. Deleting is free in R2.
  if (current) await env.SAVES.delete(objectKey(account, campus, current.revision));
  const row = await campusRow(env, account, campus);
  const reply: UploadReply = { campus: recordOf(row!, now) };
  return json(reply);
}

async function download(env: Env, account: string, campus: string, now: number): Promise<Response> {
  const row = await campusRow(env, account, campus);
  if (!row) return fail(404, 'no such campus');
  const object = await env.SAVES.get(objectKey(account, campus, row.revision));
  if (!object) return fail(404, 'no save');
  return new Response(await object.arrayBuffer(), {
    headers: { 'content-type': 'application/gzip', [CAMPUS_RECORD_HEADER]: JSON.stringify(recordOf(row, now)), ...CORS },
  });
}

/** Everything the account holds: its saves in R2, its rows in D1. */
async function eraseAccount(env: Env, account: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.SAVES.list(cursor === undefined ? { prefix: `campuses/${account}/` } : { prefix: `campuses/${account}/`, cursor });
    if (page.objects.length > 0) await env.SAVES.delete(page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM campuses WHERE account_id = ?').bind(account),
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(account),
    env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(account),
  ]);
}

async function deleteAccount(env: Env, account: string, now: number): Promise<Response> {
  const row = await env.DB.prepare('SELECT apple_refresh FROM accounts WHERE id = ?').bind(account).first<{ apple_refresh: string | null }>();
  let apple: DeleteReply['apple'] = 'nothing to revoke';
  if (row?.apple_refresh) {
    if (!hasAppleKey(env)) apple = 'no key';
    else apple = (await revoke(env, audiencesOf(env)[0]!, row.apple_refresh, now).catch(() => false)) ? 'revoked' : 'failed';
  }
  // The account goes whatever Apple says: the player asked for it gone.
  await eraseAccount(env, account);
  const reply: DeleteReply = { deleted: true, apple };
  return json(reply);
}

/**
 * Apple's server-to-server notice. When a player stops using Sign in with Apple for the app, or deletes their Apple
 * account, their account here goes too. The notice is a token Apple signed, checked as an identity token is.
 */
async function appleNotice(request: Request, env: Env, now: number): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.payload !== 'string') return fail(400, 'payload');
  const checked = await checkAppleToken(body.payload, audiencesOf(env), now);
  if (!checked.ok) return fail(401, `token: ${checked.reason}`);
  let event: { type?: unknown; sub?: unknown } = {};
  try {
    const raw = checked.claims.events;
    event = (typeof raw === 'string' ? JSON.parse(raw) : raw) as typeof event;
  } catch {
    return fail(400, 'events');
  }
  if ((event.type === 'consent-revoked' || event.type === 'account-delete') && typeof event.sub === 'string') {
    const account = await env.DB.prepare('SELECT id FROM accounts WHERE apple_sub = ?').bind(event.sub).first<{ id: string }>();
    if (account) await eraseAccount(env, account.id);
  }
  return json({ ok: true });
}

async function route(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname;
  const now = Date.now();
  if (!path.startsWith(`${API}/`)) return fail(404, 'not found');
  const rest = path.slice(API.length);

  if (rest === '/sign-in' && request.method === 'POST') return signIn(request, env, now);
  if (rest === '/apple/notices' && request.method === 'POST') return appleNotice(request, env, now);
  if (rest === '/sign-out' && request.method === 'POST') return signOut(request, env);

  const account = await accountOf(request, env, now);
  if (!account) return fail(401, 'sign in');
  if (rest === '/campuses' && request.method === 'GET') return list(env, account, now);
  if (rest === '/account' && request.method === 'DELETE') return deleteAccount(env, account, now);
  const campus = /^\/campuses\/([^/]+)$/.exec(rest)?.[1];
  if (campus !== undefined) {
    if (!CAMPUS_ID.test(campus)) return fail(400, 'campus id');
    if (request.method === 'PUT') return upload(request, env, account, campus, now);
    if (request.method === 'GET') return download(env, account, campus, now);
  }
  return fail(404, 'not found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch {
      return fail(500, 'server');
    }
  },
};
