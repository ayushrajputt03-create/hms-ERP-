import { supabase } from './supabase'
import { writeAuditLog } from './audit'

// HMS ERP data layer — Supabase Postgres JSONB document store.
// Emulates the Firebase RTDB tree so module code keeps its path-based API:
//   getDocument('facilities/{fid}/patients/{pid}')
//   subscribeToCollection('facilities/{fid}/patients')
// Each record is one row in `documents` keyed by its full path.

const TABLE = 'documents'

function lastSeg(path) {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

function parentPath(path) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

function facilityIdOf(path) {
  const segs = path.split('/')
  if (segs[0] === 'facilities' || segs[0] === 'facilityIndex') return segs[1] || null
  return null
}

function genId() {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function rowToDoc(row) {
  if (!row) return null
  return { id: lastSeg(row.path), ...row.data }
}

export async function getDocument(path) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from(TABLE).select('path,data').eq('path', path).maybeSingle()
  if (error) throw error
  return rowToDoc(data)
}

export async function setDocument(path, data, { user, facilityId, audit } = {}) {
  if (!supabase) return null
  const payload = { ...data, updatedAt: Date.now() }
  let before = null
  if (audit && user && facilityId) before = await getDocument(path)

  const { error } = await supabase.from(TABLE).upsert({
    path,
    collection: parentPath(path),
    facility_id: facilityIdOf(path),
    data: payload,
  }, { onConflict: 'path' })
  if (error) throw error

  if (audit && user && facilityId) {
    await writeAuditLog(facilityId, { ...audit, before, after: payload, performedBy: user })
  }
}

export async function addDocument(collectionPath, data, { user, facilityId, audit } = {}) {
  if (!supabase) return null
  const id = genId()
  const path = `${collectionPath}/${id}`
  const payload = { ...data, createdAt: Date.now(), updatedAt: Date.now() }

  const { error } = await supabase.from(TABLE).insert({
    path,
    collection: collectionPath,
    facility_id: facilityIdOf(path),
    data: payload,
  })
  if (error) throw error

  if (audit && user && facilityId) {
    await writeAuditLog(facilityId, { ...audit, entityId: id, after: payload, performedBy: user })
  }
  return id
}

export async function updateDocument(path, data, { user, facilityId, audit } = {}) {
  if (!supabase) return null

  // Exact row exists → shallow-merge (RTDB update() semantics).
  const { data: existing, error: exErr } = await supabase
    .from(TABLE).select('path,data').eq('path', path).maybeSingle()
  if (exErr) throw exErr

  if (existing) {
    const before = existing.data
    const merged = { ...existing.data, ...data, updatedAt: Date.now() }
    const { error } = await supabase.from(TABLE).update({ data: merged }).eq('path', path)
    if (error) throw error
    if (audit && user && facilityId) {
      await writeAuditLog(facilityId, { ...audit, before, after: merged, performedBy: user })
    }
    return
  }

  // No exact row: the target is a nested value inside an ancestor record
  // (e.g. facilities/{fid}/ipd/wards/{wid}/beds/{bid}). Merge into the nearest
  // existing ancestor's JSONB at the remaining key path.
  const segs = path.split('/')
  for (let i = segs.length - 1; i >= 1; i--) {
    const ancestorPath = segs.slice(0, i).join('/')
    const { data: anc } = await supabase
      .from(TABLE).select('path,data').eq('path', ancestorPath).maybeSingle()
    if (anc) {
      const nestedKeys = segs.slice(i)
      const newData = JSON.parse(JSON.stringify(anc.data || {}))
      let node = newData
      for (let k = 0; k < nestedKeys.length - 1; k++) {
        if (typeof node[nestedKeys[k]] !== 'object' || node[nestedKeys[k]] === null) {
          node[nestedKeys[k]] = {}
        }
        node = node[nestedKeys[k]]
      }
      const leaf = nestedKeys[nestedKeys.length - 1]
      node[leaf] = { ...(node[leaf] || {}), ...data }
      newData.updatedAt = Date.now()
      const { error } = await supabase.from(TABLE).update({ data: newData }).eq('path', ancestorPath)
      if (error) throw error
      return
    }
  }

  // Nothing to merge into → behave like set.
  await setDocument(path, data, { user, facilityId, audit })
}

export async function deleteDocument(path, { user, facilityId, audit } = {}) {
  if (!supabase) return null
  let before = null
  if (audit && user && facilityId) before = await getDocument(path)

  // Remove the record and any descendant records (RTDB remove() drops the subtree).
  const delExact = await supabase.from(TABLE).delete().eq('path', path)
  if (delExact.error) throw delExact.error
  const delSub = await supabase.from(TABLE).delete().like('path', `${path}/%`)
  if (delSub.error) throw delSub.error

  if (audit && user && facilityId) {
    await writeAuditLog(facilityId, { ...audit, before, performedBy: user })
  }
}

export async function queryDocuments(collectionPath, filters = {}) {
  if (!supabase) return []
  let q = supabase.from(TABLE).select('path,data').eq('collection', collectionPath)
  if (filters.orderBy && filters.equalTo !== undefined) {
    q = q.eq(`data->>${filters.orderBy}`, String(filters.equalTo))
  }
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(rowToDoc)
}

export function subscribeToDocument(path, callback) {
  if (!supabase) { callback(null); return () => {} }
  getDocument(path).then(callback).catch(() => callback(null))
  const channel = supabase
    .channel(`doc:${path}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `path=eq.${path}` },
      (payload) => {
        if (payload.eventType === 'DELETE') callback(null)
        else callback(rowToDoc(payload.new))
      })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export function subscribeToCollection(collectionPath, callback) {
  if (!supabase) { callback([]); return () => {} }

  // Maintain a local cache keyed by row path. The initial load fetches the
  // whole collection once; subsequent realtime events patch a single row
  // (O(1)) instead of re-fetching the entire collection on every change.
  const cache = new Map()
  let ready = false
  const emit = () => callback(Array.from(cache.values()))

  const initialLoad = async () => {
    const { data } = await supabase.from(TABLE).select('path,data').eq('collection', collectionPath)
    cache.clear()
    for (const row of data || []) cache.set(row.path, rowToDoc(row))
    ready = true
    emit()
  }
  initialLoad()

  const channel = supabase
    .channel(`coll:${collectionPath}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `collection=eq.${collectionPath}` },
      (payload) => {
        // Before the initial load resolves, that fetch already reflects the
        // latest state, so any early events can be safely ignored.
        if (!ready) return
        if (payload.eventType === 'DELETE') {
          if (payload.old?.path) cache.delete(payload.old.path)
        } else if (payload.new?.path) {
          cache.set(payload.new.path, rowToDoc(payload.new))
        }
        emit()
      })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export async function incrementCounter(counterPath, field = 'value') {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('increment_counter', {
    p_path: counterPath,
    p_field: field,
  })
  if (error) throw error
  return Number(data)
}

// Atomically add `delta` to a numeric field nested inside a record,
// e.g. adjustValue('facilities/{fid}/pharmacy/medicines/{id}/quantity', -2).
export async function adjustValue(path, delta) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('adjust_value', {
    p_path: path,
    p_delta: delta,
  })
  if (error) throw error
  return data == null ? null : Number(data)
}

export { supabase as db }
