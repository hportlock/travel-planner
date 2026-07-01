import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Travel Plan',
        short_name: 'TripPlan',
        display: 'standalone',
        theme_color: '#ff8a5b',
        background_color: '#fbf1dd',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // The SPA navigation fallback serves index.html for navigations so
        // client-side routes work offline. Exclude server-handled paths — the
        // OAuth authorization server, the MCP endpoint, discovery metadata, and
        // the API — so navigating to them reaches the server instead of the SPA
        // shell. Without this, an installed service worker answers /authorize
        // with index.html (which has no such route) → a blank page mid-OAuth.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/mcp(\/|$)/,
          /^\/authorize(\/|$)/,
          /^\/token(\/|$)/,
          /^\/register(\/|$)/,
          /^\/revoke(\/|$)/,
          /^\/\.well-known\//,
        ],
        runtimeCaching: [
          {
            // NetworkFirst (not StaleWhileRevalidate): owners edit these reads and
            // re-fetch right after a mutation, so they must get the fresh response
            // immediately when online. StaleWhileRevalidate served the previous
            // (stale) copy and only refreshed the cache for the *next* request,
            // making reorders/additions appear one reload late. We still fall back
            // to the cache when offline for PWA support.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/shared/') || url.pathname.startsWith('/api/trips/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: { cacheName: 'trip-reads' },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'POST',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@travel-plan/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
