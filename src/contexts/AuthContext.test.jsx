import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDocument, queryDocuments } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  queryDocuments: vi.fn(),
}))

vi.mock('@lib/db', () => ({ getDocument, queryDocuments }))
vi.mock('@lib/supabase', () => ({ isSupabaseConfigured: true }))
vi.mock('@lib/auth', () => ({
  PENDING_SETUP_KEY: 'hms-pending-facility-id',
  onAuthChange: vi.fn(() => vi.fn()),
  readFlag: vi.fn(),
  clearFlag: vi.fn(),
}))

import { findStaffProfile } from './AuthContext'

describe('findStaffProfile', () => {
  beforeEach(() => {
    getDocument.mockReset()
    queryDocuments.mockReset()
  })

  it('restores the deterministic legacy facility after a fresh sign-in', async () => {
    getDocument.mockImplementation(async path => {
      if (path === 'facilities/user-1/staff/user-1') return { role: 'facility_admin', name: 'Ayush' }
      return null
    })

    await expect(findStaffProfile({ uid: 'user-1', email: 'ayush@example.com' })).resolves.toMatchObject({
      uid: 'user-1',
      facilityId: 'user-1',
      role: 'facility_admin',
    })
    expect(queryDocuments).not.toHaveBeenCalled()
    expect(getDocument).toHaveBeenCalledTimes(1)
  })

  it('restores an owner when the staff write was interrupted but the facility index exists', async () => {
    getDocument.mockImplementation(async path => {
      if (path === 'facilityIndex/user-2') return { ownerUid: 'user-2', facilityName: 'City Hospital' }
      return null
    })

    await expect(findStaffProfile({ uid: 'user-2', email: 'owner@example.com' })).resolves.toMatchObject({
      uid: 'user-2',
      facilityId: 'user-2',
      role: 'facility_admin',
    })
    expect(queryDocuments).not.toHaveBeenCalled()
  })
})
