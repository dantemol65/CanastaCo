// stores/precios.js — Módulo 3: Precios
import { writable, get } from 'svelte/store'
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, serverTimestamp, arrayUnion, increment
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { currentUser } from './auth.js'

// ── Stores ────────────────────────────────────────────────────────────────

export const productos       = writable([])
export const preciosComercio = writable([])
export const listas          = writable([])
export const cargandoPrecios = writable(false)
export const errorPrecios    = writable(null)

// ── Catálogos ─────────────────────────────────────────────────────────────

export const CATEGORIAS = [
  { id: 'almacen',    label: 'Almacén',    emoji: '🥫' },
  { id: 'lacteos',    label: 'Lácteos',    emoji: '🥛' },
  { id: 'carnes',     label: 'Carnes',     emoji: '🥩' },
  { id: 'verduras',   label: 'Verduras',   emoji: '🥬' },
  { id: 'frutas',     label: 'Frutas',     emoji: '🍎' },
  { id: 'panaderia',  label: 'Panadería',  emoji: '🍞' },
  { id: 'limpieza',   label: 'Limpieza',   emoji: '🧹' },
  { id: 'higiene',    label: 'Higiene',    emoji: '🧴' },
  { id: 'bebidas',    label: 'Bebidas',    emoji: '🥤' },
  { id: 'congelados', label: 'Congelados', emoji: '🧊' },
  { id: 'fiambreria', label: 'Fiambrería', emoji: '🧀' },
  { id: 'otros',      label: 'Otros',      emoji: '📦' },
]

export const UNIDADES = [
  { id: 'kg',   label: 'kg'    },
  { id: 'g',    label: 'g'     },
  { id: 'L',    label: 'L'     },
  { id: 'ml',   label: 'ml'    },
  { id: 'u',    label: 'unid.' },
  { id: 'pack', label: 'pack'  },
  { id: 'dz',   label: 'doc.'  },
]

// ── Días hasta considerar un precio "desactualizado" ──────────────────────
const DIAS_FRESCO  = 7
const DIAS_VALIDO  = 30
const MAX_REPORTES = 3

// ── Estrategia de caché por capas ─────────────────────────────────────────
//
// Capa 1 — Comercios de la localidad     → en stores/comercios.js (7 días) ✓
// Capa 2 — Precios de últimos comercios  → 2 horas, máx 3 comercios
// Capa 3 — Catálogo de productos         → NO se cachea (solo online)
// Comparador                             → solo online
//
// Historial de comercios visitados: guardamos los últimos 3 IDs
// y limpiamos el caché de los que ya no están en esa lista.

const CACHE_TTL_PRECIOS   = 2 * 60 * 60 * 1000   // 2 horas
const MAX_COMERCIOS_CACHE = 3

// ── Historial de comercios visitados ─────────────────────────────────────

function _getHistorial() {
  try { return JSON.parse(localStorage.getItem('canastaco_historial_c') || '[]') } catch { return [] }
}

function _pushHistorial(comercioId) {
  try {
    const hist = _getHistorial().filter(id => id !== comercioId)
    hist.unshift(comercioId)
    const nuevaLista = hist.slice(0, MAX_COMERCIOS_CACHE)
    localStorage.setItem('canastaco_historial_c', JSON.stringify(nuevaLista))

    // Limpiar caché de comercios que ya no están en el historial
    hist.slice(MAX_COMERCIOS_CACHE).forEach(id => {
      localStorage.removeItem('canastaco_precios_c_' + id)
    })
  } catch {}
}

// ── Cache helpers de precios ──────────────────────────────────────────────

function _preciosCacheGet(comercioId) {
  try {
    const raw = localStorage.getItem('canastaco_precios_c_' + comercioId)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_PRECIOS) {
      localStorage.removeItem('canastaco_precios_c_' + comercioId)
      return null
    }
    return { data, ts }
  } catch { return null }
}

function _preciosCacheSet(comercioId, data) {
  try {
    localStorage.setItem(
      'canastaco_precios_c_' + comercioId,
      JSON.stringify({ ts: Date.now(), data })
    )
    _pushHistorial(comercioId)
  } catch {}
}

export function preciosCacheInfo(comercioId) {
  // Devuelve info del caché para mostrar al usuario (antigüedad)
  try {
    const raw = localStorage.getItem('canastaco_precios_c_' + comercioId)
    if (!raw) return null
    const { ts } = JSON.parse(raw)
    const mins = Math.floor((Date.now() - ts) / 60000)
    if (mins < 60)   return `Datos de hace ${mins} min`
    const hs = Math.floor(mins / 60)
    return `Datos de hace ${hs}h`
  } catch { return null }
}

// ── Productos (catálogo por localidad) — SOLO ONLINE, sin caché ──────────

