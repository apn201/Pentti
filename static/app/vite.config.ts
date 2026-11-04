import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom UI is served from a sub path, assets must be relative.
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
