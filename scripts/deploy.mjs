/**
 * npm run deploy
 *
 * Tests, builds and uploads the web build to Cloudflare Pages, as the live
 * site. It uses the Cloudflare sign-in already on this computer
 * ("npx wrangler login" sets that up once).
 *
 * A push to main deploys by itself through Cloudflare's GitHub connection.
 * This command is for deploying what is on this computer right now.
 */
import { execSync } from 'node:child_process';

const PROJECT = process.env.PAGES_PROJECT?.trim() || 'campus-tycoon';

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

// The project must be made in the Cloudflare dashboard, connected to GitHub. A project
// made from the command line can never be connected to GitHub afterwards, so stop here
// instead of letting the upload tool offer to create one.
let projects = [];
try {
  const listing = execSync('npx wrangler pages project list --json', { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  projects = JSON.parse(listing.slice(listing.indexOf('[')));
} catch {
  console.error('Could not read the Cloudflare Pages projects. Run "npx wrangler login" and try again.');
  process.exit(1);
}
const project = projects.find((entry) => entry['Project Name'] === PROJECT);
if (!project) {
  console.error(`There is no Cloudflare Pages project named "${PROJECT}" yet.`);
  console.error('Create it in the Cloudflare dashboard with "Import an existing Git repository" first.');
  process.exit(1);
}
if (project['Git Provider'] !== 'Yes') {
  console.warn(`Note: "${PROJECT}" is not connected to GitHub, so pushes to main will not deploy by themselves.`);
}

run('npm test');
run('npm run build');
run(`npx wrangler pages deploy dist --project-name ${PROJECT} --branch main --commit-dirty=true`);
console.log(`\nDeployed. Live at https://${project['Project Domains'].split(',')[0].trim()}`);
