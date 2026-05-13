// lib/geolocation.js — Utilidades de geolocalización

/**
 * Obtiene la posición actual del usuario via GPS
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
 * Abre Google Maps en las coordenadas dadas
 */
export function abrirMapa(lat, lng, nombre, contexto) {
  let query
  if (lat && lng) {
    query = `${lat},${lng}`
  } else {
    const texto = contexto ? `${nombre}, ${contexto}` : nombre
    query = encodeURIComponent(texto)
  }
  window.open(`https://maps.google.com/?q=${query}`, '_blank')
}

/**
 * Geocodifica una dirección usando Google Geocoding API
 * Requiere VITE_GOOGLE_MAPS_KEY en las variables de entorno
 */
export async function geocodificarDireccion({ direccion, localidad, provincia, pais = 'Argentina' }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY
  if (!apiKey) {
    console.error('geocodificarDireccion: falta VITE_GOOGLE_MAPS_KEY')
    return null
  }

  // Limpiar nombre de localidad (sacar texto entre paréntesis que confunde a Google)
  const localidadLimpia = localidad?.replace(/\s*\(.*?\)/g, '').trim() || ''

  async function googleGeocode(address) {
    const params = new URLSearchParams({
      address,
      key:      apiKey,
      language: 'es',
      region:   'ar',
    })
    const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`)
    const data = await res.json()
    // console.log('[Google Geocoding]', address, '→', data.status)
    if (data.status === 'OK' && data.results.length > 0) return data.results[0]
    return null
  }

  try {
    // ── Intento 1: dirección completa ─────────────────────────────────────
    if (direccion?.trim()) {
      const addr = [direccion.trim(), localidadLimpia, provincia, pais]
                    .filter(Boolean).join(', ')
      const r = await googleGeocode(addr)
      if (r) return {
        lat:         r.geometry.location.lat,
        lng:         r.geometry.location.lng,
        displayName: r.formatted_address,
        aproximado:  false,
      }
    }

    // ── Intento 2: solo localidad + provincia (centro de localidad) ────────
    if (localidadLimpia) {
      const addr2 = [localidadLimpia, provincia, pais].filter(Boolean).join(', ')
      const r2 = await googleGeocode(addr2)
      if (r2) return {
        lat:         r2.geometry.location.lat,
        lng:         r2.geometry.location.lng,
        displayName: r2.formatted_address,
        aproximado:  true,
      }
    }

    return null
  } catch (err) {
    console.error('geocodificarDireccion:', err)
    return null
  }
}