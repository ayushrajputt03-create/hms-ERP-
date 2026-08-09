import { useState } from 'react'
import { useFacility } from '@hooks/useFacility'
import { updateDocument, getDocument } from '@lib/db'
import { buildLabReportPDF, printPDF } from '@lib/pdf'
import Modal from '@components/Modal'
import { Printer } from 'lucide-react'

function isAbnormal(value, normalRange) {
  if (!value || !normalRange) return false
  const num = parseFloat(value)
  if (isNaN(num)) return false
  const match = normalRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
  if (!match) return false
  const [, min, max] = match
  return num < parseFloat(min) || num > parseFloat(max)
}

export default function ResultModal({ order, onClose, facilityId, performedBy, readOnly }) {
  const { facilityConfig } = useFacility()
  const [results, setResults] = useState(
    (order.items || []).map((it) => ({
      ...it,
      value: it.result || '',
      remark: it.remark || '',
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateResult = (i, field, value) => {
    setResults(results.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const handleSave = async () => {
    if (results.some((r) => !r.value.trim())) {
      setError('Enter a result value for every test.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const items = results.map((r) => ({
        testId: r.testId,
        testName: r.testName,
        price: r.price,
        normalRange: r.normalRange || null,
        sampleType: r.sampleType || null,
        result: r.value.trim(),
        remark: r.remark.trim() || null,
        abnormal: isAbnormal(r.value, r.normalRange),
      }))
      await updateDocument(`facilities/${facilityId}/lab/orders/${order.id}`, {
        items,
        status: 'report_ready',
        'statusTimestamps/report_ready': Date.now(),
        reportedBy: performedBy,
      }, {
        user: performedBy, facilityId,
        audit: { action: 'lab_report_entered', module: 'lab' },
      })
      onClose()
    } catch (err) {
      console.error('Result save error:', err)
      setError('Failed to save results.')
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = async () => {
    const patient = order.patientId
      ? await getDocument(`facilities/${facilityId}/patients/${order.patientId}`)
      : null
    const pdf = await buildLabReportPDF({
      facility: facilityConfig || {},
      patient,
      order: { ...order, items: results.map((r) => ({ ...r, result: r.value || r.result })) },
      pathologistName: order.reportedBy || performedBy,
    })
    printPDF(pdf)
  }

  return (
    <Modal isOpen onClose={onClose} title={readOnly ? `Lab Report — ${order.patientName}` : `Enter Results — ${order.patientName}`} size="lg">
      {error && <div className="auth-error">{error}</div>}
      {results.map((r, i) => {
        const abnormal = isAbnormal(r.value, r.normalRange)
        return (
          <div key={i} className="result-row">
            <div className="result-test-name">
              <strong>{r.testName}</strong>
              {r.normalRange && <span className="text-muted"> (Normal: {r.normalRange})</span>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Result *</label>
                <input
                  value={r.value}
                  onChange={(e) => updateResult(i, 'value', e.target.value)}
                  disabled={readOnly}
                  className={abnormal ? 'input-abnormal' : ''}
                />
                {abnormal && <span className="badge badge-danger" style={{ marginTop: 4 }}>Out of range</span>}
              </div>
              <div className="form-group">
                <label>Remark</label>
                <input
                  value={r.remark}
                  onChange={(e) => updateResult(i, 'remark', e.target.value)}
                  disabled={readOnly}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
        )
      })}
      <div className="form-actions">
        {readOnly ? (
          <>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={handlePrint}>
              <Printer size={14} /> Print Report
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Mark Report Ready'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
