// stores/notificaciones.js — Sistema de notificaciones in-app
import { writable, get } from 'svelte/store'
import {
  collection, doc, addDoc, updateDoc, getDocs,
  query, where, orderBy, serverTimestamp, writeBatch
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { currentUser } from './auth.js'

export const notificaciones     = writable([])
export const totalNoLeidas      = writable(0)
export const cargandoNotifs     = writable(false)

// ── Tipos de notificación ─────────────────────────────────────────────────

export const TIPOS_NOTIF = {
  comercio_pendiente:   { icono: '🏪', label: 'Nuevo comercio pendiente' },
  reclamo_pendiente:    { icono: '🔑', label: 'Reclamo pendiente' },
  comercio_verificado:  { icono: '✅', label: 'Comercio verificado' },
  reclamo_aprobado:     { icono: '🎉', label: 'Reclamo aprobado' },
  reclamo_rechazado:    { icono: '❌', label: 'Reclamo rechazado' },
  intento_fallido:      { icono: '⚠️', label: 'Intentos fallidos de reclamo' },
  nuevo_usuario:        { icono: '👤', label: 'Nuevo usuario registrado' },
  solicitud_cubierta:   { icono: '🛒', label: 'Pedido cubierto por la comunidad' },
}

// ── Cargar notificaciones del usuario ─────────────────────────────────────

export async function cargarNotificaciones() {
  const user = get(currentUser)
  if (!user) return

  cargandoNotifs.set(true)
  try {
    // Query simple por destinatario — sin orderBy para evitar índice compuesto
    const q = query(
      collection(db, 'notificaciones'),
      where('destinatario', '==', user.uid)
    )
    const snap = await getDocs(q)
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        // Ordenar por fecha descendente del lado del cliente
        const ta = a.creadaEn?.toDate?.() || new Date(a.creadaEn || 0)
        const tb = b.creadaEn?.toDate?.() || new Date(b.creadaEn || 0)
        return tb - ta
      })
    notificaciones.set(lista)
    totalNoLeidas.set(lista.filter(n => !n.leida).length)
  } catch (err) {
    console.error('cargarNotificaciones:', err)
  } finally {
    cargandoNotifs.set(false)
  }
}

// ── Marcar como leída ─────────────────────────────────────────────────────

export async function marcarLeida(notifId) {
  await updateDoc(doc(db, 'notificaciones', notifId), { leida: true })
  notificaciones.update(lista =>
    lista.map(n => n.id === notifId ? { ...n, leida: true } : n)
  )
  totalNoLeidas.update(n => Math.max(0, n - 1))
}

export async function marcarTodasLeidas() {
  const user  = get(currentUser)
  const lista = get(notificaciones)
  const noLeidas = lista.filter(n => !n.leida)
  if (!noLeidas.length) return

  const batch = writeBatch(db)
  noLeidas.forEach(n => {
    batch.update(doc(db, 'notificaciones', n.id), { leida: true })
  })
  await batch.commit()

  notificaciones.update(lista => lista.map(n => ({ ...n, leida: true })))
  totalNoLeidas.set(0)
}

// ── Crear notificación (llamado desde stores del server-side / admin) ──────

export async function crearNotificacion({ destinatario, tipo, titulo, mensaje, datos = {} }) {
  await addDoc(collection(db, 'notificaciones'), {
    destinatario,
    tipo,
    titulo,
    mensaje,
    datos,
    leida:     false,
    creadaEn:  serverTimestamp(),
  })
}