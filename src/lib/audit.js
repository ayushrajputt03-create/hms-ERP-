import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

export async function writeAuditLog(facilityId, {
  action,
  module,
  entityType,
  entityId,
  description,
  before = null,
  after = null,
  performedBy,
}) {
  if (!db || !facilityId) return

  const logEntry = {
    action,
    module,
    entityType,
    entityId: entityId || null,
    description,
    before,
    after,
    performedBy: {
      uid: performedBy.uid,
      name: performedBy.name || 'Unknown',
      role: performedBy.role || 'unknown',
    },
    timestamp: serverTimestamp(),
  }

  try {
    await addDoc(
      collection(db, 'facilities', facilityId, 'auditLog'),
      logEntry
    )
  } catch (err) {
    console.error('Audit log write failed:', err)
  }
}
