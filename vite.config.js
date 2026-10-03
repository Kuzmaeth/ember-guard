import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Build id shown on the hub and written to dist/version.json, so a cached copy can tell a newer build is live.
let sha = (process.env.GITHUB_SHA || '').slice(0, 7);
if (!sha) { try { sha = execSync('git rev-parse --short HEAD').toString().trim(); } catch (e) { sha = 'dev'; } }
const BUILD = sha + ' ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [{ name: 'version-json', apply: 'build', closeBundle() { fs.writeFileSync(path.resolve('dist', 'version.json'), JSON.stringify({ build: BUILD })); } }],
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  server: { port: Number(process.env.PORT) || 5173 },
});
