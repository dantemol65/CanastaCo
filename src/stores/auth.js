// stores/auth.js
// Store central de autenticación y navegación

import { writable, get } from 'svelte/store'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as _signOut
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from 'firebase/firestore'
import { auth, googleProvider, db } from '../lib/firebase.js'

// ── Stores públicos ───────────────────────────────────────────────────────────

/** 'loading' | 'login' | 'perfil' | 'home' */
export const currentPage = writable('loading')

/** Usuario de Firebase Auth */
export const currentUser = writable(null)

/** Perfil guardado en Firestore */
export const userProfile = writable(null)

/** Mensaje de error para mostrar en UI */
export const authError = writable(null)

// ── Inicialización ────────────────────────────────────────────────────────────

/**
 * Llamar una vez al inicio de la app.
 * Maneja el resultado de redirect y escucha cambios de sesión.
 */
export async function initAuth() {
  // Manejar resultado de redirect (si el usuario volvió de Google)
  try {
    const result = await getRedirectResult(auth)
    if (result?.user) {
      await _handleAfterLogin(result.user)
    }
  } catch (err) {
    console.error('getRedirectResult error:', err)
    authError.set('Error al iniciar sesión. Por favor intentá de nuevo.')
  }

  // Listener persistente de sesión
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser.set(user)
      try {
        const profile = await _fetchProfile(user.uid)
        if (profile) {
          userProfile.set(profile)
          _updateLastAccess(user.uid)
          currentPage.set('home')
        } else {
          currentPage.set('perfil')
        }
      } catch {
        // Sin conexión: usar caché de Firestore (IndexedDB)
        const cached = get(userProfile)
        currentPage.set(cached ? 'home' : 'perfil')
      }
    } else {
      currentUser.set(null)
      userProfile.set(null)
      currentPage.set('login')
    }
  })
}

// ── Acciones de Auth ──────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  authError.set(null)
  try {
    // Popup primero (mejor UX desktop/Android Chrome)
    const result = await signInWithPopup(auth, googleProvider)
    await _handleAfterLogin(result.user)
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      // Fallback: redirect (iOS Safari, otros)
      await signInWithRedirect(auth, googleProvider)
    } else if (err.code !== 'auth/popup-closed-by-user') {
      console.error('signInWithGoogle error:', err)
      authError.set('No se pudo conectar con Google. Verificá tu conexión e intentá de nuevo.')
    }
  }
}

export async function signOut() {
  await _signOut(auth)
  currentUser.set(null)
  userProfile.set(null)
  currentPage.set('login')
}

// ── Perfil ────────────────────────────────────────────────────────────────────

export async function saveUserProfile(data) {
  const user = get(currentUser)
  if (!user) throw new Error('Usuario no autenticado')

  const profile = {
    uid:       user.uid,
    email:     user.email,
    foto:      data.foto || user.photoURL || '',
    alias:     data.alias.trim(),
    provincia: data.provincia,
    departamento: data.departamento,
    localidad: data.localidad,
    barrio:    data.barrio.trim(),
    creado:    serverTimestamp(),
    ultimoAcceso: serverTimestamp(),
  }

  await setDoc(doc(db, 'usuarios', user.uid), profile)
  userProfile.set(profile)
  currentPage.set('home')
}

export async function updateUserProfile(data) {
  const user = get(currentUser)
  if (!user) throw new Error('Usuario no autenticado')

  const updates = {
    alias:        data.alias?.trim(),
    provincia:    data.provincia,
    departamento: data.departamento,
    localidad:    data.localidad,
    barrio:       data.barrio?.trim(),
    ultimoAcceso: serverTimestamp(),
  }

  await updateDoc(doc(db, 'usuarios', user.uid), updates)
  userProfile.update(p => ({ ...p, ...updates }))
}

// ── Helpers internos ──────────────────────────────────────────────────────────

async function _fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid))
  return snap.exists() ? snap.data() : null
}

async function _handleAfterLogin(user) {
  currentUser.set(user)
  try {
    const profile = await _fetchProfile(user.uid)
    if (profile) {
      userProfile.set(profile)
      _updateLastAccess(user.uid)
      currentPage.set('home')
    } else {
      currentPage.set('perfil')
    }
  } catch {
    currentPage.set('perfil')
  }
}

function _updateLastAccess(uid) {
  updateDoc(doc(db, 'usuarios', uid), { ultimoAcceso: serverTimestamp() }).catch(() => {})
}
