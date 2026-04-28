import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    origin: 'https://openrmm.derfwins.com',
    hmr: {
      protocol: 'wss',
      host: 'openrmm.derfwins.com',
      clientPort: 443,
    },
    proxy: {
      '/v2': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/agents': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/clients': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/scripts': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/alerts': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/checks': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/accounts': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/core': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/winupdate': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/software': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://openrmm-backend:8000',
        ws: true,
        changeOrigin: true,
      },
      '/audit': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/mesh/api': {
        target: 'http://openrmm-backend:8000',
        changeOrigin: true,
      },
      '/mesh': {
        target: 'http://openrmm-meshcentral:4430',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/mesh/, ''),
      },
      '/meshws': {
        target: 'ws://openrmm-meshcentral:4430',
        ws: true,
        secure: false,
        changeOrigin: true,
      },
    },
  },
})