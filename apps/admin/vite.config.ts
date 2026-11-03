import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { strict: true },proxy:{'/api':{target:'http://127.0.0.1:8794'},'/__local-test':{target:'http://127.0.0.1:8794'}} },
  preview: { host: '127.0.0.1', port: 5176, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], restoreMocks: true },
});
