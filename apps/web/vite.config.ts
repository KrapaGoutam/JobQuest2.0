import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// envDir points at the repo root so the single .env.local is shared.
// Only VITE_* variables are ever exposed to the browser bundle.
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
  build: { sourcemap: false },
});
