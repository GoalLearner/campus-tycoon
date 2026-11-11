/**
 * Uploads the atlas in art/private to the private art repository, so the
 * Cloudflare and Codemagic builds can fetch it (see scripts/fetch-art.mjs).
 *
 * Run it on the owner's PC after building a paid pack:
 *   python tools/build_art.py <recipe>     writes art/private
 *   npm run art:publish                    uploads it
 *
 * It uses the GitHub sign-in already on the PC through the `gh` tool, so no
 * token is typed or stored. Options from the environment: ART_REPO, ART_PACK,
 * ART_REF, with the same defaults as fetch-art.mjs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['atlas.png', 'atlas.json', 'manifest.json'];
const repo = process.env.ART_REPO?.trim() || 'GoalLearner/campus-tycoon-art';
const pack = process.env.ART_PACK?.trim() || 'current';
const ref = process.env.ART_REF?.trim() || 'main';
// "npm run art:publish -- public/assets" uploads another folder, such as the built-in art.
const fromArg = process.argv[2];
const dir = fromArg ? join(process.cwd(), fromArg) : fileURLToPath(new URL('../art/private/', import.meta.url));

for (const file of FILES) {
  if (!existsSync(join(dir, file))) {
    console.error(`Nothing to publish: ${join(dir, file)} is missing. Build the pack first.`);
    process.exit(1);
  }
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const visibility = gh(['repo', 'view', repo, '--json', 'visibility', '--jq', '.visibility']).trim();
if (visibility !== 'PRIVATE') {
  console.error(`Stopped: ${repo} is ${visibility}. Paid art may only go to a private repository.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'campus-art-'));
try {
  for (const file of FILES) {
    const path = `repos/${repo}/contents/${pack}/${file}`;
    let sha;
    try {
      sha = gh(['api', `${path}?ref=${ref}`, '--jq', '.sha']).trim();
    } catch {
      sha = undefined; // The file is new.
    }
    const body = {
      message: `Art pack "${manifest.pack ?? pack}": ${file}`,
      branch: ref,
      content: readFileSync(join(dir, file)).toString('base64'),
      ...(sha ? { sha } : {}),
    };
    const payload = join(scratch, 'payload.json');
    writeFileSync(payload, JSON.stringify(body));
    gh(['api', '-X', 'PUT', path, '--input', payload, '--silent']);
    console.log(`Uploaded ${pack}/${file}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`Published the pack "${manifest.pack ?? pack}" to ${repo}. The next Cloudflare and Codemagic builds will use it.`);
