/**
 * Stamps the iOS project with the app version and a build number.
 *
 *   node scripts/ios-version.mjs             version from package.json, build number unchanged
 *   node scripts/ios-version.mjs --build 12  the same, and build number 12
 *
 * package.json is the one place the version is written. Codemagic runs this
 * with the next TestFlight build number before it archives the app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const projectPath = fileURLToPath(new URL('ios/App/App.xcodeproj/project.pbxproj', root));
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

const flag = process.argv.indexOf('--build');
const build = flag === -1 ? null : process.argv[flag + 1];
if (build !== null && !/^[1-9][0-9]*$/.test(build ?? '')) {
  console.error(`The build number must be a whole number above zero. Got "${build}".`);
  process.exit(1);
}
if (!/^[0-9]+(\.[0-9]+){1,2}$/.test(version)) {
  console.error(`The version in package.json must look like 1.2 or 1.2.3. Got "${version}".`);
  process.exit(1);
}

let project = readFileSync(projectPath, 'utf8');
const count = (pattern) => (project.match(pattern) ?? []).length;

const versions = /MARKETING_VERSION = [^;]+;/g;
const builds = /CURRENT_PROJECT_VERSION = [^;]+;/g;
if (count(versions) === 0 || count(builds) === 0) {
  console.error('The Xcode project has no version settings to stamp.');
  process.exit(1);
}

project = project.replace(versions, `MARKETING_VERSION = ${version};`);
if (build !== null) project = project.replace(builds, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(projectPath, project);
console.log(`iOS project stamped: version ${version}${build !== null ? `, build ${build}` : ''}.`);
