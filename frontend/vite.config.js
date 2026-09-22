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
      '/api': { target: proxyTarget },
      '/media': { target: proxyTarget },
      '/robots.txt': { target: proxyTarget },
      '/sitemap.xml': { target: proxyTarget },
    },
  },
})
