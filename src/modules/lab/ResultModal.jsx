import { useState } from 'react'
import { useFacility } from '@hooks/useFacility'
import { updateLabOrderStatus, uploadLabResultFile, getDocument } from '@lib/db'
import { buildLabReportPDF, printPDF } from '@lib/pdf'
import Modal from '@components/Modal'
import { Printer, Upload, Paperclip, ExternalLink, AlertCircle } from 'lucide-react'

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
  const [reportFileUrl, setReportFileUrl] = useState(order.reportFileUrl || '')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateResult = (i, field, value) => {
    setResults(results.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const url = await uploadLabResultFile({ facilityId, orderId: order.id, file })
      setReportFileUrl(url)
    } catch (err) {
      console.error('Lab attachment upload error:', err)
      setUploadError(`Upload failed: ${err.message || err}`)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    const hasValues = results.length > 0 && results.some((r) => r.value.trim() !== '')
    if (!hasValues && !reportFileUrl) {
      setError('Please enter at least one test result value OR attach a result report file.')
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

      await updateLabOrderStatus({
        path: `facilities/${facilityId}/lab/orders/${order.id}`,
        nextStatus: 'report_ready',
        results: items,
        reportFileUrl: reportFileUrl || null,
      })

      onClose()
    } catch (err) {
      console.error('Result save error:', err)
      setError(`Failed to save results: ${err.message || err}`)
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
      {uploadError && <div className="auth-error">{uploadError}</div>}

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
                <label>Result</label>
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

      <div className="form-group" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
        <label>Lab Report File Attachment (PDF / Image)</label>
        {reportFileUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Paperclip size={13} /> File Attached
            </span>
            <a href={reportFileUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              View Attachment <ExternalLink size={13} />
            </a>
            {!readOnly && (
              <button className="btn btn-sm btn-outline text-danger" onClick={() => setReportFileUrl('')}>
                Remove
              </button>
            )}
          </div>
        ) : (
          !readOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                disabled={uploading}
                style={{ fontSize: 13 }}
              />
              {uploading && <span className="text-muted">Uploading...</span>}
            </div>
          )
        )}
      </div>

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
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploading}>
              {saving ? 'Saving...' : 'Save & Mark Report Ready'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

