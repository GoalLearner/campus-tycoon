import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Dev server only. The render pages under tools/render turn 3D models into
 * sprite sheets in the browser, then post each sheet here to be written under
 * art/source/_rendered (git-ignored, like every other art source).
 *
 * It only answers the PC it runs on, and only writes .png and .json files with
 * plain names inside that one folder.
 */
const NAME = /^[a-z0-9-]+\/[a-z0-9-]+\.(png|json)$/;

export function renderSave(): Plugin {
  return {
    name: 'campus-render-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__render/save', (req, res) => {
        const from = req.socket.remoteAddress ?? '';
        const local = from === '127.0.0.1' || from === '::1' || from === '::ffff:127.0.0.1';
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !local || !NAME.test(name)) {
          res.statusCode = 400;
          res.end('refused');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const file = resolve(server.config.root, 'art/source/_rendered', name);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, Buffer.concat(chunks));
          res.end('saved');
        });
      });
    },
  };
}
