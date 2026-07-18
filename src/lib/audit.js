import { supabase } from './supabase'

// Append-only audit trail. One row per log entry under the facility's auditLog collection.
export async function writeAuditLog(facilityId, {
  action,
  module,
  entityType = null,
  entityId = null,
  description = null,
  before = null,
  after = null,
  performedBy,
}) {
  if (!supabase || !facilityId) return

  // performedBy may be a string (name/email) or a { uid, name, role } object.
  const actor = typeof performedBy === 'string'
    ? { uid: null, name: performedBy, role: 'unknown' }
    : {
        uid: performedBy?.uid || null,
        name: performedBy?.name || 'Unknown',
        role: performedBy?.role || 'unknown',
      }

  const id = 'log' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const path = `facilities/${facilityId}/auditLog/${id}`
  const logEntry = {
    action, module, entityType, entityId, description,
    before, after, performedBy: actor, timestamp: Date.now(),
  }

  try {
    await supabase.from('documents').insert({
      path,
      collection: `facilities/${facilityId}/auditLog`,
      facility_id: facilityId,
      data: logEntry,
    })
  } catch (err) {
    // Never let an audit failure break the primary write.
    console.error('Audit log write failed:', err)
  }
}
