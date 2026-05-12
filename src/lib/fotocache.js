// lib/fotocache.js
// Guarda la URL de la foto en localStorage.
// El Service Worker (Workbox) se encarga de cachear la imagen real.

const KEY = 'canastaco_foto_url'

export function cachearFotoUrl(url) {
  if (!url) return
  try { localStorage.setItem(KEY, url) } catch {}
}

export function cargarFotoCacheada() {
  try { return localStorage.getItem(KEY) || null } catch { return null }
}

export function limpiarFotoCache() {
  try { localStorage.removeItem(KEY) } catch {}
}