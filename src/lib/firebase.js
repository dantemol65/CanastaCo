// lib/firebase.js
import { initializeApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app  = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db   = getFirestore(app)

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export function googleSignInPopup()       { return signInWithPopup(auth, googleProvider) }
export function googleSignInRedirect()    { return signInWithRedirect(auth, googleProvider) }
export function getGoogleRedirectResult() { return getRedirectResult(auth) }
export function emailSignIn(email, pass)  { return signInWithEmailAndPassword(auth, email, pass) }
export function emailRegister(email, pass){ return createUserWithEmailAndPassword(auth, email, pass) }
export function sendVerificationEmail(user){ return sendEmailVerification(user) }

export { auth, db }
export default app