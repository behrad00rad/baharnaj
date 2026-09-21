import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pre-bundle chart dependencies before the lazy panel routes are opened.
  optimizeDeps: {
    include: ['recharts'],
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['baharnaj.ir', 'www.baharnaj.ir'],
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
      '/media': { target: proxyTarget, changeOrigin: true },
      '/robots.txt': { target: proxyTarget, changeOrigin: true },
      '/sitemap.xml': { target: proxyTarget, changeOrigin: true },
    },
  },
})
