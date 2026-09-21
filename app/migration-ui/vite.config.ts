import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  base: process.env.NODE_ENV === 'production' ? '/v2leadattachmentmigration/' : './',
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
