import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    charset: 'utf8',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'svelte':   ['svelte', 'svelte/store', 'svelte/transition'],
        }
      }
    }
  },
  resolve: {
    dedupe: ['firebase']
  },
  // ── Servidor de desarrollo ────────────────────────────────────────────────
  // historyApiFallback replica la regla de Netlify (/* → /index.html)
  // Permite probar rutas como /comercio/{id}?dir=...&token=... en local
  // sin hacer deploy. No afecta el build de producción.
  server: {
    historyApiFallback: true,
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mejor Precio',
        short_name: 'Mejor Precio',
        description: 'Encontrá los mejores precios de tu barrio',
        theme_color: '#1B6B3A',
        background_color: '#F7F9F4',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          // ── APIs externas: NUNCA cachear, siempre red directa ─────────────
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/world\.openbeautyfacts\.org\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/world\.openproductsfacts\.org\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/apis\.datos\.gob\.ar\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/api\.qrserver\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          // ── CDN jsPDF: NetworkOnly (igual que otras APIs externas) ─────────
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          // ── Fonts y avatares: CacheFirst ─────────────────────────────────
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/lh[0-9]+\.googleusercontent\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-avatars-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})