import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/dem/copernicus': {
        target: 'https://copernicus-dem-30m.s3.amazonaws.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/dem\/copernicus/, ''),
      },
      '/dem/srtm': {
        target: 'https://s3.amazonaws.com/elevation-tiles-prod',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/dem\/srtm/, ''),
      },
    },
  },
  build: {
    outDir: path.resolve(root, '../runtime'),
    emptyOutDir: true,
  },
});