export async function cargarProductos(localidadId) {
  // Sin caché, solo online
  if (!navigator.onLine) return get(productos)
  // Nunca lanzar si no hay localidad — evita romper Promise.all en Precios.svelte
  if (!localidadId) return get(productos)

  try {
    const q = query(
      collection(db, 'productos'),
      where('localidad', '==', localidadId)
    )
    const snap = await getDocs(q)
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    productos.set(lista)
    return lista
  } catch (err) {
    console.error('cargarProductos:', err)
    return get(productos)
  }
}

/**
 * Busca un producto por nombre normalizado en la lista ya cargada.
 * Si no existe, lo crea en Firestore y lo agrega al store.
 */
export async function buscarOCrearProducto({ nombre, marca, unidad, categoria, localidad }) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const nombreNorm = nombre.trim().toLowerCase()

  // Buscar en store local primero
  const local = get(productos).find(p => p.nombreNorm === nombreNorm)
  if (local) return local

  // Buscar en Firestore
  const q = query(
    collection(db, 'productos'),
    where('localidad', '==', localidad),
    where('nombreNorm', '==', nombreNorm)
  )
  const snap = await getDocs(q)
  if (!snap.empty) {
    const found = { id: snap.docs[0].id, ...snap.docs[0].data() }
    productos.update(l => [...l, found])
    return found
  }

  // Crear nuevo
  const nuevo = {
    nombre:       nombre.trim(),
    nombreNorm,
    marca:        marca?.trim() || '',
    unidad:       unidad || 'u',
    categoria:    categoria || 'otros',
    localidad,
    creadoPor:    user.uid,
    creadoEn:     serverTimestamp(),
    totalPrecios: 0,
  }
  const ref = await addDoc(collection(db, 'productos'), nuevo)
  const conId = { id: ref.id, ...nuevo }
  productos.update(l => [...l, conId].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
  return conId
}

// ── Precios ───────────────────────────────────────────────────────────────

export async function cargarPreciosComercio(comercioId) {
  cargandoPrecios.set(true)
  errorPrecios.set(null)

  // Usar caché de precios (2h, últimos 3 comercios)
  const entry = _preciosCacheGet(comercioId)
  if (entry) preciosComercio.set(entry.data)

  if (!navigator.onLine) {
    cargandoPrecios.set(false)
    if (!entry) errorPrecios.set('Sin conexión — no hay precios guardados para este comercio.')
    return entry?.data || []
  }

  try {
    const q = query(
      collection(db, 'precios'),
      where('comercioId', '==', comercioId),
      where('activo', '==', true)
    )
    const snap = await getDocs(q)
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => !esPrecioVencido(p))
      .sort((a, b) => (a.productoNombre || '').localeCompare(b.productoNombre || '', 'es'))
    preciosComercio.set(lista)
    _preciosCacheSet(comercioId, lista)
    return lista
  } catch (err) {
    console.error('cargarPreciosComercio:', err)
    errorPrecios.set('Error al cargar precios')
    return entry?.data || []
  } finally {
    cargandoPrecios.set(false)
  }
}

export async function cargarPreciosProducto(productoId, localidadId) {
  // Comparador: solo online — datos offline de precios entre comercios
  // pueden estar desactualizados y confundir al usuario
  if (!navigator.onLine) return []
  try {
    const q = query(
      collection(db, 'precios'),
      where('productoId', '==', productoId),
      where('localidad', '==', localidadId),
      where('activo', '==', true)
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => !esPrecioVencido(p))
      .sort((a, b) => (a.precio || 0) - (b.precio || 0))
  } catch (err) {
    console.error('cargarPreciosProducto:', err)
    return []
  }
}

/**
 * Registra un precio nuevo. Desactiva el precio anterior del mismo
 * producto en el mismo comercio.
 * @param {Object} params
 */
export async function registrarPrecio({
  comercioId, comercioNombre, localidad,
  productoId, productoNombre, productoUnidad, productoCategoria,
  precio, esOferta = false, vencimiento = null, listaId = null
}) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const userSnap = await getDoc(doc(db, 'usuarios', user.uid))
  const rol = userSnap.exists() ? (userSnap.data().rol || 'usuario') : 'usuario'

  // Desactivar precios anteriores del mismo producto en este comercio
  const qPrev = query(
    collection(db, 'precios'),
    where('comercioId', '==', comercioId),
    where('productoId', '==', productoId),
    where('activo', '==', true)
  )
  const snapPrev = await getDocs(qPrev)
  await Promise.all(
    snapPrev.docs.map(d =>
      updateDoc(doc(db, 'precios', d.id), {
        activo: false,
        reemplazadoEn: serverTimestamp(),
      })
    )
  )

  // Crear nuevo precio
  const nuevo = {
    comercioId,
    comercioNombre,
    localidad,
    productoId,
    productoNombre,
    productoUnidad:      productoUnidad || 'u',
    productoCategoria:   productoCategoria || 'otros',
    precio:              parseFloat(precio),
    esOferta:            !!esOferta,
    vencimiento:         vencimiento || null,
    listaId:             listaId || null,
    rolCargador:         rol,
    cargadoPor:          user.uid,
    creadoEn:            serverTimestamp(),
    activo:              true,
    reportes:            [],
    totalReportes:       0,
    verificaciones:      [],
    totalVerificaciones: 0,
  }

  const ref = await addDoc(collection(db, 'precios'), nuevo)

  // Actualizar contador en producto
  updateDoc(doc(db, 'productos', productoId), {
    totalPrecios:    increment(1),
    ultimoPrecioEn: serverTimestamp(),
  }).catch(() => {})

  // Invalidar caché del comercio
  try { localStorage.removeItem('canastaco_precios_c_' + comercioId) } catch {}

  return { id: ref.id, ...nuevo }
}

