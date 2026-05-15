// lib/georef.js — Servicio georef API con caché localStorage
// https://apis.datos.gob.ar/georef/api

const BASE = 'https://apis.datos.gob.ar/georef/api'
const CACHE_PREFIX = 'georef_'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 días

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return data
  } catch { return null }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

async function fetchGeoref(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`georef error ${res.status}`)
  return res.json()
}

// ── Provincias (hardcodeadas — 24, nunca cambian, siempre offline) ─────────

export const provincias = [
  { id: '02', nombre: 'Ciudad Autónoma de Buenos Aires' },
  { id: '06', nombre: 'Buenos Aires' },
  { id: '10', nombre: 'Catamarca' },
  { id: '14', nombre: 'Córdoba' },
  { id: '18', nombre: 'Corrientes' },
  { id: '22', nombre: 'Chaco' },
  { id: '26', nombre: 'Chubut' },
  { id: '30', nombre: 'Entre Ríos' },
  { id: '34', nombre: 'Formosa' },
  { id: '38', nombre: 'Jujuy' },
  { id: '42', nombre: 'La Pampa' },
  { id: '46', nombre: 'La Rioja' },
  { id: '50', nombre: 'Mendoza' },
  { id: '54', nombre: 'Misiones' },
  { id: '58', nombre: 'Neuquén' },
  { id: '62', nombre: 'Río Negro' },
  { id: '66', nombre: 'Salta' },
  { id: '70', nombre: 'San Juan' },
  { id: '74', nombre: 'San Luis' },
  { id: '78', nombre: 'Santa Cruz' },
  { id: '82', nombre: 'Santa Fe' },
  { id: '86', nombre: 'Santiago del Estero' },
  { id: '90', nombre: 'Tucumán' },
  { id: '94', nombre: 'Tierra del Fuego' },
]

// ── Departamentos ─────────────────────────────────────────────────────────

export async function getDepartamentos(provinciaId) {
  const cacheKey = `depts_${provinciaId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const data = await fetchGeoref('departamentos', {
    provincia: provinciaId,
    orden: 'nombre',
    max: 250,
    campos: 'id,nombre',
  })

  const result = data.departamentos.map(d => ({ id: d.id, nombre: d.nombre }))
  cacheSet(cacheKey, result)
  return result
}

// ── Localidades ───────────────────────────────────────────────────────────

export async function getLocalidades(departamentoId) {
  const cacheKey = `locs_${departamentoId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const data = await fetchGeoref('localidades', {
    departamento: departamentoId,
    orden: 'nombre',
    max: 200,
    campos: 'id,nombre',
  })

  const result = data.localidades.map(l => ({ id: l.id, nombre: l.nombre }))
  cacheSet(cacheKey, result)
  return result
}

// ── Nombres por ID (para mostrar en UI) ───────────────────────────────────

export function getNombreProvincia(id) {
  if (!id) return ''
  // Normalizar: comparar como string con y sin cero adelante
  const idStr = String(id)
  const idPad = idStr.padStart(2, '0')
  return provincias.find(p => p.id === idStr || p.id === idPad)?.nombre || idStr
}

/**
 * Resuelve un array de IDs de localidad → Map<id, nombre>
 * Usa la API georef con búsqueda por ID y caché localStorage.
 * Ideal para el panel admin donde hay múltiples localidades distintas.
 */
export async function resolverNombresLocalidad(ids = []) {
  const unicos = [...new Set(ids.filter(Boolean))]
  const result = new Map()
  if (!unicos.length) return result

  const pendientes = []

  // Revisar caché individual para cada id
  for (const id of unicos) {
    const cachedNombre = cacheGet(`loc_nombre_${id}`)
    const cachedLabel  = cacheGet(`loc_label_${id}`)
    if (cachedNombre) {
      result.set(id, cachedNombre)
      if (cachedLabel) result.set(`${id}__label`, cachedLabel)
    } else {
      pendientes.push(id)
    }
  }

  if (!pendientes.length) return result

  // Georef permite buscar hasta 100 localidades por lista de IDs
  // Dividir en chunks de 50 para no superar límites
  const chunks = []
  for (let i = 0; i < pendientes.length; i += 50) {
    chunks.push(pendientes.slice(i, i + 50))
  }

  for (const chunk of chunks) {
    try {
      const data = await fetchGeoref('localidades', {
        id:     chunk.join(','),
        campos: 'id,nombre,provincia',
        max:    chunk.length,
      })
      for (const loc of (data.localidades || [])) {
        const nombre     = loc.nombre || String(loc.id)
        const provNombre = loc.provincia?.nombre || ''
        // Guardar solo el nombre (para formatLocalidadProvincia que maneja provincia aparte)
        result.set(String(loc.id), nombre)
        cacheSet(`loc_nombre_${loc.id}`, nombre)
        // Guardar también "localidad / provincia" para el selector del admin
        const conProv = provNombre ? `${nombre} / ${provNombre}` : nombre
        result.set(`${loc.id}__label`, conProv)
        cacheSet(`loc_label_${loc.id}`, conProv)
      }
    } catch {
      // Si falla, usar el ID como fallback
      chunk.forEach(id => result.set(id, id))
    }
  }

  // Fallback para los que no vinieron en la respuesta
  for (const id of pendientes) {
    if (!result.has(id)) result.set(id, id)
  }

  return result
}

/**
 * Formatea localidad + provincia como texto legible.
 * Requiere el Map de resolverNombresLocalidad y el array de provincias.
 */
export function formatLocalidadProvincia(localidadId, provinciaId, nombresMap) {
  const loc  = nombresMap?.get(String(localidadId)) || localidadId || ''
  const prov = getNombreProvincia(provinciaId) || ''
  if (!loc && !prov) return '—'
  if (!prov) return loc
  if (!loc)  return prov
  return `${loc} / ${prov}`
}