import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { viewpointsWriter } from './scripts/vite-plugin-viewpoints-writer.mjs';

export default defineConfig({
  root: 'demo',
  publicDir: '../public',
  plugins: [react(), viewpointsWriter({ file: resolve(__dirname, 'public/viewpoints.json') })],
  resolve: {
    alias: {
      '@chrome': resolve(__dirname, 'src/chrome'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'demo/index.html'),
        old: resolve(__dirname, 'demo/old.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    watch: {
      // Use polling so Vite detects file changes from IDE/tool writes
      // that don't always fire native fs events on macOS.
      usePolling: true,
      interval: 300,
    },
  },
  optimizeDeps: {
    exclude: ['web-ifc']
  },
  assetsInclude: ['**/*.wasm']
});
