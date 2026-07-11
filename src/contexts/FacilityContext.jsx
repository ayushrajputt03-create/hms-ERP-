import { createContext, useState, useEffect } from 'react'
import { subscribeToDocument } from '@lib/db'
import { isFirebaseConfigured } from '@lib/firebase'

export const FacilityContext = createContext(null)

const DEMO_CONFIG = {
  facilityName: 'City Hospital & Diagnostics',
  facilityType: 'multi_specialty',
  address: '42, Civil Lines, Loni',
  city: 'Ghaziabad',
  state: 'Uttar Pradesh',
  phone: '9876543210',
  email: 'info@cityhospital.com',
  gstEnabled: true,
  gstin: '09AAACH7409R1ZZ',
  bedCount: 50,
  uhidPrefix: 'PT',
  invoicePrefix: 'INV',
  modules: {
    dashboard: true,
    patients: true,
    opd: true,
    ipd: true,
    pharmacy: true,
    lab: true,
    billing: true,
    staff: true,
    admin: true,
    reports: true,
  },
  subscription: { plan: 'trial', status: 'trial' },
}

export function FacilityProvider({ facilityId, children }) {
  const [facilityConfig, setFacilityConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setFacilityConfig(DEMO_CONFIG)
      setLoading(false)
      return
    }

    if (!facilityId) {
      setLoading(false)
      return
    }

    const unsubscribe = subscribeToDocument(
      `facilities/${facilityId}/config`,
      (data) => {
        setFacilityConfig(data)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [facilityId])

  const isModuleEnabled = (moduleName) => {
    if (!facilityConfig?.modules) return false
    if (moduleName === 'dashboard' || moduleName === 'admin' || moduleName === 'staff') return true
    return facilityConfig.modules[moduleName] === true
  }

  const value = {
    facilityId,
    facilityConfig,
    loading,
    isModuleEnabled,
  }

  return <FacilityContext.Provider value={value}>{children}</FacilityContext.Provider>
}
