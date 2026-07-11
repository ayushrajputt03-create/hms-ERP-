import { ref, push, set } from 'firebase/database'
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
    timestamp: Date.now(),
  }

  try {
    const logRef = push(ref(db, `facilities/${facilityId}/auditLog`))
    await set(logRef, logEntry)
  } catch (err) {
    console.error('Audit log write failed:', err)
  }
}
