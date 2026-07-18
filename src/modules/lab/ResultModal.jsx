import { useState } from 'react'
import { useFacility } from '@hooks/useFacility'
import { updateDocument } from '@lib/db'
import { formatDate } from '@lib/utils'
import Modal from '@components/Modal'
import { Download } from 'lucide-react'

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

  const downloadPDF = async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const fc = facilityConfig || {}
    let y = 15

    doc.setFontSize(16).setFont(undefined, 'bold')
    doc.text(fc.facilityName || 'Hospital', 105, y, { align: 'center' })
    y += 6
    doc.setFontSize(9).setFont(undefined, 'normal')
    doc.text([fc.address, `${fc.city || ''} ${fc.state || ''}`, `Ph: ${fc.phone || ''}`].filter(Boolean).join(' | '), 105, y, { align: 'center' })
    y += 8
    doc.setLineWidth(0.5).line(15, y, 195, y)
    y += 8

    doc.setFontSize(13).setFont(undefined, 'bold')
    doc.text('LABORATORY REPORT', 105, y, { align: 'center' })
    y += 10

    doc.setFontSize(10).setFont(undefined, 'normal')
    doc.text(`Patient: ${order.patientName}`, 15, y)
    doc.text(`UHID: ${order.patientUhid}`, 120, y)
    y += 6
    doc.text(`Order Date: ${formatDate(order.orderDate, 'datetime')}`, 15, y)
    doc.text(`Reported: ${formatDate(Date.now(), 'datetime')}`, 120, y)
    y += 10

    doc.setFont(undefined, 'bold')
    doc.text('Test', 15, y)
    doc.text('Result', 90, y)
    doc.text('Normal Range', 130, y)
    doc.text('Flag', 180, y)
    y += 2
    doc.line(15, y, 195, y)
    y += 6
    doc.setFont(undefined, 'normal')

    results.forEach((r) => {
      const abnormal = isAbnormal(r.value, r.normalRange)
      doc.text(String(r.testName || ''), 15, y, { maxWidth: 70 })
      if (abnormal) doc.setTextColor(220, 38, 38).setFont(undefined, 'bold')
      doc.text(String(r.value || r.result || ''), 90, y)
      doc.setTextColor(0, 0, 0).setFont(undefined, 'normal')
      doc.text(String(r.normalRange || '—'), 130, y)
      doc.text(abnormal ? 'ABNORMAL' : 'Normal', 180, y)
      y += 7
      if (r.remark) {
        doc.setFontSize(8).setTextColor(100, 100, 100)
        doc.text(`Remark: ${r.remark}`, 20, y)
        doc.setFontSize(10).setTextColor(0, 0, 0)
        y += 6
      }
    })

    y += 10
    doc.setFontSize(9)
    doc.text(`Reported by: ${order.reportedBy || performedBy}`, 15, y)
    doc.text('Signature: ______________', 140, y)

    doc.save(`lab-report-${order.patientUhid}-${order.id.slice(-6)}.pdf`)
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
            <button className="btn btn-primary" onClick={downloadPDF}>
              <Download size={14} /> Download PDF
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
