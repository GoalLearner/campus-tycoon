/**
 * Two questions for App Store Connect, asked with the API key the build holds.
 *
 *   node scripts/asc-api.mjs next-build <appId>         prints the next TestFlight build number
 *   node scripts/asc-api.mjs profile "<profile name>"   prints that provisioning profile, base64
 *
 * Settings, all from the environment and never from a file in this repository:
 *   ASC_API_KEY_ID      the key's id
 *   ASC_API_ISSUER_ID   the issuer id
 *   ASC_API_KEY_PATH    the key's .p8 file
 *
 * Nothing is installed for this: Node signs the token itself.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const keyId = process.env.ASC_API_KEY_ID?.trim();
const issuer = process.env.ASC_API_ISSUER_ID?.trim();
const keyPath = process.env.ASC_API_KEY_PATH?.trim();

function fail(message) {
  console.error(`asc-api: ${message}`);
  process.exit(1);
}

if (!keyId || !issuer || !keyPath) fail('ASC_API_KEY_ID, ASC_API_ISSUER_ID and ASC_API_KEY_PATH are all needed.');

const base64url = (value) => Buffer.from(value).toString('base64url');

/** A short-lived token, signed with the key (ES256, as App Store Connect asks). */
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = base64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }));
  const signer = createSign('SHA256');
  signer.update(`${head}.${body}`);
  const signature = signer.sign({ key: readFileSync(keyPath, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${signature.toString('base64url')}`;
}

async function get(path) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 400);
    try {
      detail = JSON.parse(text).errors.map((error) => `${error.title}: ${error.detail}`).join(' | ');
    } catch {
      // keep the raw text
    }
    fail(`App Store Connect answered HTTP ${response.status} for ${path.split('?')[0]}. ${detail}`);
  }
  return JSON.parse(text);
}

const [command, argument] = process.argv.slice(2);

if (command === 'next-build') {
  if (!/^[0-9]+$/.test(argument ?? '')) fail('next-build needs the app\'s Apple ID number.');
  const answer = await get(`/v1/builds?filter[app]=${argument}&sort=-uploadedDate&limit=50&fields[builds]=version`);
  const numbers = answer.data.map((build) => Number.parseInt(build.attributes.version, 10)).filter(Number.isFinite);
  process.stdout.write(String((numbers.length > 0 ? Math.max(...numbers) : 0) + 1));
} else if (command === 'profile') {
  if (!argument) fail('profile needs the profile\'s name.');
  const answer = await get(
    `/v1/profiles?filter[name]=${encodeURIComponent(argument)}&limit=20&fields[profiles]=name,profileState,profileContent,expirationDate,profileType`,
  );
  const active = answer.data.filter((profile) => profile.attributes.name === argument && profile.attributes.profileState === 'ACTIVE');
  if (active.length === 0) {
    const seen = answer.data.map((profile) => `${profile.attributes.name} (${profile.attributes.profileState})`).join(', ') || 'none';
    fail(`no active provisioning profile is named "${argument}". Found: ${seen}.`);
  }
  active.sort((a, b) => String(b.attributes.expirationDate).localeCompare(String(a.attributes.expirationDate)));
  process.stdout.write(active[0].attributes.profileContent);
} else {
  fail('use "next-build <appId>" or "profile <name>".');
}
