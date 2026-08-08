import { useMemo, useState, useRef, useEffect } from 'react'
import { checkDrugAllergy } from '@lib/clinical'
import { Plus, Trash2, AlertTriangle, PackageCheck, PackageX } from 'lucide-react'

const FREQUENCIES = ['Once daily', 'Twice daily', 'Thrice daily', 'Four times daily', 'As needed', 'Before meals', 'After meals', 'At bedtime']
const DURATIONS = ['1 day', '3 days', '5 days', '7 days', '10 days', '14 days', '21 days', '30 days', '60 days', '90 days']

export default function PrescriptionBuilder({ items, onChange, medicines = [], stock = {}, allergies = [] }) {
  const addItem = () => {
    onChange([...items, { medicine: '', dosage: '', frequency: 'Twice daily', duration: '5 days', notes: '' }])
  }

  const updateItem = (index, field, value) => {
    onChange(items.map((item, i) => i === index ? { ...item, [field]: value } : item))
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
        <PrescriptionRow
          key={i}
          item={item}
          medicines={medicines}
          stock={stock}
          allergies={allergies}
          onUpdate={(field, value) => updateItem(i, field, value)}
          onRemove={() => removeItem(i)}
        />
      ))}
    </div>
  )
}

function PrescriptionRow({ item, medicines, stock, allergies, onUpdate, onRemove }) {
  const conflicts = useMemo(
    () => checkDrugAllergy(item.medicine, allergies),
    [item.medicine, allergies]
  )

  const matched = useMemo(() => {
    const name = (item.medicine || '').toLowerCase().trim()
    if (!name) return null
    return medicines.find((m) => (m.name || '').toLowerCase().trim() === name) || null
  }, [item.medicine, medicines])

  const available = matched ? (stock[matched.id] || 0) : null

  return (
    <div className={`prescription-row ${conflicts.length ? 'prescription-row-alert' : ''}`}>
      <div className="prescription-fields">
        <div className="form-group">
          <label>Medicine *</label>
          <MedicineAutocomplete
            value={item.medicine}
            medicines={medicines}
            stock={stock}
            onChange={(v) => onUpdate('medicine', v)}
          />
          {matched && (
            <span className={`stock-hint ${available > 0 ? 'stock-hint-ok' : 'stock-hint-out'}`}>
              {available > 0
                ? <><PackageCheck size={11} /> {available} in pharmacy stock</>
                : <><PackageX size={11} /> Out of stock in pharmacy</>}
            </span>
          )}
          {!matched && item.medicine.trim() && (
            <span className="stock-hint stock-hint-unknown">Not in pharmacy catalog</span>
          )}
        </div>
        <div className="form-group">
          <label>Dosage</label>
          <input
            value={item.dosage}
            onChange={(e) => onUpdate('dosage', e.target.value)}
            placeholder="e.g. 500mg, 1 tab"
          />
        </div>
        <div className="form-group">
          <label>Frequency</label>
          <select value={item.frequency} onChange={(e) => onUpdate('frequency', e.target.value)}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Duration</label>
          <select value={item.duration} onChange={(e) => onUpdate('duration', e.target.value)}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <input
            value={item.notes}
            onChange={(e) => onUpdate('notes', e.target.value)}
            placeholder="Special instructions"
          />
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="allergy-conflict">
          <AlertTriangle size={13} />
          <span>
            Patient is allergic to <strong>{conflicts.map((c) => c.allergy).join(', ')}</strong>
            {' '}— {conflicts.map((c) => c.note).join(', ')}
          </span>
        </div>
      )}

      <button type="button" className="btn btn-icon btn-danger" onClick={onRemove} title="Remove">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function MedicineAutocomplete({ value, medicines, stock, onChange }) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)

  const suggestions = useMemo(() => {
    const q = (value || '').toLowerCase().trim()
    if (!q) return []
    return medicines
      .filter((m) => (m.name || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [value, medicines])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const pick = (med) => {
    onChange(med.name)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(suggestions[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="medicine-autocomplete" ref={wrapRef}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Start typing medicine name…"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="autocomplete-list">
          {suggestions.map((m, i) => {
            const qty = stock[m.id] || 0
            return (
              <li
                key={m.id}
                className={i === highlight ? 'active' : ''}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(m) }}
              >
                <span>{m.name}</span>
                <span className={`autocomplete-stock ${qty > 0 ? '' : 'out'}`}>
                  {qty > 0 ? `${qty} left` : 'no stock'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
