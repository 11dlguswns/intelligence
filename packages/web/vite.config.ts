import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base is the GitHub Pages sub-path. The deploy workflow sets BASE_PATH to
// "/<repo-name>/" automatically; locally it falls back to /intelligence/.
export default defineConfig({
  base: process.env.BASE_PATH || '/intelligence/',
  plugins: [react()],
});
