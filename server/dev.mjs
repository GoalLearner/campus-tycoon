/**
 * node server/dev.mjs
 *
 * The cloud server on this computer, for the dev page (DESIGN.md 48): the real
 * Worker on Miniflare, with a local D1 database and R2 bucket kept in
 * server/.wrangler/ (git-ignored), and a stand-in for Apple beside it that
 * signs test tokens with a key made each time it starts. Nothing reaches
 * Cloudflare or Apple, and nothing needs a key of the owner's.
 *
 * Then open the dev page with
 *   ?cloud=http://127.0.0.1:8790&fakeApple=http://127.0.0.1:8791
 * and Menu, Account. Add &appleSub=someone to be another player.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const PORT = Number(process.env.CLOUD_PORT ?? 8790);
const APPLE_PORT = Number(process.env.FAKE_APPLE_PORT ?? 8791);
const HOST = '127.0.0.1';
const AUDIENCE = 'com.goallearner.campustycoon';
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');

// The stand-in for Apple: one RSA key, made now.
const KID = 'dev-key';
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
async function token(sub) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: KID }));
  const body = b64(JSON.stringify({ iss: 'https://appleid.apple.com', aud: AUDIENCE, iat: now, exp: now + 600, sub }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64(new Uint8Array(signature))}`;
}
createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${HOST}`);
  const sub = url.searchParams.get('sub');
  response.setHeader('access-control-allow-origin', '*');
  if (url.pathname !== '/token' || !sub) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ identityToken: await token(sub) }));
}).listen(APPLE_PORT, HOST);

const script = (await build({ entryPoints: [here('./src/index.ts')], bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'silent' })).outputFiles[0].text;
const state = here('./.wrangler/dev');
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script,
    compatibilityDate: '2026-11-01',
    host: HOST,
    port: PORT,
    d1Databases: ['DB'],
    r2Buckets: ['SAVES'],
    d1Persist: `${state}/d1`,
    r2Persist: `${state}/r2`,
    bindings: { APPLE_AUDIENCE: AUDIENCE },
    outboundService: (request) => (new URL(request.url).pathname === '/auth/keys' ? Response.json(jwks) : new Response('not here', { status: 404 })),
  }),
);
const ready = await mf.ready;
const db = await mf.getD1Database('DB');
const made = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").first();
if (!made) {
  const sql = readFileSync(here('./migrations/0001_init.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of sql.split(';').map((one) => one.trim()).filter(Boolean)) await db.prepare(statement).run();
}
console.log(`Cloud server on ${ready.origin}; stand-in for Apple on http://${HOST}:${APPLE_PORT}`);
console.log(`Dev page: ?cloud=http://${HOST}:${PORT}&fakeApple=http://${HOST}:${APPLE_PORT}`);
