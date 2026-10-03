import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  server: { port: Number(process.env.PORT) || 5173 },
});
