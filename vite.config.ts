import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the built site works from any folder on a static host.
  base: './',
  build: {
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
});
