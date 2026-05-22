// stores/auth.js
import { writable, get } from 'svelte/store'
import { onAuthStateChanged, signOut as _signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleSignInPopup, googleSignInRedirect, getGoogleRedirectResult, emailSignIn } from '../lib/firebase.js'
import { cachearFotoUrl, cargarFotoCacheada, limpiarFotoCache } from '../lib/fotocache.js'
import { detenerListenerNotificaciones } from './notificaciones.js'

const CACHE_KEY   = 'canastaco_profile'
const PENDING_KEY = 'canastaco_pending_profile'

export const currentPage    = writable('loading')
export const currentUser    = writable(null)
export const userProfile    = writable(null)
export const authError      = writable(null)
export const pendingSync    = writable(false)  // true si hay cambios sin sincronizar
export const usuarioBloqueado   = writable(false)
export const usuarioSuspendido  = writable(false)

// ── Cache local ───────────────────────────────────────────────────────────

function saveProfileCache(profile) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(profile)) } catch {}
}
function loadProfileCache() {
  try {
    const p = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (!p) return null
    // Migración: IDs viejos (AR-A) → nuevo sistema georef (numérico)
    // Si el ID de provincia empieza con 'AR-', el perfil es del sistema viejo → descartar
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
    // Suspendido puede ver pero no actuar — se muestra aviso en Home
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

      // Si hay cambios pendientes, intentar sincronizar ahora
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
          // Puede haber perfil en caché (guardado offline)
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
        // Sin conexión: usar caché local
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

// ── Perfil ────────────────────────────────────────────────────────────────

export async function saveUserProfile(data) {
  const user = get(currentUser)
  if (!user) throw new Error('Usuario no autenticado')

  const perfilActual = get(userProfile)

  const profile = {
    uid:          user.uid,
    email:        user.email,
    foto:         data.foto || (user.photoURL
                    ? user.photoURL.replace(/=s\d+-c$/, '') + '=s96-c'
                    : '') || '',
    alias:        data.alias.trim(),
    provincia:    data.provincia,
    departamento: data.departamento,
    localidad:    data.localidad,
    barrio:       data.barrio.trim(),
    creado:       perfilActual?.creado || new Date().toISOString(),
    ultimoAcceso: new Date().toISOString(),
    // Preservar rol y estado existentes — si no tiene, usar valores por defecto
    rol:          perfilActual?.rol    || 'usuario',
    estado:       perfilActual?.estado || 'activo',
    reputacion:   perfilActual?.reputacion ?? 0,
  }

  // 1. Guardar siempre en localStorage (funciona offline)
  saveProfileCache(profile)
  userProfile.set(profile)

  // 2. Intentar sincronizar con Firestore solo si hay conexión
  if (!navigator.onLine) {
    savePending(profile)
    pendingSync.set(true)
  } else {
    try {
      await setDoc(doc(db, 'usuarios', user.uid), {
        ...profile,
        ultimoAcceso: serverTimestamp(),
      })
      clearPending()
      pendingSync.set(false)
    } catch {
      savePending(profile)
      pendingSync.set(true)
    }
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

  // Verificar que el token del usuario sigue siendo válido
  // (puede estar eliminado de Auth pero con sesión cacheada en el browser)
  try {
    await user.getIdToken(true)  // true = forzar refresco del token
  } catch (tokenErr) {
    // Token inválido → usuario eliminado o sesión expirada
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
      // Usuario nuevo o perfil eliminado → limpiar caché viejo y crear perfil
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