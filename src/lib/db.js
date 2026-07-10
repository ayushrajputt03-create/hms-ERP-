import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, query, where, orderBy, limit, getDocs,
  onSnapshot, serverTimestamp, runTransaction, writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { writeAuditLog } from './audit'

export async function getDocument(path) {
  if (!db) return null
  const snap = await getDoc(doc(db, ...path.split('/')))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function setDocument(path, data, { user, facilityId, audit } = {}) {
  const ref = doc(db, ...path.split('/'))
  const payload = { ...data, updatedAt: serverTimestamp() }

  if (audit && user && facilityId) {
    const existing = await getDoc(ref)
    await setDoc(ref, payload, { merge: true })
    await writeAuditLog(facilityId, {
      ...audit,
      before: existing.exists() ? existing.data() : null,
      after: payload,
      performedBy: user,
    })
  } else {
    await setDoc(ref, payload, { merge: true })
  }
}

export async function addDocument(collectionPath, data, { user, facilityId, audit } = {}) {
  const colRef = collection(db, ...collectionPath.split('/'))
  const payload = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  const docRef = await addDoc(colRef, payload)

  if (audit && user && facilityId) {
    await writeAuditLog(facilityId, {
      ...audit,
      entityId: docRef.id,
      after: payload,
      performedBy: user,
    })
  }

  return docRef.id
}

export async function updateDocument(path, data, { user, facilityId, audit } = {}) {
  const ref = doc(db, ...path.split('/'))
  const payload = { ...data, updatedAt: serverTimestamp() }

  if (audit && user && facilityId) {
    const existing = await getDoc(ref)
    await updateDoc(ref, payload)
    await writeAuditLog(facilityId, {
      ...audit,
      before: existing.exists() ? existing.data() : null,
      after: payload,
      performedBy: user,
    })
  } else {
    await updateDoc(ref, payload)
  }
}

export async function deleteDocument(path, { user, facilityId, audit } = {}) {
  const ref = doc(db, ...path.split('/'))

  if (audit && user && facilityId) {
    const existing = await getDoc(ref)
    await deleteDoc(ref)
    await writeAuditLog(facilityId, {
      ...audit,
      before: existing.exists() ? existing.data() : null,
      performedBy: user,
    })
  } else {
    await deleteDoc(ref)
  }
}

export async function queryDocuments(collectionPath, constraints = []) {
  if (!db) return []
  const colRef = collection(db, ...collectionPath.split('/'))
  const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function subscribeToDocument(path, callback) {
  if (!db) { callback(null); return () => {} }
  return onSnapshot(doc(db, ...path.split('/')), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}

export function subscribeToCollection(collectionPath, callback, constraints = []) {
  if (!db) { callback([]); return () => {} }
  const colRef = collection(db, ...collectionPath.split('/'))
  const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef)
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

export async function incrementCounter(counterPath, field = 'value') {
  const ref = doc(db, ...counterPath.split('/'))
  let newValue
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref)
    const current = snap.exists() ? (snap.data()[field] || 0) : 0
    newValue = current + 1
    transaction.set(ref, { [field]: newValue }, { merge: true })
  })
  return newValue
}

export { where, orderBy, limit, serverTimestamp, writeBatch, runTransaction, db }
