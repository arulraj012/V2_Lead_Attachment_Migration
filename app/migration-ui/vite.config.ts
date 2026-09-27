import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// For local dev via CAP: npm run build:local
// For BTP deployment: npm run build (defaults to production path)
const isCapLocal = process.env.BUILD_FOR_CAP === 'true' || process.env.npm_lifecycle_event === 'build:local';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  // Use /ui/ for local CAP serving, /v2leadattachmentmigration/ for BTP production
  base: isCapLocal ? '/ui/' : '/v2leadattachmentmigration/',
  server: {
    port: 3000,
    proxy: {
      '/migration': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:4004',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Authorization', 'Basic YWRtaW46YWRtaW4=');
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    assetsDir: 'assets',
  },
});
