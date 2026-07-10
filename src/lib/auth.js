import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from './firebase'

const googleProvider = isFirebaseConfigured ? new GoogleAuthProvider() : null

export function onAuthChange(callback) {
  if (!isFirebaseConfigured || !auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, callback)
}

export async function signInWithEmail(email, password) {
  if (!auth) throw new Error('Firebase not configured')
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signUpWithEmail(email, password, displayName) {
  if (!auth) throw new Error('Firebase not configured')
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName) {
    await updateProfile(credential.user, { displayName })
  }
  return credential
}

export async function signInWithGoogle() {
  if (!auth || !googleProvider) throw new Error('Firebase not configured')
  return signInWithPopup(auth, googleProvider)
}

export async function resetPassword(email) {
  if (!auth) throw new Error('Firebase not configured')
  return sendPasswordResetEmail(auth, email)
}

export async function signOut() {
  if (!auth) return
  return firebaseSignOut(auth)
}

export function readableAuthError(code) {
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account already exists with this email.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/invalid-credential': 'Invalid credentials. Please check and try again.',
  }
  return map[code] || 'An unexpected error occurred. Please try again.'
}
