import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// Installing a PWA requires a secure origin. localhost counts as secure, but a LAN
// address does not, so `pnpm dev:https` serves over HTTPS with a self-signed cert.
const useHttps = process.env.VITE_HTTPS === 'true';

/**
 * The installed app's name, fixed at build time.
 *
 * The `app.name` setting cannot reach this. A browser reads the web app manifest when
 * the app is installed and then stores the name and icon with the home-screen entry —
 * so changing a database row afterwards renames nothing on anyone's phone. The same
 * goes for `public/icons/*`: those files ARE the installed icon.
 *
 * Set VITE_APP_NAME at build time to brand a deployment (docker/web.Dockerfile passes
 * it through as a build arg). Renaming after people have installed the app requires
 * them to remove it and add it again.
 */
const appName = process.env.VITE_APP_NAME?.trim() || 'Tiles ERP';
/** Home-screen labels get truncated past ~12 characters on most launchers. */
const appShortName = process.env.VITE_APP_SHORT_NAME?.trim() || appName;

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
        name: appName,
        short_name: appShortName,
        description: `${appName} — administration`,
        theme_color: '#3A57E8',
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
          // A separate file, not the same one reused. Android crops a maskable icon to
          // a circle or squircle and only guarantees the centre 80%, so this one holds
          // the artwork further in; using the 'any' icon here clips its edges.
          {
            src: 'icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Workbox refuses to precache a file over 2 MiB by default, and the app bundle is
        // past that. Leaving it uncached would mean the shell fetches on every cold start,
        // which is exactly what offline support is meant to avoid — a counter on a bad
        // connection would be left staring at a blank page. Raised deliberately; if this
        // needs raising again the answer is route-level code splitting, not a bigger number.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
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
  server: { host: true, port: 5173, strictPort: false },
  preview: { host: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
});
