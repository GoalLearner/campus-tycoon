import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * The last steps of a build, in order:
 *
 * 1. Private art. If art/private holds an atlas (fetched by scripts/fetch-art.mjs
 *    or built locally from a paid pack), it replaces the built-in Kenney atlas in
 *    the output. The folder is git-ignored, so paid art never enters the
 *    repository. Without it the build keeps the Kenney art.
 * 2. Service worker. The web build gets sw.js with a cache name made from a hash
 *    of every file in the build, plus the list of files to keep for offline use.
 *    The native app build gets no service worker.
 */

const ART_FILES = ['atlas.png', 'atlas.json', 'manifest.json'] as const;
const NOT_CACHED = new Set(['sw.js', '_headers', '_redirects']);

/** The folder holding a complete private atlas, or null when there is none. */
export function privateArtDir(root: string): string | null {
  const dir = resolve(root, 'art/private');
  return ART_FILES.every((file) => existsSync(join(dir, file))) ? dir : null;
}

/** A short label for the Menu so a tester can say which build they have. */
export function buildLabel(): string {
  const fromHost = process.env.CF_PAGES_COMMIT_SHA ?? process.env.CM_COMMIT;
  if (fromHost) return fromHost.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
}

function listFiles(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFiles(join(dir, entry.name), path));
    else found.push(path);
  }
  return found;
}

export function finishBuild(options: { serviceWorker: boolean }): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'campus-finish-build',

    configResolved(resolved) {
      config = resolved;
    },

    // The dev server serves the private atlas in place of the built-in one.
    configureServer(server) {
      const dir = privateArtDir(server.config.root);
      if (!dir) return;
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const name = ART_FILES.find((file) => path === `/assets/${file}`);
        if (!name) {
          next();
          return;
        }
        res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(join(dir, name)));
      });
    },

    closeBundle() {
      if (config.command !== 'build') return;
      const out = resolve(config.root, config.build.outDir);
      if (!existsSync(join(out, 'index.html'))) return;

      const art = privateArtDir(config.root);
      if (art) {
        for (const file of ART_FILES) copyFileSync(join(art, file), join(out, 'assets', file));
      }
      console.log(art ? '\nArt: private pack from art/private' : '\nArt: built-in Kenney pack');

      const workerPath = join(out, 'sw.js');
      if (!options.serviceWorker) {
        rmSync(workerPath, { force: true });
        console.log('Service worker: none (native app build)');
        return;
      }

      const files = listFiles(out)
        .filter((file) => !NOT_CACHED.has(file))
        .sort();
      const hash = createHash('sha256');
      for (const file of files) {
        hash.update(file);
        hash.update(readFileSync(join(out, file)));
      }
      const buildId = hash.digest('hex').slice(0, 12);
      const precache = ['./', ...files.filter((file) => file !== 'index.html').map((file) => `./${file}`)];

      const template = readFileSync(resolve(config.root, 'src/sw/service-worker.js'), 'utf8');
      const worker = template.replace('__BUILD_ID__', buildId).replace("'__PRECACHE__'", JSON.stringify(precache));
      if (worker === template || worker.includes('__PRECACHE__')) {
        throw new Error('The service worker template is missing its placeholders.');
      }
      writeFileSync(workerPath, worker);
      console.log(`Service worker: build ${buildId}, ${precache.length} files kept for offline use`);
    },
  };
}
