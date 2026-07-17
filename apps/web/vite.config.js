import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      // 'prompt' (not autoUpdate): a new deploy's service worker updates quietly in the background and
      // takes effect on the player's next natural reload — never force-reloads a tab mid-game.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Business of the Year',
        short_name: 'BOTY',
        description: 'Run a trade in Maple Hollow, out-hustle your rivals, and be named Business of the Year.',
        theme_color: '#161a22',
        background_color: '#0c0e13',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the APP SHELL only (JS/CSS/HTML/icons). The media (~185MB of webp/mp4/mp3) is
        // deliberately EXCLUDED here — precaching it would force a huge install download.
        globPatterns: ['**/*.{js,css,html,svg}', 'pwa-*.png', 'apple-touch-icon.png', 'favicon-32.png'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Media: cache-on-demand (CacheFirst) → each asset fetched once, then instant + offline.
            urlPattern: ({ url }) => /\/assets\/.*\.(webp|jpe?g|png|mp4|webm|mp3|ogg|m4a)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'boty-media-v1',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true, // videos use range requests
            },
          },
        ],
      },
    }),
  ],
})
