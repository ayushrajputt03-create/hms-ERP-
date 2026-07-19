import { BedDouble } from 'lucide-react'

// Bed status → tile style + label. Missing status is treated as available.
function bedState(status) {
  if (status === 'occupied') return { cls: 'bed-occupied', label: 'Occupied' }
  if (status === 'cleaning') return { cls: 'bed-cleaning', label: 'Cleaning' }
  return { cls: 'bed-vacant', label: 'Available' }
}

export default function BedBoard({ wards, admissions, onOpenAdmission, onAdmit, onClean, canAdmit, canClean }) {
  if (wards.length === 0) {
    return (
      <div className="empty-state">
        No wards configured yet. Facility admin can add wards and beds from the "Wards Setup" tab.
      </div>
    )
  }

  return (
    <div>
      <div className="ward-legend">
        <span><span className="legend-dot legend-vacant" />Available</span>
        <span><span className="legend-dot legend-occupied" />Occupied</span>
        <span><span className="legend-dot legend-cleaning" />Cleaning</span>
      </div>

      <div className="bed-board">
        {wards.map((ward) => {
          const beds = Object.entries(ward.beds || {}).map(([id, b]) => ({ id, ...b }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }))
          const occupied = beds.filter((b) => b.status === 'occupied').length

          return (
            <div key={ward.id} className="ward-section">
              <div className="ward-header">
                <h3>{ward.name}</h3>
                <span className="text-muted">
                  {occupied}/{beds.length} occupied — ₹{ward.ratePerDay || 0}/day
                </span>
              </div>
              {beds.length === 0 ? (
                <p className="text-muted">No beds in this ward.</p>
              ) : (
                <div className="bed-grid">
                  {beds.map((bed) => {
                    const st = bedState(bed.status)
                    const admission = bed.admissionId ? admissions.find((a) => a.id === bed.admissionId) : null
                    const isOccupied = bed.status === 'occupied'
                    const isCleaning = bed.status === 'cleaning'
                    const isAvailable = !bed.status || bed.status === 'vacant'

                    const onClick = () => {
                      if (isOccupied && bed.admissionId) onOpenAdmission(bed.admissionId)
                      else if (isAvailable && canAdmit) onAdmit(ward.id, bed.id)
                      else if (isCleaning && canClean) onClean(ward.id, bed.id, bed.name)
                    }
                    const title = isOccupied ? `${admission?.patientName || 'Occupied'} — click to open`
                      : isCleaning ? (canClean ? 'Cleaning — click to mark available' : 'Cleaning')
                      : (canAdmit ? 'Available — click to admit' : 'Available')

                    return (
                      <div key={bed.id} className={`bed-tile ${st.cls}`} onClick={onClick} title={title}>
                        <BedDouble size={18} />
                        <span className="bed-name">{bed.name}</span>
                        <span className="bed-status-label">
                          {isOccupied ? (admission?.patientName || 'Occupied') : st.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
