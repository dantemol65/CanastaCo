// stores/config.js — Configuración global de la app (leída desde Firestore)
import { writable, get } from 'svelte/store'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

export const appConfig = writable(null)   // null = no cargado aún

const CONFIG_DOC = 'config/app'

/**
 * Carga la configuración global desde Firestore.
 * Se llama al iniciar la app y desde el panel admin.
 */
export async function cargarConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'app'))
    if (snap.exists()) {
      appConfig.set(snap.data())
    } else {
      // Documento no existe → sin restricciones
      appConfig.set({ restriccionActiva: false, localidadesHabilitadas: [] })
    }
  } catch (e) {
    console.error('cargarConfig:', e)
    appConfig.set({ restriccionActiva: false, localidadesHabilitadas: [] })
  }
}

/**
 * Guarda la configuración global (solo admin).
 */
export async function guardarConfig(config) {
  await setDoc(doc(db, 'config', 'app'), config, { merge: true })
  appConfig.set({ ...get(appConfig), ...config })
}

/**
 * Devuelve las localidades habilitadas si la restricción está activa,
 * o null si no hay restricción (todas habilitadas).
 */
export function getLocalidadesHabilitadas() {
  const cfg = get(appConfig)
  if (!cfg?.restriccionActiva) return null
  return cfg.localidadesHabilitadas || []
}