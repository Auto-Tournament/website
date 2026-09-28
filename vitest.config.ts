import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The console tests run on PGlite (Postgres in WebAssembly), which is CPU-heavy
  // while the files run in parallel: give slow machines room.
  test: { testTimeout: 15_000 },
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('./src/', import.meta.url)),
      // Next resolves this itself; in tests it is a no-op.
      'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)),
    },
  },
});
