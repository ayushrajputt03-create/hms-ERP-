import { createContext, useState, useEffect } from 'react'
import { onAuthChange, PENDING_SETUP_KEY, readFlag, clearFlag } from '@lib/auth'
import { getDocument, queryDocuments } from '@lib/db'
import { isSupabaseConfigured } from '@lib/supabase'

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
    if (!isSupabaseConfigured) {
      setUser(DEMO_USER)
      setStaffProfile(DEMO_STAFF)
      setLoading(false)
      return
    }

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)

        // The database decides whether setup is done, not localStorage.
        //
        // This used to read the pending flag FIRST and return early, never
        // reaching findStaffProfile at all. RegisterPage sets that flag and
        // only the wizard's success path clears it, so any interrupted
        // setup — closed tab, refresh, a throw on the last write — left it
        // behind permanently. From then on every single sign-in was
        // short-circuited into a `pending` profile and bounced to /setup,
        // for a facility that already existed and was fully configured.
        //
        // The flag is also browser-wide, not per-user: one abandoned signup
        // sent every later account on that machine to the wizard too.
        //
        // It is now only a fallback for the genuine case — signed up, no
        // facility built yet — and a real profile always wins over it.
        try {
          const staffDoc = await findStaffProfile(firebaseUser)
          if (staffDoc) {
            // Reaching a real facility proves setup finished. Clear the
            // leftover flag so this cannot recur on the next load.
            clearFlag(PENDING_SETUP_KEY)
            setStaffProfile(staffDoc)
          } else if (readFlag(PENDING_SETUP_KEY)) {
            setStaffProfile({
              uid: firebaseUser.uid,
              facilityId: null,
              role: 'facility_admin',
              name: firebaseUser.displayName || firebaseUser.email,
              email: firebaseUser.email,
              pending: true,
            })
          } else {
            setStaffProfile(null)
          }
        } catch (err) {
          // A lookup failure is not proof that setup is outstanding. Sending
          // the user to the wizard here would invite them to build a second
          // facility over the top of one that may exist perfectly well.
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
