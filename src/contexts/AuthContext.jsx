import { createContext, useState, useEffect } from 'react'
import { onAuthChange } from '@lib/auth'
import { getDocument, queryDocuments } from '@lib/db'
import { isFirebaseConfigured } from '@lib/firebase'

export const AuthContext = createContext(null)

const DEMO_USER = {
  uid: 'demo-user',
  email: 'demo@hospital.com',
  displayName: 'Dr. Demo Admin',
}

const DEMO_STAFF = {
  uid: 'demo-user',
  facilityId: 'demo-facility',
  role: 'facility_admin',
  name: 'Dr. Demo Admin',
  email: 'demo@hospital.com',
  department: 'Administration',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [staffProfile, setStaffProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(DEMO_USER)
      setStaffProfile(DEMO_STAFF)
      setLoading(false)
      return
    }

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)

        const pendingFacilityId = localStorage.getItem('hms-pending-facility-id')
        if (pendingFacilityId) {
          setStaffProfile({
            uid: firebaseUser.uid,
            facilityId: pendingFacilityId,
            role: 'facility_admin',
            name: firebaseUser.displayName || firebaseUser.email,
            email: firebaseUser.email,
            pending: true,
          })
          setLoading(false)
          return
        }

        try {
          const staffDoc = await findStaffProfile(firebaseUser)
          setStaffProfile(staffDoc)
        } catch (err) {
          console.error('Failed to load staff profile:', err)
          setStaffProfile(null)
        }
      } else {
        setUser(null)
        setStaffProfile(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const refreshStaffProfile = async () => {
    if (!user || !staffProfile?.facilityId) return
    const doc = await getDocument(
      `facilities/${staffProfile.facilityId}/staff/${user.uid}`
    )
    if (doc) {
      setStaffProfile({
        ...doc,
        uid: user.uid,
        facilityId: staffProfile.facilityId,
      })
    }
  }

  const value = {
    user,
    staffProfile,
    loading,
    refreshStaffProfile,
    setStaffProfile,
    isAuthenticated: !!user,
    isSuperAdmin: user?.email === import.meta.env.VITE_SUPER_ADMIN_EMAIL,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function findStaffProfile(firebaseUser) {
  const indexDocs = await queryDocuments('facilityIndex', {
    orderBy: 'ownerUid',
    equalTo: firebaseUser.uid,
  })

  if (indexDocs.length > 0) {
    const facilityId = indexDocs[0].id
    const staffDoc = await getDocument(`facilities/${facilityId}/staff/${firebaseUser.uid}`)
    if (staffDoc) {
      return { ...staffDoc, uid: firebaseUser.uid, facilityId }
    }
    return {
      uid: firebaseUser.uid,
      facilityId,
      role: 'facility_admin',
      name: firebaseUser.displayName || firebaseUser.email,
      email: firebaseUser.email,
    }
  }

  const allFacilities = await queryDocuments('facilityIndex')
  for (const facility of allFacilities) {
    const staffDoc = await getDocument(`facilities/${facility.id}/staff/${firebaseUser.uid}`)
    if (staffDoc) {
      return { ...staffDoc, uid: firebaseUser.uid, facilityId: facility.id }
    }
  }

  return null
}
