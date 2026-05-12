import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { validateMiniAppPublicBuildEnv } from '../src/mini-app/miniAppRuntimeConfig.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  validateMiniAppPublicBuildEnv(loadEnv(mode, root, ''));

  return {
    root,
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
    build: {
      outDir: 'dist/mini-app',
      emptyOutDir: true,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        input: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  };
});
