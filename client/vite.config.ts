import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.SERVER_ORIGIN ?? 'http://localhost:3001';

export default defineConfig({
  root: here,
  envDir: resolve(here, '..'),
  resolve: {
    alias: { '@shared': resolve(here, '../shared/src') },
  },
  server: {
    port: 3000,
    // Discord loads the activity through its own proxy, so everything the
    // client calls has to be same-origin. In dev, Vite plays that role.
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/ws': { target: SERVER, ws: true },
    },
    fs: { allow: [resolve(here, '..')] },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        // A reviewable contact sheet of the character art.
        cast: resolve(here, 'cast.html'),
        // Static legal pages for Discord's developer portal fields.
        privacy: resolve(here, 'privacy.html'),
        terms: resolve(here, 'terms.html'),
      },
    },
  },
});
