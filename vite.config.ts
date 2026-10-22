import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Dev-only image shim. Case-study images live on a remote origin (R2 behind
 * the Worker). When VITE_LOCAL_IMAGES=1 the client rewrites that origin to
 * /__local-images/<slug>/<file>, and this middleware answers from the vault's
 * _attachments/<slug>/ folder when the file is there (hash suffixes in the R2
 * name are ignored when matching), or with a dimension-true SVG placeholder
 * from the committed dimensions cache otherwise. Production never sees this:
 * the plugin is `apply: 'serve'`.
 */
function localImages(): Plugin {
  const VAULT_DIR = process.env.VAULT_DIR ?? join(homedir(), 'Dev', 'marliin-vault');
  const dims = JSON.parse(readFileSync(new URL('./src/data/image-dimensions.json', import.meta.url), 'utf8')) as Record<string, { width: number; height: number }>;
  const stripHash = (name: string) => name.replace(/\.[0-9a-f]{8}(?=\.[a-z]+$)/i, '');
  return {
    name: 'local-images',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__local-images', (req, res) => {
        const m = /^\/([a-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(req.url ?? '');
        if (!m) { res.statusCode = 404; res.end(); return; }
        const [, slug, file] = m;
        const dir = join(VAULT_DIR, '_attachments', slug);
        if (existsSync(dir)) {
          const wanted = stripHash(file);
          const hit = readdirSync(dir).find((f) => f === file || stripHash(f) === wanted);
          if (hit) {
            const ext = hit.split('.').pop()!.toLowerCase();
            res.setHeader('content-type', ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
            res.setHeader('cache-control', 'no-store');
            res.end(readFileSync(join(dir, hit)));
            return;
          }
        }
        const key = Object.keys(dims).find((k) => k.endsWith(`/images/${slug}/${file}`)) ?? '';
        const { width = 1600, height = 1000 } = dims[key] ?? {};
        const label = file.replace(/\.[^.]+$/, '').replace(/^\d+[-_]?/, '').replace(/\.[0-9a-f]{8}$/i, '').replace(/[-_]+/g, ' ');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
          `<rect width="100%" height="100%" fill="#ececea"/>` +
          `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#c9c9c6" stroke-width="2"/>` +
          `<line x1="0" y1="0" x2="${width}" y2="${height}" stroke="#d6d6d3" stroke-width="2"/>` +
          `<line x1="${width}" y1="0" x2="0" y2="${height}" stroke="#d6d6d3" stroke-width="2"/>` +
          `<text x="${width / 2}" y="${height / 2}" font-family="monospace" font-size="${Math.round(Math.min(width, height) / 28)}" fill="#6a6a67" text-anchor="middle" dominant-baseline="middle">${label} ${width}x${height}</text></svg>`;
        res.setHeader('content-type', 'image/svg+xml');
        res.setHeader('cache-control', 'no-store');
        res.end(svg);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localImages()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/images': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/data/caseStudies')) return 'studies';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler') || id.includes('node_modules/@remix-run')) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
