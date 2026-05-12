// stores/comercios.js
import { writable, get } from 'svelte/store'
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, serverTimestamp, arrayUnion, increment
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { currentUser } from './auth.js'
import { distanciaKm } from '../lib/geolocation.js'
import { generarCodigo, hashearCodigo, verificarCodigo } from '../lib/credencial.js'
import { crearNotificacion } from './notificaciones.js'

const ADMIN_UID = 'CPDF0lCYKgf3dvoDX5YSC94r2Tm1'

async function notificarAdmin(tipo, titulo, mensaje, datos = {}) {
  try {
    await crearNotificacion({ destinatario: ADMIN_UID, tipo, titulo, mensaje, datos })
  } catch (e) {
    console.error('notificarAdmin:', e)
  }
}

async function notificarUsuario(uid, tipo, titulo, mensaje, datos = {}) {
  try {
    await crearNotificacion({ destinatario: uid, tipo, titulo, mensaje, datos })
  } catch (e) {
    console.error('notificarUsuario:', e)
  }
}

// ── Caché offline ────────────────────────────────────────────────────────

function saveCacheComerciosLocal(localidadId, lista) {
  try {
    localStorage.setItem(
      'canastaco_comercios_' + localidadId,
      JSON.stringify({ ts: Date.now(), lista })
    )
  } catch {}
}

function loadCacheComerciosLocal(localidadId) {
  try {
    const raw = localStorage.getItem('canastaco_comercios_' + localidadId)
    if (!raw) return null
    const { ts, lista } = JSON.parse(raw)
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return null  // 7 días
    return lista
  } catch { return null }
}

export const comercios         = writable([])
export const comercioActivo    = writable(null)
export const cargandoComercios = writable(false)
export const errorComercios    = writable(null)

// ── Tipos y estados ───────────────────────────────────────────────────────

export const TIPOS_COMERCIO = [
  { id: 'supermercado', label: 'Supermercado', emoji: '🛒' },
  { id: 'verduleria',   label: 'Verdulería',   emoji: '🥬' },
  { id: 'carniceria',   label: 'Carnicería',   emoji: '🥩' },
  { id: 'almacen',      label: 'Almacén',      emoji: '🏪' },
  { id: 'panaderia',    label: 'Panadería',    emoji: '🍞' },
  { id: 'farmacia',     label: 'Farmacia',     emoji: '💊' },
  { id: 'ferreteria',   label: 'Ferretería',   emoji: '🔧' },
  { id: 'kiosco',       label: 'Kiosco',       emoji: '🗞️' },
  { id: 'fiambreria',   label: 'Fiambrería',   emoji: '🧀' },
  { id: 'rotiseria',    label: 'Rotisería',    emoji: '🍗' },
  { id: 'otro',         label: 'Otro',         emoji: '🏬' },
]

export const ESTADOS = {
  pendiente:  { label: 'Pendiente',  color: '#F59E0B', bg: '#FEF3C7' },
  verificado: { label: 'Verificado', color: '#059669', bg: '#D1FAE5' },
  rechazado:  { label: 'Rechazado',  color: '#DC2626', bg: '#FEE2E2' },
}

// ── Cargar comercios de una localidad ─────────────────────────────────────

export async function cargarComerciosPorLocalidad(localidadId) {
  cargandoComercios.set(true)
  errorComercios.set(null)

  // Mostrar caché inmediatamente para que la UI no quede vacía offline
  const cached = loadCacheComerciosLocal(localidadId)
  if (cached) comercios.set(cached)

  try {
    const q = query(
      collection(db, 'comercios'),
      where('localidad', '==', localidadId)
    )
    const snap = await getDocs(q)
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.estado !== 'rechazado')
      .sort((a, b) => {
        if (a.estado === 'verificado' && b.estado !== 'verificado') return -1
        if (b.estado === 'verificado' && a.estado !== 'verificado') return 1
        return (b.reputacion || 0) - (a.reputacion || 0)
      })
    comercios.set(lista)
    saveCacheComerciosLocal(localidadId, lista)
    return lista
  } catch (err) {
    console.error('cargarComerciosPorLocalidad:', err)
    if (!cached) errorComercios.set('Sin conexión — no hay datos guardados para esta localidad.')
    return cached || []
  } finally {
    cargandoComercios.set(false)
  }
}

