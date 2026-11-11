/**
 * Runs before every build (npm "prebuild" hooks).
 *
 * The public repository only holds Kenney's public-domain art. A paid art pack
 * lives in a private GitHub repository. A build that is given the art key
 * downloads the pack into art/private (git-ignored), and the build then uses it
 * in place of the Kenney art (see tools/finish-build.ts).
 *
 * Without the key nothing is downloaded and the build uses the Kenney art, so
 * a fresh clone always builds and runs.
 *
 * Settings, all from the environment and never from a file in this repository:
 *   ART_TOKEN  the art key (secret). Either of:
 *                - a read-only deploy key for the private repository, as one
 *                  line of base64. This is what Cloudflare and Codemagic hold.
 *                - a GitHub token that can read the repository (ghp_... or
 *                  github_pat_...), handy for a quick test.
 *   ART_REPO   owner/name of that repository   (default GoalLearner/campus-tycoon-art)
 *   ART_PACK   the folder inside it to use     (default current)
 *   ART_REF    the branch or tag to read       (default main)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['atlas.png', 'atlas.json', 'manifest.json'];

// GitHub's published host key, so the build only ever talks to the real GitHub.
// Port 443 on ssh.github.com works on networks that block the usual SSH port.
const GITHUB_SSH_HOST = 'ssh.github.com';
const GITHUB_SSH_PORT = 443;
const GITHUB_HOST_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';

const token = process.env.ART_TOKEN?.trim();
const repo = process.env.ART_REPO?.trim() || 'GoalLearner/campus-tycoon-art';
const pack = process.env.ART_PACK?.trim() || 'current';
const ref = process.env.ART_REF?.trim() || 'main';
const outDir = fileURLToPath(new URL('../art/private/', import.meta.url));

/** Thrown for any problem with the private pack. Caught once at the bottom. */
class ArtProblem extends Error {}

// ---------------------------------------------------- with a GitHub token --

async function downloadWithToken(file) {
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
    throw new ArtProblem(`could not reach GitHub for ${file} (${err instanceof Error ? err.message : 'network error'}).`);
  }
  if (response.status === 401) {
    throw new ArtProblem('GitHub refused ART_TOKEN. It may have expired. Make a new one and update the secret.');
  }
  if (response.status === 403 || response.status === 404) {
    throw new ArtProblem(
      `${pack}/${file} was not found in ${repo}, or ART_TOKEN cannot read that repository (HTTP ${response.status}).`,
    );
  }
  if (!response.ok) throw new ArtProblem(`GitHub answered HTTP ${response.status} for ${file}.`);
  return Buffer.from(await response.arrayBuffer());
}

// ----------------------------------------------------- with a deploy key --

/** Decode the one-line secret back into the key file ssh expects, or null if it is not one. */
function deployKeyFrom(secret) {
  let decoded;
  try {
    decoded = Buffer.from(secret, 'base64').toString('utf8');
  } catch {
    return null;
  }
  return decoded.includes('PRIVATE KEY-----') ? decoded.replace(/\r\n/g, '\n').trimEnd() + '\n' : null;
}

function downloadWithDeployKey(key) {
  const scratch = mkdtempSync(join(tmpdir(), 'campus-art-'));
  const slash = (path) => path.replace(/\\/g, '/');
  try {
    const keyFile = join(scratch, 'key');
    const hostsFile = join(scratch, 'known_hosts');
    writeFileSync(keyFile, key, { mode: 0o600 });
    writeFileSync(hostsFile, `[${GITHUB_SSH_HOST}]:${GITHUB_SSH_PORT} ${GITHUB_HOST_KEY}\n`);

    const ssh = [
      'ssh',
      `-i "${slash(keyFile)}"`,
      '-o IdentitiesOnly=yes',
      '-o BatchMode=yes',
      '-o StrictHostKeyChecking=yes',
      `-o UserKnownHostsFile="${slash(hostsFile)}"`,
    ].join(' ');
    const clone = join(scratch, 'repo');
    try {
      execFileSync(
        'git',
        ['clone', '--quiet', '--depth', '1', '--branch', ref, `ssh://git@${GITHUB_SSH_HOST}:${GITHUB_SSH_PORT}/${repo}.git`, clone],
        { env: { ...process.env, GIT_SSH_COMMAND: ssh, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'ignore', 'pipe'] },
      );
    } catch (err) {
      if (err?.code === 'ENOENT') throw new ArtProblem('this machine has no git, which the art key needs.');
      const detail = String(err?.stderr ?? '').trim().split('\n').slice(-2).join(' ');
      throw new ArtProblem(`could not read ${repo} with the art key in ART_TOKEN. ${detail}`);
    }

    return FILES.map((file) => {
      const path = join(clone, pack, file);
      if (!existsSync(path)) throw new ArtProblem(`${pack}/${file} was not found in ${repo} (${ref}).`);
      return [file, readFileSync(path)];
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ main --

async function main() {
  if (!token) {
    const local = FILES.every((file) => existsSync(outDir + file));
    console.log(
      local
        ? 'Art: no ART_TOKEN. Using the private pack already in art/private.'
        : 'Art: no ART_TOKEN. Using the built-in Kenney art.',
    );
    return;
  }

  // Download everything first, so a failure never leaves half a pack behind.
  let downloaded;
  if (/^(ghp_|gho_|ghs_|ghu_|github_pat_)/.test(token)) {
    downloaded = [];
    for (const file of FILES) downloaded.push([file, await downloadWithToken(file)]);
  } else {
    const key = deployKeyFrom(token);
    if (!key) throw new ArtProblem('ART_TOKEN is neither the art key nor a GitHub token. Paste it again as one unbroken line.');
    downloaded = downloadWithDeployKey(key);
  }

  let manifest;
  try {
    manifest = JSON.parse(downloaded.find(([file]) => file === 'manifest.json')[1].toString('utf8'));
  } catch {
    throw new ArtProblem('manifest.json in the private pack is not valid JSON.');
  }
  if (!manifest?.atlas?.image || !manifest?.sprites) {
    throw new ArtProblem('manifest.json in the private pack is missing its atlas or sprites.');
  }

  await mkdir(outDir, { recursive: true });
  for (const [file, bytes] of downloaded) await writeFile(outDir + file, bytes);
  console.log(`Art: downloaded the private pack "${manifest.pack ?? pack}" from ${repo} (${pack}, ${ref}).`);
}

// Set the exit code and let Node finish by itself. Calling process.exit() while a
// download is still closing crashes Node on Windows.
main().catch((err) => {
  if (!(err instanceof ArtProblem)) throw err;
  console.error(`\nArt: ${err.message}`);
  console.error('Art: the build stopped so it cannot ship the wrong art. Remove ART_TOKEN to build with the Kenney art.\n');
  process.exitCode = 1;
});
