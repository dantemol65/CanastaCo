// lib/geolocation.js — Utilidades de geolocalización

/**
 * Obtiene la posición actual del usuario via GPS
 * @returns {Promise<{lat, lng}>}
 */
export function obtenerPosicion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no disponible en este dispositivo'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => {
        if (err.code === 1) reject(new Error('Permiso de ubicación denegado'))
        else if (err.code === 2) reject(new Error('Ubicación no disponible'))
        else reject(new Error('Tiempo de espera agotado'))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

/**
 * Distancia en km entre dos puntos (fórmula de Haversine)
 */
export function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

/**
 * Formatea distancia para mostrar al usuario
 */
export function formatDistancia(km) {
  if (km < 0.1) return 'Muy cerca'
  if (km < 1)   return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/**
 * Abre Google Maps con la dirección del comercio
 */
export function abrirMapa(lat, lng, nombre) {
  const query = lat && lng
    ? `${lat},${lng}`
    : encodeURIComponent(nombre)
  window.open(`https://maps.google.com/?q=${query}`, '_blank')
}