// ── Cargar un comercio por ID ─────────────────────────────────────────────

export async function cargarComercio(id) {
  try {
    const snap = await getDoc(doc(db, 'comercios', id))
    if (!snap.exists()) return null
    const comercio = { id: snap.id, ...snap.data() }
    comercioActivo.set(comercio)
    return comercio
  } catch (err) {
    console.error('cargarComercio:', err)
    return null
  }
}

// ── Dar de alta un comercio ───────────────────────────────────────────────

export async function altaComercio(data) {
  const user = get(currentUser)
  if (!user) throw new Error('Usuario no autenticado')

  const comercio = {
    nombre:              data.nombre.trim(),
    tipo:                data.tipo,
    direccion:           data.direccion.trim(),
    lat:                 data.lat || null,
    lng:                 data.lng || null,
    provincia:           data.provincia,
    departamento:        data.departamento,
    localidad:           data.localidad,
    descripcion:         data.descripcion?.trim() || '',
    estado:              'pendiente',
    reputacion:          0,
    creadoPor:           user.uid,
    creadoEn:            serverTimestamp(),
    reclamadoPor:        null,
    verificaciones:      [],
    totalVerificaciones: 0,
    intentosFallidos:    0,
  }

  const ref = await addDoc(collection(db, 'comercios'), comercio)

  // Notificar al admin
  await notificarAdmin(
    'comercio_pendiente',
    'Nuevo comercio pendiente',
    `"${comercio.nombre}" fue dado de alta por un usuario y espera verificación.`,
    { comercioId: ref.id, comercioNombre: comercio.nombre }
  )

  return ref.id
}

// ── Verificar un comercio (por usuarios) ─────────────────────────────────

export async function verificarComercio(comercioId) {
  const user = get(currentUser)
  if (!user) throw new Error('Usuario no autenticado')

  const verificacion = {
    uid:       user.uid,
    timestamp: new Date().toISOString(),
    tipo:      'usuario',
  }

  await updateDoc(doc(db, 'comercios', comercioId), {
    verificaciones:      arrayUnion(verificacion),
    totalVerificaciones: increment(1),
  })

  const snap = await getDoc(doc(db, 'comercios', comercioId))
  const data = snap.data()

  // Auto-verificar con 3 confirmaciones
  if (data.totalVerificaciones >= 3 && data.estado === 'pendiente') {
    await updateDoc(doc(db, 'comercios', comercioId), {
      estado:     'verificado',
      reputacion: 50,
    })
    await notificarAdmin(
      'comercio_verificado',
      'Comercio verificado por comunidad',
      `"${data.nombre}" alcanzó 3 verificaciones y fue confirmado automáticamente.`,
      { comercioId }
    )
  }

  const actualizado = { id: snap.id, ...snap.data() }
  comercioActivo.set(actualizado)
  return actualizado
}

// ── Generar credencial (admin) ────────────────────────────────────────────

export async function generarCredencial(comercioId) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const codigoPublico  = generarCodigo(8)
  const codigoPrivado  = generarCodigo(6)
  const hashPrivado    = await hashearCodigo(codigoPrivado)
  const expira         = new Date()
  expira.setDate(expira.getDate() + 30)

  await updateDoc(doc(db, 'comercios', comercioId), {
    codigoPublico,
    codigoPrivadoHash:       hashPrivado,
    codigoExpira:            expira.toISOString(),
    intentosFallidos:        0,
    reclamoBloqueado:        false,
    credencialGeneradaPor:   user.uid,
    credencialGeneradaEn:    serverTimestamp(),
  })

  return { codigoPublico, codigoPrivado }
}

