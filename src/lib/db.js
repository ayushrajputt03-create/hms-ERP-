import {
  ref, get, set, update, remove, push,
  onValue, query, orderByChild, equalTo,
} from 'firebase/database'
import { db } from './firebase'
import { writeAuditLog } from './audit'

export async function getDocument(path) {
  if (!db) return null
  const snap = await get(ref(db, path))
  if (!snap.exists()) return null
  return { id: snap.key, ...snap.val() }
}

export async function setDocument(path, data, { user, facilityId, audit } = {}) {
  const r = ref(db, path)
  const payload = { ...data, updatedAt: Date.now() }

  if (audit && user && facilityId) {
    const existing = await get(r)
    await set(r, payload)
    await writeAuditLog(facilityId, {
      ...audit,
      before: existing.exists() ? existing.val() : null,
      after: payload,
      performedBy: user,
    })
  } else {
    await set(r, payload)
  }
}

export async function addDocument(collectionPath, data, { user, facilityId, audit } = {}) {
  const listRef = ref(db, collectionPath)
  const newRef = push(listRef)
  const payload = { ...data, createdAt: Date.now(), updatedAt: Date.now() }
  await set(newRef, payload)

  if (audit && user && facilityId) {
    await writeAuditLog(facilityId, {
      ...audit,
      entityId: newRef.key,
      after: payload,
      performedBy: user,
    })
  }

  return newRef.key
}

export async function updateDocument(path, data, { user, facilityId, audit } = {}) {
  const r = ref(db, path)
  const payload = { ...data, updatedAt: Date.now() }

  if (audit && user && facilityId) {
    const existing = await get(r)
    await update(r, payload)
    await writeAuditLog(facilityId, {
      ...audit,
      before: existing.exists() ? existing.val() : null,
      after: payload,
      performedBy: user,
    })
  } else {
    await update(r, payload)
  }
}

export async function deleteDocument(path, { user, facilityId, audit } = {}) {
  const r = ref(db, path)

  if (audit && user && facilityId) {
    const existing = await get(r)
    await remove(r)
    await writeAuditLog(facilityId, {
      ...audit,
      before: existing.exists() ? existing.val() : null,
      performedBy: user,
    })
  } else {
    await remove(r)
  }
}

export async function queryDocuments(path, filters = {}) {
  if (!db) return []
  let q
  if (filters.orderBy && filters.equalTo !== undefined) {
    q = query(ref(db, path), orderByChild(filters.orderBy), equalTo(filters.equalTo))
  } else {
    q = ref(db, path)
  }
  const snap = await get(q)
  if (!snap.exists()) return []
  const val = snap.val()
  return Object.entries(val).map(([key, v]) => ({ id: key, ...v }))
}

export function subscribeToDocument(path, callback) {
  if (!db) { callback(null); return () => {} }
  const r = ref(db, path)
  const unsub = onValue(r, (snap) => {
    callback(snap.exists() ? { id: snap.key, ...snap.val() } : null)
  })
  return unsub
}

export function subscribeToCollection(path, callback) {
  if (!db) { callback([]); return () => {} }
  const r = ref(db, path)
  const unsub = onValue(r, (snap) => {
    if (!snap.exists()) { callback([]); return }
    const val = snap.val()
    callback(Object.entries(val).map(([key, v]) => ({ id: key, ...v })))
  })
  return unsub
}

export async function incrementCounter(counterPath, field = 'value') {
  const r = ref(db, counterPath)
  const snap = await get(r)
  const current = snap.exists() ? (snap.val()[field] || 0) : 0
  const newValue = current + 1
  await update(r, { [field]: newValue })
  return newValue
}

export { db }