export async function reportarPrecioIncorrecto(precioId) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const snap = await getDoc(doc(db, 'precios', precioId))
  if (!snap.exists()) throw new Error('Precio no encontrado')
  const data = snap.data()

  if (data.reportes?.some(r => r.uid === user.uid))
    throw new Error('Ya reportaste este precio')

  const totalNuevo = (data.totalReportes || 0) + 1
  await updateDoc(doc(db, 'precios', precioId), {
    reportes:      arrayUnion({ uid: user.uid, ts: new Date().toISOString() }),
    totalReportes: totalNuevo,
    ...(totalNuevo >= MAX_REPORTES && {
      activo:               false,
      desactivadoPorReportes: true,
    }),
  })
  return totalNuevo
}

export async function verificarPrecio(precioId) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const snap = await getDoc(doc(db, 'precios', precioId))
  if (!snap.exists()) return
  const data = snap.data()
  if (data.verificaciones?.some(v => v.uid === user.uid)) return

  await updateDoc(doc(db, 'precios', precioId), {
    verificaciones:      arrayUnion({ uid: user.uid, ts: new Date().toISOString() }),
    totalVerificaciones: increment(1),
  })
}

// ── Listas ────────────────────────────────────────────────────────────────

export async function cargarListasLocalidad(localidadId) {
  if (!navigator.onLine) return []
  try {
    const q = query(
      collection(db, 'listas'),
      where('localidad', '==', localidadId),
      where('publicada', '==', true)
    )
    const snap = await getDocs(q)
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.creadaEn?.toDate?.() || new Date(a.creadaEn || 0)
        const tb = b.creadaEn?.toDate?.() || new Date(b.creadaEn || 0)
        return tb - ta
      })
    listas.set(lista)
    return lista
  } catch (err) {
    console.error('cargarListasLocalidad:', err)
    return []
  }
}

export async function crearLista({ nombre, ocasion, vencimiento, localidad, tipo, comercioId }) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const nuevaLista = {
    nombre:      nombre.trim(),
    ocasion:     ocasion?.trim() || '',
    vencimiento: vencimiento || null,
    localidad,
    tipo,           // 'comercio' | 'tematica'
    comercioId:  comercioId || null,
    creadoPor:   user.uid,
    creadaEn:    serverTimestamp(),
    publicada:   false,
    totalItems:  0,
  }

  const ref = await addDoc(collection(db, 'listas'), nuevaLista)
  return { id: ref.id, ...nuevaLista }
}

export async function publicarLista(listaId) {
  await updateDoc(doc(db, 'listas', listaId), {
    publicada:    true,
    publicadaEn: serverTimestamp(),
  })
}

export async function actualizarTotalItems(listaId, total) {
  await updateDoc(doc(db, 'listas', listaId), { totalItems: total })
}

// ── Helpers de estado ─────────────────────────────────────────────────────

export function esPrecioVencido(precio) {
  if (!precio.vencimiento) return false
  return new Date() > new Date(precio.vencimiento)
}

export function freshness(precio) {
  if (!precio.creadoEn) return 'desconocido'
  const fecha = precio.creadoEn?.toDate?.() || new Date(precio.creadoEn)
  const dias  = (Date.now() - fecha.getTime()) / 86400000
  if (dias <= DIAS_FRESCO)  return 'fresco'   // ≤ 7 días
  if (dias <= DIAS_VALIDO)  return 'valido'   // ≤ 30 días
  return 'viejo'                              // > 30 días
}

export function freshnessLabel(precio) {
  const f = freshness(precio)
  if (!precio.creadoEn) return ''
  const fecha = precio.creadoEn?.toDate?.() || new Date(precio.creadoEn)
  const dias  = Math.floor((Date.now() - fecha.getTime()) / 86400000)
  if (f === 'fresco') return dias === 0 ? 'Hoy' : `Hace ${dias}d`
  if (f === 'valido') return `Hace ${dias}d`
  return `Hace +${Math.floor(dias / 30)}m`
}

export function formatPrecio(valor) {
  return new Intl.NumberFormat('es-AR', {
    style:                 'currency',
    currency:              'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor)
}