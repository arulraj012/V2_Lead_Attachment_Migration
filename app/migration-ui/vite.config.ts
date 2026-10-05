import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// For local dev via CAP: npm run build:local or build:local:win
// For BTP deployment: npm run build (defaults to production path)
const buildForCap = process.env.BUILD_FOR_CAP?.trim() === 'true';
const isLocalBuild = process.env.npm_lifecycle_event?.includes('local');
const isCapLocal = buildForCap || isLocalBuild;

console.log(`[vite.config] BUILD_FOR_CAP="${process.env.BUILD_FOR_CAP}", npm_lifecycle_event=${process.env.npm_lifecycle_event}, isCapLocal=${isCapLocal}`);

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