// ── Reclamar comercio con código privado ──────────────────────────────────

const MAX_INTENTOS = 3

export async function reclamarConCodigo(comercioId, codigoIngresado) {
  const user = get(currentUser)
  if (!user) throw new Error('No autenticado')

  const snap = await getDoc(doc(db, 'comercios', comercioId))
  if (!snap.exists()) throw new Error('Comercio no encontrado')
  const data = snap.data()

  if (data.reclamoBloqueado)
    throw new Error('Este comercio está bloqueado. Contactá al administrador.')
  if (data.reclamadoPor)
    throw new Error('Este comercio ya tiene un dueño verificado.')
  if (data.codigoExpira && new Date() > new Date(data.codigoExpira))
    throw new Error('El código expiró. Solicitá una nueva credencial al administrador.')

  const esValido = await verificarCodigo(codigoIngresado, data.codigoPrivadoHash)

  if (!esValido) {
    const intentos  = (data.intentosFallidos || 0) + 1
    const bloqueado = intentos >= MAX_INTENTOS
    await updateDoc(doc(db, 'comercios', comercioId), {
      intentosFallidos: intentos,
      ...(bloqueado && { reclamoBloqueado: true }),
    })
    if (bloqueado) {
      await notificarAdmin(
        'intento_fallido',
        'Comercio bloqueado por intentos fallidos',
        `"${data.nombre}" fue bloqueado tras ${MAX_INTENTOS} intentos fallidos de reclamo.`,
        { comercioId, comercioNombre: data.nombre }
      )
      throw new Error(`Demasiados intentos fallidos. El comercio fue bloqueado. El administrador fue notificado.`)
    }
    throw new Error(`Código incorrecto. Te quedan ${MAX_INTENTOS - intentos} intento${MAX_INTENTOS - intentos !== 1 ? 's' : ''}.`)
  }

  // Código correcto → asociar dueño
  await updateDoc(doc(db, 'comercios', comercioId), {
    reclamadoPor:      user.uid,
    reclamoAprobado:   true,
    reclamoFecha:      serverTimestamp(),
    intentosFallidos:  0,
    estado:            'verificado',
    reputacion:        75,
    codigoPrivadoHash: null,
  })

  await notificarAdmin(
    'reclamo_aprobado',
    'Comercio reclamado exitosamente',
    `"${data.nombre}" fue reclamado por un usuario con credencial válida.`,
    { comercioId, comercioNombre: data.nombre, uid: user.uid }
  )
  await notificarUsuario(
    user.uid,
    'reclamo_aprobado',
    '¡Comercio verificado!',
    `Sos el dueño verificado de "${data.nombre}" en canasta.co.`,
    { comercioId }
  )

  const actualizado = { id: snap.id, ...snap.data(), reclamadoPor: user.uid, estado: 'verificado' }
  comercioActivo.set(actualizado)
  return actualizado
}

// ── Filtrar y ordenar lista local ─────────────────────────────────────────

export function filtrarComercios(lista, { busqueda = '', tipo = '', posicion = null }) {
  let result = [...lista]

  if (busqueda.trim()) {
    const q = busqueda.toLowerCase()
    result = result.filter(c =>
      c.nombre?.toLowerCase().includes(q) ||
      c.direccion?.toLowerCase().includes(q)
    )
  }

  if (tipo) {
    result = result.filter(c => c.tipo === tipo)
  }

  if (posicion) {
    result = result.map(c => ({
      ...c,
      distanciaKm: c.lat && c.lng
        ? distanciaKm(posicion.lat, posicion.lng, c.lat, c.lng)
        : null
    })).sort((a, b) => {
      if (a.distanciaKm === null) return 1
      if (b.distanciaKm === null) return -1
      return a.distanciaKm - b.distanciaKm
    })
  }

  return result
}