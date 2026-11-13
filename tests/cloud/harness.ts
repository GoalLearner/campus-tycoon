import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { base64UrlEncode } from '../../server/src/jwt';

/**
 * The cloud server, run for the tests as it would run on Cloudflare: the real
 * Worker, bundled from server/src, on Miniflare with a local D1 database and
 * R2 bucket. Apple is played by test keys made fresh for each run: the
 * server's calls to appleid.apple.com are answered here. No key, token or
 * secret of the owner's is involved.
 */

const ROOT = join(__dirname, '..', '..');
export const AUDIENCE = 'com.goallearner.campustycoon';
const encoder = new TextEncoder();

let bundled: string | null = null;
async function workerScript(): Promise<string> {
  if (bundled === null) {
    const out = await build({ entryPoints: [join(ROOT, 'server', 'src', 'index.ts')], bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'silent' });
    bundled = out.outputFiles[0]!.text;
  }
  return bundled;
}

/** A test stand-in for Apple: its signing keys, and what the server asked of it. */
export class FakeApple {
  readonly calls: Array<{ path: string; form: Record<string, string> }> = [];
  private keys: Array<{ kid: string; pair: CryptoKeyPair }> = [];
  /** The Sign in with Apple key the owner would give the server: a P-256 key in PEM, with its public half for checking. */
  appKey: { pem: string; publicKey: CryptoKey } | null = null;
  refused = false;

  async addKey(kid: string): Promise<void> {
    const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    this.keys.push({ kid, pair });
  }

  async makeAppKey(): Promise<void> {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const body = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
    this.appKey = { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
  }

  /** A token signed as Apple signs identity tokens. `with` replaces any claim; `kid` and `signer` pick the key. */
  async token(sub: string, with_: Record<string, unknown> = {}, options: { kid?: string; signer?: CryptoKey } = {}): Promise<string> {
    const key = this.keys.find((one) => one.kid === (options.kid ?? this.keys[0]!.kid)) ?? this.keys[0]!;
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', kid: options.kid ?? key.kid })));
    const claims = base64UrlEncode(encoder.encode(JSON.stringify({ iss: 'https://appleid.apple.com', aud: AUDIENCE, exp: now + 600, iat: now, sub, ...with_ })));
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', options.signer ?? key.pair.privateKey, encoder.encode(`${header}.${claims}`));
    return `${header}.${claims}.${base64UrlEncode(signature)}`;
  }

  /** A key that is not Apple's, for a token that must fail. */
  async strangerKey(): Promise<CryptoKey> {
    const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    return pair.privateKey;
  }

  /** Answer what the server sends to appleid.apple.com. */
  async answer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname !== 'appleid.apple.com') return new Response('not here', { status: 502 });
    if (url.pathname === '/auth/keys') {
      const keys = await Promise.all(this.keys.map(async ({ kid, pair }) => ({ ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as object), kid, alg: 'RS256', use: 'sig' })));
      return Response.json({ keys });
    }
    const form = Object.fromEntries(new URLSearchParams(await request.text()));
    this.calls.push({ path: url.pathname, form });
    if (this.refused || !(await this.secretHolds(form.client_secret ?? ''))) return Response.json({ error: 'invalid_client' }, { status: 400 });
    if (url.pathname === '/auth/token') return Response.json({ access_token: 'a', token_type: 'Bearer', expires_in: 3600, refresh_token: `refresh-${form.code}`, id_token: 'x' });
    if (url.pathname === '/auth/revoke') return new Response(null, { status: 200 });
    return new Response('not here', { status: 404 });
  }

  /** The client secret the server made: signed with the app key, with the claims Apple asks for. */
  async secretHolds(secret: string): Promise<boolean> {
    if (!this.appKey) return false;
    const [head, body, signature] = secret.split('.');
    if (!head || !body || !signature) return false;
    const fromB64 = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(text, 'base64url'));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, this.appKey.publicKey, fromB64(signature), encoder.encode(`${head}.${body}`));
    const header = JSON.parse(Buffer.from(head, 'base64url').toString()) as Record<string, unknown>;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
    return ok && header.alg === 'ES256' && header.kid === 'TESTKEYID1' && claims.iss === 'TESTTEAMID' && claims.aud === 'https://appleid.apple.com' && claims.sub === AUDIENCE;
  }
}

export interface Server {
  mf: Miniflare;
  apple: FakeApple;
  /** A fetch that reaches the Worker. */
  fetch: typeof fetch;
  base: string;
  /** Every object in the R2 bucket. */
  objects(): Promise<string[]>;
  /** Rows of a D1 table. */
  rows(table: 'accounts' | 'sessions' | 'campuses'): Promise<Array<Record<string, unknown>>>;
  dispose(): Promise<void>;
}

/** Start the server. `withKey`: the owner has given it the Sign in with Apple key (test keys here). */
export async function startServer(options: { withKey: boolean }): Promise<Server> {
  const apple = new FakeApple();
  await apple.addKey('test-key-1');
  await apple.addKey('test-key-2');
  if (options.withKey) await apple.makeAppKey();
  const bindings: Record<string, string> = { APPLE_AUDIENCE: AUDIENCE };
  if (options.withKey) Object.assign(bindings, { APPLE_TEAM_ID: 'TESTTEAMID', APPLE_KEY_ID: 'TESTKEYID1', APPLE_PRIVATE_KEY: apple.appKey!.pem });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await workerScript(),
      compatibilityDate: '2026-11-01',
      d1Databases: ['DB'],
      r2Buckets: ['SAVES'],
      bindings,
      outboundService: (request: Request) => apple.answer(request),
    } as never),
  );
  const db = await mf.getD1Database('DB');
  const schema = readFileSync(join(ROOT, 'server', 'migrations', '0001_init.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of schema.split(';').map((one) => one.trim()).filter(Boolean)) await db.prepare(statement).run();
  const base = 'https://cloud.test';
  const via = ((input: RequestInfo | URL, init?: RequestInit) => mf.dispatchFetch(String(input instanceof Request ? input.url : input), init as never)) as unknown as typeof fetch;
  return {
    mf,
    apple,
    fetch: via,
    base,
    async objects() {
      const bucket = (await mf.getR2Bucket('SAVES')) as unknown as { list(): Promise<{ objects: Array<{ key: string }> }> };
      return (await bucket.list()).objects.map((object) => object.key);
    },
    async rows(table) {
      return (await db.prepare(`SELECT * FROM ${table}`).all()).results as Array<Record<string, unknown>>;
    },
    dispose: () => mf.dispose(),
  };
}

