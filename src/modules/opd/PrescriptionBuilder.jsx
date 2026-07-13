import { Plus, Trash2 } from 'lucide-react'

const FREQUENCIES = ['Once daily', 'Twice daily', 'Thrice daily', 'Four times daily', 'As needed', 'Before meals', 'After meals', 'At bedtime']
const DURATIONS = ['1 day', '3 days', '5 days', '7 days', '10 days', '14 days', '21 days', '30 days', '60 days', '90 days']

export default function PrescriptionBuilder({ items, onChange }) {
  const addItem = () => {
    onChange([...items, { medicine: '', dosage: '', frequency: 'Twice daily', duration: '5 days', notes: '' }])
  }

  const updateItem = (index, field, value) => {
    const updated = items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    onChange(updated)
  }

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="prescription-builder">
      <div className="prescription-header">
        <h4>Prescription</h4>
        <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>
          <Plus size={14} /> Add Medicine
        </button>
      </div>

      {items.length === 0 && (
        <p className="prescription-empty">No medicines added. Click "Add Medicine" to start.</p>
      )}

      {items.map((item, i) => (
        <div key={i} className="prescription-row">
          <div className="prescription-fields">
            <div className="form-group">
              <label>Medicine *</label>
              <input
                value={item.medicine}
                onChange={(e) => updateItem(i, 'medicine', e.target.value)}
                placeholder="Medicine name"
              />
            </div>
            <div className="form-group">
              <label>Dosage</label>
              <input
                value={item.dosage}
                onChange={(e) => updateItem(i, 'dosage', e.target.value)}
                placeholder="e.g. 500mg, 1 tab"
              />
            </div>
            <div className="form-group">
              <label>Frequency</label>
              <select value={item.frequency} onChange={(e) => updateItem(i, 'frequency', e.target.value)}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Duration</label>
              <select value={item.duration} onChange={(e) => updateItem(i, 'duration', e.target.value)}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input
                value={item.notes}
                onChange={(e) => updateItem(i, 'notes', e.target.value)}
                placeholder="Special instructions"
              />
            </div>
          </div>
          <button type="button" className="btn btn-icon btn-danger" onClick={() => removeItem(i)} title="Remove">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
