// stores/auth.js
import { writable, get } from 'svelte/store'
import { onAuthStateChanged, signOut as _signOut } from 'firebase/auth'
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, runTransaction,
  collection, query, where, limit, getDocs
} from 'firebase/firestore'
import { auth, db, googleSignInPopup, googleSignInRedirect, getGoogleRedirectResult, emailSignIn } from '../lib/firebase.js'
import { cachearFotoUrl, cargarFotoCacheada, limpiarFotoCache } from '../lib/fotocache.js'
import { detenerListenerNotificaciones } from './notificaciones.js'

const CACHE_KEY   = 'canastaco_profile'
const PENDING_KEY = 'canastaco_pending_profile'

export const currentPage       = writable('loading')
export const currentUser       = writable(null)
export const userProfile       = writable(null)
export const authError         = writable(null)
export const pendingSync       = writable(false)
export const usuarioBloqueado  = writable(false)
export const usuarioSuspendido = writable(false)

// ── Cache local ───────────────────────────────────────────────────────────

function saveProfileCache(profile) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(profile)) } catch {}
}
function loadProfileCache() {
  try {
    const p = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (!p) return null
    // Migración: IDs viejos (AR-A) → nuevo sistema georef (numérico)
    if (p.provincia && p.provincia.startsWith('AR-')) {
      localStorage.removeItem(CACHE_KEY)
      localStorage.removeItem(PENDING_KEY)
      return null
    }
    return p
  } catch { return null }
}
function clearProfileCache() {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}
function savePending(data) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(data)) } catch {}
}
function loadPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY)) } catch { return null }
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY) } catch {}
}

// ── Verificación de estado ───────────────────────────────────────────────

function verificarEstadoUsuario(profile) {
  const estado = profile?.estado || 'activo'
  if (estado === 'bloqueado') {
    usuarioBloqueado.set(true)
    usuarioSuspendido.set(false)
    currentPage.set('bloqueado')
    return false
  }
  if (estado === 'suspendido') {
    usuarioSuspendido.set(true)
    usuarioBloqueado.set(false)
    return true
  }
  usuarioBloqueado.set(false)
  usuarioSuspendido.set(false)
  return true
}

// ── Sincronización ────────────────────────────────────────────────────────

export async function syncPendingProfile() {
  const pending = loadPending()
  const user    = get(currentUser)
  if (!pending || !user || !navigator.onLine) return

  try {
    await setDoc(doc(db, 'usuarios', user.uid), {
      ...pending,
      ultimoAcceso: serverTimestamp(),
    })
    clearPending()
    pendingSync.set(false)
  } catch {
    // Sin conexión todavía, se reintentará la próxima vez
  }
}

// ── Inicialización ────────────────────────────────────────────────────────

export async function initAuth() {
  try {
    const result = await getGoogleRedirectResult()
    if (result?.user) await _handleAfterLogin(result.user)
  } catch (err) {
    console.error('getRedirectResult error:', err)
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser.set(user)

      const pending = loadPending()
      if (pending) {
        pendingSync.set(true)
        await syncPendingProfile()
      }

      try {
        const profile = await _fetchProfile(user.uid)
        if (profile) {
          userProfile.set(profile)
          saveProfileCache(profile)
          _updateLastAccess(user.uid)
          if (verificarEstadoUsuario(profile)) currentPage.set('home')
        } else {
          const cached = loadProfileCache()
          if (cached && cached.uid === user.uid) {
            userProfile.set(cached)
            if (verificarEstadoUsuario(cached)) currentPage.set('home')
          } else {
            clearProfileCache()
            currentPage.set('perfil')
          }
        }
      } catch {
        const cached = loadProfileCache()
        if (cached && cached.uid === user.uid) {
          userProfile.set(cached)
          currentPage.set('home')
        } else {
          currentPage.set('perfil')
        }
      }
    } else {
      currentUser.set(null)
      userProfile.set(null)
      clearProfileCache()
      clearPending()
      pendingSync.set(false)
      currentPage.set('login')
    }
  })
}

// ── Acciones de Auth ──────────────────────────────────────────────────────

export async function signInWithGoogle() {
  authError.set(null)
  try {
    const result = await googleSignInPopup()
    await _handleAfterLogin(result.user)
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      await googleSignInRedirect()
    } else if (err.code !== 'auth/popup-closed-by-user') {
      console.error('signInWithGoogle error:', err)
      authError.set('No se pudo conectar con Google. Verificá tu conexión e intentá de nuevo.')
    }
  }
}

export async function signInWithEmail(email, password) {
  authError.set(null)
  try {
    const result = await emailSignIn(email, password)
    await _handleAfterLogin(result.user)
  } catch (err) {
    const msgs = {
      'auth/user-not-found':     'No existe una cuenta con ese email.',
      'auth/wrong-password':     'Contraseña incorrecta.',
      'auth/invalid-email':      'Email inválido.',
      'auth/invalid-credential': 'Email o contraseña incorrectos.',
      'auth/too-many-requests':  'Demasiados intentos. Esperá unos minutos.',
    }
    authError.set(msgs[err.code] || 'Error al ingresar: ' + err.message)
  }
}

export async function signOut() {
  detenerListenerNotificaciones()
  await _signOut(auth)
  currentUser.set(null)
  userProfile.set(null)
  usuarioBloqueado.set(false)
  usuarioSuspendido.set(false)
  clearProfileCache()
  clearPending()
  limpiarFotoCache()
  pendingSync.set(false)
  currentPage.set('login')
}

// ── Alias — unicidad ──────────────────────────────────────────────────────

/**
 * Normaliza el alias para usarlo como clave en alias_index.
 * Minúsculas, sin espacios al inicio/fin, espacios internos → guión bajo.
 */
