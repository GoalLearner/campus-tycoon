import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { buildLabel, finishBuild } from './tools/finish-build';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  // "vite build --mode ios" makes the files that ship inside the iOS app.
  const native = mode === 'ios';

  return {
    // Relative paths, so the build works from any folder on a host and inside the app.
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_LABEL__: JSON.stringify(buildLabel()),
      __NATIVE_BUILD__: JSON.stringify(native),
      // The time-skip panel for testers. Only compiled in when the build asks for it.
      __TESTER_TOOLS__: JSON.stringify(process.env.TESTER_TOOLS === '1'),
    },
    plugins: [finishBuild({ serviceWorker: !native })],
    build: {
      // The app's files go to their own folder, so a web deploy can never pick them up by mistake.
      outDir: native ? 'dist-ios' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 2000,
    },
    server: {
      port: 5183,
      strictPort: true,
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
