/**
 * Runs before every build (npm "prebuild" hooks).
 *
 * The public repository only holds Kenney's public-domain art. A paid art pack
 * lives in a private GitHub repository. A build that is given a token for that
 * repository downloads the pack into art/private (git-ignored), and the build
 * then uses it in place of the Kenney art (see tools/finish-build.ts).
 *
 * Without a token nothing is downloaded and the build uses the Kenney art, so
 * a fresh clone always builds and runs.
 *
 * Settings, all from the environment and never from a file in this repository:
 *   ART_TOKEN  a read-only token for the private art repository (secret)
 *   ART_REPO   owner/name of that repository   (default GoalLearner/campus-tycoon-art)
 *   ART_PACK   the folder inside it to use     (default current)
 *   ART_REF    the branch or tag to read       (default main)
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FILES = ['atlas.png', 'atlas.json', 'manifest.json'];

const token = process.env.ART_TOKEN?.trim();
const repo = process.env.ART_REPO?.trim() || 'GoalLearner/campus-tycoon-art';
const pack = process.env.ART_PACK?.trim() || 'current';
const ref = process.env.ART_REF?.trim() || 'main';
const outDir = fileURLToPath(new URL('../art/private/', import.meta.url));

function fail(message) {
  console.error(`\nArt: ${message}`);
  console.error('Art: the build stopped so it cannot ship the wrong art. Remove ART_TOKEN to build with the Kenney art.\n');
  process.exit(1);
}

if (!token) {
  const local = FILES.every((file) => existsSync(outDir + file));
  console.log(
    local
      ? 'Art: no ART_TOKEN. Using the private pack already in art/private.'
      : 'Art: no ART_TOKEN. Using the built-in Kenney art.',
  );
  process.exit(0);
}

async function download(file) {
  const url = `https://api.github.com/repos/${repo}/contents/${pack}/${file}?ref=${encodeURIComponent(ref)}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'campus-tycoon-build',
      },
    });
  } catch (err) {
    fail(`could not reach GitHub for ${file} (${err instanceof Error ? err.message : 'network error'}).`);
  }
  if (response.status === 401) fail('GitHub refused ART_TOKEN. It may have expired. Make a new one and update the secret.');
  if (response.status === 403 || response.status === 404) {
    fail(`${pack}/${file} was not found in ${repo}, or ART_TOKEN cannot read that repository (HTTP ${response.status}).`);
  }
  if (!response.ok) fail(`GitHub answered HTTP ${response.status} for ${file}.`);
  return Buffer.from(await response.arrayBuffer());
}

// Download everything first, so a failure never leaves half a pack behind.
const downloaded = [];
for (const file of FILES) downloaded.push([file, await download(file)]);

let manifest;
try {
  manifest = JSON.parse(downloaded.find(([file]) => file === 'manifest.json')[1].toString('utf8'));
} catch {
  fail('manifest.json in the private pack is not valid JSON.');
}
if (!manifest?.atlas?.image || !manifest?.sprites) fail('manifest.json in the private pack is missing its atlas or sprites.');

await mkdir(outDir, { recursive: true });
for (const [file, bytes] of downloaded) await writeFile(outDir + file, bytes);
console.log(`Art: downloaded the private pack "${manifest.pack ?? pack}" from ${repo} (${pack}, ${ref}).`);