export function normalizarAlias(alias) {
  return alias.trim().toLowerCase().replace(/\s+/g, '_')
}

/**
 * Verifica si un alias está disponible para el usuario actual.
 * Devuelve true si está libre o si ya pertenece al mismo UID.
 * Devuelve false si está tomado por otro usuario.
 * Devuelve null si no se puede determinar (sin conexión).
 *
 * Estrategia de doble consulta:
 *  1. Busca en alias_index (índice mantenido por saveUserProfile).
 *  2. Si no está en el índice (usuarios pre-migración), busca en usuarios directamente.
 */
export async function verificarAliasDisponible(alias, uidActual) {
  if (!alias?.trim()) return null
  const clave = normalizarAlias(alias)
  try {
    // 1. Consultar el índice
    const snapIdx = await getDoc(doc(db, 'alias_index', clave))
    if (snapIdx.exists()) {
      return snapIdx.data().uid === uidActual
    }

    // 2. Fallback: buscar en la colección usuarios
    // Cubre a los usuarios registrados antes de que existiera alias_index
    const q    = query(collection(db, 'usuarios'), where('alias', '==', alias.trim()), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return true
    return snap.docs[0].data().uid === uidActual

  } catch {
    // Sin conexión: no podemos verificar — la transacción en saveUserProfile lo atrapará
    return null
  }
}

// ── Perfil ────────────────────────────────────────────────────────────────

export async function saveUserProfile(data) {
  const user = get(currentUser)
  if (!user) throw new Error('Usuario no autenticado')

  const perfilActual = get(userProfile)
  const nuevoAlias   = data.alias.trim()
  const claveNueva   = normalizarAlias(nuevoAlias)
  const claveVieja   = perfilActual?.alias
    ? normalizarAlias(perfilActual.alias)
    : null

  const profile = {
    uid:          user.uid,
    email:        user.email,
    foto:         data.foto || (user.photoURL
                    ? user.photoURL.replace(/=s\d+-c$/, '') + '=s96-c'
                    : '') || '',
    alias:        nuevoAlias,
    provincia:    data.provincia,
    departamento: data.departamento,
    localidad:    data.localidad,
    barrio:       data.barrio.trim(),
    creado:       perfilActual?.creado || new Date().toISOString(),
    ultimoAcceso: new Date().toISOString(),
    rol:          perfilActual?.rol    || 'usuario',
    estado:       perfilActual?.estado || 'activo',
    reputacion:   perfilActual?.reputacion ?? 0,
  }

  // 1. Guardar siempre en localStorage (funciona offline)
  saveProfileCache(profile)
  userProfile.set(profile)

  // 2. Sin conexión: guardar pendiente y salir
  if (!navigator.onLine) {
    savePending(profile)
    pendingSync.set(true)
    currentPage.set('home')
    return
  }

  // 3. Con conexión: transacción atómica para garantizar unicidad del alias
  const refPerfil   = doc(db, 'usuarios',    user.uid)
  const refAliasNew = doc(db, 'alias_index', claveNueva)
  const refAliasOld = (claveVieja && claveVieja !== claveNueva)
    ? doc(db, 'alias_index', claveVieja)
    : null

  try {
    await runTransaction(db, async (tx) => {
      // Verificar que el alias nuevo no esté tomado por otro usuario
      const snapAlias = await tx.get(refAliasNew)
      if (snapAlias.exists() && snapAlias.data().uid !== user.uid) {
        throw new Error('El alias ya está en uso. Elegí otro.')
      }

      // Liberar el alias anterior si el usuario lo cambió
      if (refAliasOld) tx.delete(refAliasOld)

      // Reservar el alias nuevo en el índice
      tx.set(refAliasNew, {
        uid:           user.uid,
        alias:         nuevoAlias,
        actualizadoEn: new Date().toISOString(),
      })

      // Escribir el perfil del usuario
      tx.set(refPerfil, { ...profile, ultimoAcceso: serverTimestamp() })
    })

    clearPending()
    pendingSync.set(false)
  } catch (err) {
    // Revertir el optimistic update en el store si la transacción falló
    if (perfilActual) userProfile.set(perfilActual)
    throw err
  }

  currentPage.set('home')
}

// ── Helpers internos ──────────────────────────────────────────────────────

async function _fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid))
  return snap.exists() ? snap.data() : null
}

async function _handleAfterLogin(user) {
  currentUser.set(user)
  const fotoUrl = user.photoURL
    ? user.photoURL.replace(/=s\d+-c$/, '') + '=s96-c'
    : user.photoURL
  cachearFotoUrl(fotoUrl)

  try {
    await user.getIdToken(true)
  } catch (tokenErr) {
    console.warn('Token inválido, forzando signOut:', tokenErr.code)
    clearProfileCache()
    await _signOut(auth)
    currentUser.set(null)
    userProfile.set(null)
    currentPage.set('login')
    return
  }

  try {
    const profile = await _fetchProfile(user.uid)
    if (profile) {
      userProfile.set(profile)
      saveProfileCache(profile)
      _updateLastAccess(user.uid)
      if (verificarEstadoUsuario(profile)) currentPage.set('home')
    } else {
      clearProfileCache()
      currentPage.set('perfil')
    }
  } catch (err) {
    const cached = loadProfileCache()
    if (cached && cached.uid === user.uid) {
      userProfile.set(cached)
      if (verificarEstadoUsuario(cached)) currentPage.set('home')
    } else {
      clearProfileCache()
      currentPage.set('perfil')
    }
  }
}

function _updateLastAccess(uid) {
  updateDoc(doc(db, 'usuarios', uid), { ultimoAcceso: serverTimestamp() }).catch(() => {})
}