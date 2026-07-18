import { BedDouble } from 'lucide-react'

export default function BedBoard({ wards, admissions, onBedClick }) {
  if (wards.length === 0) {
    return (
      <div className="empty-state">
        No wards configured yet. Facility admin can add wards and beds from the "Wards Setup" tab.
      </div>
    )
  }

  return (
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
                  const admission = bed.admissionId
                    ? admissions.find((a) => a.id === bed.admissionId)
                    : null
                  const isOccupied = bed.status === 'occupied'
                  return (
                    <div
                      key={bed.id}
                      className={`bed-tile ${isOccupied ? 'bed-occupied' : 'bed-vacant'}`}
                      onClick={() => isOccupied && bed.admissionId && onBedClick(bed.admissionId)}
                      title={isOccupied ? `${admission?.patientName || 'Occupied'} — click to open` : 'Vacant'}
                    >
                      <BedDouble size={18} />
                      <span className="bed-name">{bed.name}</span>
                      <span className="bed-status-label">
                        {isOccupied ? (admission?.patientName || 'Occupied') : 'Vacant'}
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
  )
}
