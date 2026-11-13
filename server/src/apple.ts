import type { Env } from './bindings';
import { decodeJwt, signatureHolds, signEs256, type PublicJwk } from './jwt';

/**
 * Sign in with Apple, on the server (DESIGN.md 48): checking the identity
 * token a phone sends, and, when the owner has given the server the Sign in
 * with Apple key, trading the one-time code for a refresh token and revoking
 * it when the account is deleted.
 */

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** A token whose clock is a little off is still taken. */
const SKEW_SECONDS = 60;
/** Apple's keys are kept this long before being fetched again, and fetched at once for a key not seen before. */
const KEYS_KEPT_MS = 60 * 60_000;

let cachedKeys: { keys: PublicJwk[]; at: number } | null = null;

/** Forget the keys fetched. For the tests. */
export function forgetAppleKeys(): void {
  cachedKeys = null;
}

async function fetchKeys(now: number): Promise<PublicJwk[]> {
  const response = await fetch(APPLE_KEYS_URL);
  if (!response.ok) throw new Error(`Apple's keys: ${response.status}`);
  const body = (await response.json()) as { keys?: unknown };
  const keys = Array.isArray(body.keys) ? (body.keys as PublicJwk[]).filter((key) => typeof key?.kid === 'string' && typeof key.kty === 'string') : [];
  cachedKeys = { keys, at: now };
  return keys;
}

/** Apple's public key for a key ID, fetched at run time and kept for an hour. */
async function appleKey(kid: string, now: number): Promise<PublicJwk | null> {
  const fresh = cachedKeys !== null && now - cachedKeys.at < KEYS_KEPT_MS;
  const keys = fresh ? cachedKeys!.keys : await fetchKeys(now);
  const found = keys.find((key) => key.kid === kid);
  if (found || !fresh) return found ?? null;
  // A key not seen before: Apple may have added one since.
  return (await fetchKeys(now)).find((key) => key.kid === kid) ?? null;
}

export type TokenCheck = { ok: true; sub: string; claims: Record<string, unknown> } | { ok: false; reason: string };

/** The audiences the server takes: the app's bundle ID, or several, comma separated. */
export function audiencesOf(env: Env): string[] {
  return env.APPLE_AUDIENCE.split(',')
    .map((one) => one.trim())
    .filter((one) => one.length > 0);
}

/**
 * Check a token Apple signed: its signature against Apple's published key, that Apple issued it, that it is for this
 * app, and that it has not expired. Used for a phone's identity token and for Apple's notices to the server.
 */
export async function checkAppleToken(token: string, audiences: readonly string[], nowMs: number, nonce?: string): Promise<TokenCheck> {
  const decoded = decodeJwt(token);
  if (!decoded) return { ok: false, reason: 'not a token' };
  const { header, claims } = decoded;
  if (header.alg !== 'RS256' && header.alg !== 'ES256') return { ok: false, reason: 'algorithm' };
  if (typeof header.kid !== 'string') return { ok: false, reason: 'no key id' };
  const key = await appleKey(header.kid, nowMs);
  if (!key) return { ok: false, reason: 'unknown key' };
  if (!(await signatureHolds(decoded, key))) return { ok: false, reason: 'signature' };
  if (claims.iss !== APPLE_ISSUER) return { ok: false, reason: 'issuer' };
  const aud = claims.aud;
  const forUs = typeof aud === 'string' ? audiences.includes(aud) : Array.isArray(aud) && aud.some((one) => audiences.includes(String(one)));
  if (!forUs) return { ok: false, reason: 'audience' };
  const now = nowMs / 1000;
  if (typeof claims.exp !== 'number' || claims.exp < now - SKEW_SECONDS) return { ok: false, reason: 'expired' };
  if (typeof claims.iat === 'number' && claims.iat > now + SKEW_SECONDS) return { ok: false, reason: 'issued in the future' };
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return { ok: false, reason: 'no subject' };
  if (nonce !== undefined && claims.nonce !== nonce) return { ok: false, reason: 'nonce' };
  return { ok: true, sub: claims.sub, claims };
}

/** True when the owner has given the server the Sign in with Apple key. */
export function hasAppleKey(env: Env): boolean {
  return Boolean(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

/** The client secret Apple asks for: a short-lived ES256 token signed with the Sign in with Apple key. */
export async function clientSecret(env: Env, clientId: string, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return signEs256({ iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: APPLE_ISSUER, sub: clientId }, env.APPLE_KEY_ID!, env.APPLE_PRIVATE_KEY!);
}

/** Trade the one-time code from signing in for a refresh token. null when Apple says no. */
export async function refreshTokenFor(env: Env, clientId: string, code: string, nowMs: number): Promise<string | null> {
  const response = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(env, clientId, nowMs), code, grant_type: 'authorization_code' }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { refresh_token?: unknown };
  return typeof body.refresh_token === 'string' ? body.refresh_token : null;
}

/** Revoke a refresh token, as Apple asks when an account is deleted. */
export async function revoke(env: Env, clientId: string, refreshToken: string, nowMs: number): Promise<boolean> {
  const response = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(env, clientId, nowMs), token: refreshToken, token_type_hint: 'refresh_token' }),
  });
  return response.ok;
}
