import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// Installing a PWA requires a secure origin. localhost counts as secure, but a LAN
// address does not, so `pnpm dev:https` serves over HTTPS with a self-signed cert.
const useHttps = process.env.VITE_HTTPS === 'true';

// https://vite.dev
export default defineConfig({
  plugins: [
    react(),
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/icon.svg'],
      manifest: {
        id: '/',
        name: 'Customer Portal',
        short_name: 'Customer',
        description: 'Tiles ERP - Customer Portal',
        theme_color: '#0277BD',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
      // Register the service worker in dev too, so install can be tested before release.
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  // host: true binds to 0.0.0.0 so other devices on the LAN can reach the dev server
  server: { host: true, port: 5175, strictPort: false },
  preview: { host: true, port: 5175 },
  build: { outDir: 'dist', sourcemap: true },
});
