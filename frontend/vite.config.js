import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built files go to ../static/app so Flask can serve them (no Node needed on the server).
export default defineConfig({
  plugins: [react()],
  base: '/static/app/',
  build: {
    outDir: '../static/app',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    // Firebase registers its Auth component as a module side effect; keep those.
    rolldownOptions: { treeshake: { moduleSideEffects: true } }
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000' }
  }
});
