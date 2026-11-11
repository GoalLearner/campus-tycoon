/**
 * Run after "npm run build:ios". Stops the build unless the iOS app carries
 * its own copy of the game and does not load it from a website.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../ios/App/App/', import.meta.url));
const problems = [];

for (const file of ['public/index.html', 'public/assets/atlas.png', 'public/assets/atlas.json', 'public/assets/manifest.json']) {
  if (!existsSync(app + file)) problems.push(`${file} is missing from the app.`);
}
if (existsSync(app + 'public/sw.js')) problems.push('The app must not contain a service worker (public/sw.js).');

let config = {};
try {
  config = JSON.parse(readFileSync(app + 'capacitor.config.json', 'utf8'));
} catch {
  problems.push('capacitor.config.json is missing from the app. Run "npx cap sync ios".');
}
if (config.server?.url) problems.push(`The app is set to load from ${config.server.url}. It must use its own files.`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`Problem: ${problem}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(app + 'public/assets/manifest.json', 'utf8'));
console.log(`The app carries its own copy of the game. Bundle id: ${config.appId}. Art pack: ${manifest.pack}.`);
