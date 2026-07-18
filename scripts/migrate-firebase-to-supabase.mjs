#!/usr/bin/env node
/**
 * One-time data migration: Firebase RTDB JSON export -> Supabase `documents` table.
 *
 * Firebase and Supabase use different user IDs, so the facility owner's old Firebase
 * UID must be remapped to their new Supabase UID (the owner re-registers once on the
 * new app, then we remap their facility to that new UID).
 *
 * USAGE:
 *   1. Firebase Console -> Realtime Database -> (⋮) -> Export JSON  => save as rtdb-export.json
 *   2. Owner signs up on the new Supabase app; copy their new user id from
 *      Supabase Dashboard -> Authentication -> Users.
 *   3. Set env vars and run:
 *        SUPABASE_URL=... \
 *        SUPABASE_SERVICE_ROLE_KEY=...   (Dashboard -> Project Settings -> API -> service_role)
 *        node scripts/migrate-firebase-to-supabase.mjs rtdb-export.json <oldFacilityId>=<newSupabaseUid> [more maps...]
 *
 *   Example:
 *        node scripts/migrate-firebase-to-supabase.mjs rtdb-export.json \
 *          fZ3k...oldUid=f36c8d4f-22cf-4cf8-b460-0b859aee0463
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [, , exportPath, ...maps] = process.argv
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!exportPath || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing args. See usage header in this file.')
  process.exit(1)
}

// oldFid=newUid, oldFid2=newUid2 ...
const idMap = Object.fromEntries(maps.map((m) => m.split('=')))
const remap = (fid) => idMap[fid] || fid

const root = JSON.parse(readFileSync(exportPath, 'utf8'))
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const rows = []
const facilityIdOf = (path) => {
  const s = path.split('/')
  return (s[0] === 'facilities' || s[0] === 'facilityIndex') ? s[1] || null : null
}
const parentPath = (path) => path.slice(0, path.lastIndexOf('/'))
const push = (path, data) => rows.push({
  path, collection: parentPath(path), facility_id: facilityIdOf(path), data,
})

// Flat collections directly under a facility (children are records).
const FLAT = ['staff', 'patients', 'opdVisits', 'billing', 'counters', 'tariffMaster',
  'doctorSchedules', 'prescriptionTemplates', 'auditLog', 'certificateRequests', 'parents',
  'parentNotifications']
// Grouped collections: facility/<group>/<collection>/<recordId>.
const GROUPS = {
  ipd: ['wards', 'admissions'],
  pharmacy: ['medicines', 'sales', 'purchases', 'stockMovements'],
  lab: ['tests', 'orders', 'samples'],
  opd: ['appointments', 'queue', 'consultations'],
}
// Records that themselves contain a sub-collection (stored as separate rows, not nested).
const RECORD_SUBCOLLECTIONS = { 'ipd/admissions': ['progressNotes'] }

function migrateFacility(oldFid, fdata) {
  const fid = remap(oldFid)

  if (fdata.config) push(`facilities/${fid}/config`, fdata.config)

  for (const coll of FLAT) {
    const node = fdata[coll]
    if (!node) continue
    for (const [id, val] of Object.entries(node)) {
      // remap the owner's staff record id
      const recId = coll === 'staff' ? remap(id) : id
      push(`facilities/${fid}/${coll}/${recId}`, val)
    }
  }

  for (const [group, colls] of Object.entries(GROUPS)) {
    const g = fdata[group]
    if (!g) continue
    for (const coll of colls) {
      const node = g[coll]
      if (!node) continue
      const subKey = `${group}/${coll}`
      const subCols = RECORD_SUBCOLLECTIONS[subKey] || []
      for (const [id, val] of Object.entries(node)) {
        const record = { ...val }
        // Pull out any sub-collections into their own rows.
        for (const sub of subCols) {
          if (record[sub]) {
            for (const [nid, nval] of Object.entries(record[sub])) {
              push(`facilities/${fid}/${group}/${coll}/${id}/${sub}/${nid}`, nval)
            }
            delete record[sub]
          }
        }
        push(`facilities/${fid}/${group}/${coll}/${id}`, record)
      }
    }
  }
}

// Build rows
if (root.facilities) {
  for (const [oldFid, fdata] of Object.entries(root.facilities)) migrateFacility(oldFid, fdata)
}
if (root.facilityIndex) {
  for (const [oldFid, val] of Object.entries(root.facilityIndex)) {
    const fid = remap(oldFid)
    const data = { ...val }
    if (data.ownerUid) data.ownerUid = remap(data.ownerUid)
    push(`facilityIndex/${fid}`, data)
  }
}

console.log(`Prepared ${rows.length} rows. Upserting in batches...`)

let done = 0
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500)
  const { error } = await sb.from('documents').upsert(batch, { onConflict: 'path' })
  if (error) { console.error('Batch failed at', i, error.message); process.exit(1) }
  done += batch.length
  console.log(`  ${done}/${rows.length}`)
}

console.log('Migration complete.')
process.exit(0)
