import { useState, useEffect } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useFacility } from '@hooks/useFacility'
import { subscribeToCollection, addDocument, updateDocument } from '@lib/db'
import { formatINR, formatDate } from '@lib/utils'
import Modal from '@components/Modal'
import ResultModal from './ResultModal'
import { Plus, ArrowRight, FileText } from 'lucide-react'

const STATUS_FLOW = ['ordered', 'sample_collected', 'in_progress', 'report_ready']
const STATUS_LABELS = {
  ordered: 'Ordered',
  sample_collected: 'Sample Collected',
  in_progress: 'In Progress',
  report_ready: 'Report Ready',
}

export default function OrdersTab({ orders, tests, canWrite }) {
  const { user, staffProfile } = useAuth()
  const { facilityId } = useFacility()
  const [orderModal, setOrderModal] = useState(false)
  const [resultModal, setResultModal] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)

  const advanceStatus = async (order) => {
    const idx = STATUS_FLOW.indexOf(order.status)
    if (idx === -1 || idx >= STATUS_FLOW.length - 1) return
    const next = STATUS_FLOW[idx + 1]
    if (next === 'report_ready') { setResultModal(order); return }
    await updateDocument(`facilities/${facilityId}/lab/orders/${order.id}`, {
      status: next,
      [`statusTimestamps/${next}`]: Date.now(),
    }, {
      user: staffProfile?.name || user?.email, facilityId,
      audit: { action: `lab_order_${next}`, module: 'lab' },
    })
  }

  return (
    <div>
      <div className="pharmacy-alerts">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="all">All Statuses</option>
          {STATUS_FLOW.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        {canWrite && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setOrderModal(true)}>
            <Plus size={16} /> Order Test
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No lab orders{statusFilter !== 'all' ? ` with status "${STATUS_LABELS[statusFilter]}"` : ''}.</div>
      ) : (
        <div className="queue-list">
          {filtered.map((order) => (
            <div key={order.id} className={`queue-card lab-order-${order.status}`}>
              <div className="queue-patient-info">
                <div className="queue-patient-name">{order.patientName}</div>
                <div className="queue-patient-meta">
                  <span className="font-mono">{order.patientUhid}</span>
                  <span> — {formatDate(order.orderDate || order.createdAt, 'datetime')}</span>
                </div>
                <div className="queue-doctor-name">
                  {(order.items || []).map((it) => it.testName).join(', ')} — {formatINR(order.totalAmount)}
                </div>
              </div>
              <div className="queue-status">
                <span className={`badge ${order.status === 'report_ready' ? 'badge-success' : order.status === 'ordered' ? 'badge-muted' : 'badge-warning'}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
              <div className="queue-actions">
                {canWrite && order.status !== 'report_ready' && (
                  <button className="btn btn-primary btn-sm" onClick={() => advanceStatus(order)}>
                    {order.status === 'in_progress' ? 'Enter Results' : (
                      <>Next: {STATUS_LABELS[STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]]} <ArrowRight size={13} /></>
                    )}
                  </button>
                )}
                {order.status === 'report_ready' && (
                  <button className="btn btn-outline btn-sm" onClick={() => setResultModal(order)}>
                    <FileText size={13} /> View Report
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {orderModal && (
        <OrderTestModal
          tests={tests}
          onClose={() => setOrderModal(false)}
          facilityId={facilityId}
          performedBy={staffProfile?.name || user?.email}
        />
      )}

      {resultModal && (
        <ResultModal
          order={resultModal}
          onClose={() => setResultModal(null)}
          facilityId={facilityId}
          performedBy={staffProfile?.name || user?.email}
          readOnly={resultModal.status === 'report_ready'}
        />
      )}
    </div>
  )
}

function OrderTestModal({ tests, onClose, facilityId, performedBy }) {
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')
  const [selectedTests, setSelectedTests] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return subscribeToCollection(`facilities/${facilityId}/patients`, (data) => {
      setPatients(data.filter((p) => p.status !== 'archived'))
    })
  }, [facilityId])

  const toggleTest = (testId) => {
    setSelectedTests(selectedTests.includes(testId)
      ? selectedTests.filter((t) => t !== testId)
      : [...selectedTests, testId])
  }

  const total = selectedTests.reduce((sum, id) => sum + (tests.find((t) => t.id === id)?.price || 0), 0)

  const handleOrder = async () => {
    if (!patientId) { setError('Select a patient.'); return }
    if (selectedTests.length === 0) { setError('Select at least one test.'); return }

    setSaving(true)
    setError('')
    try {
      const patient = patients.find((p) => p.id === patientId)
      const items = selectedTests.map((id) => {
        const t = tests.find((x) => x.id === id)
        return { testId: id, testName: t.name, price: t.price, normalRange: t.normalRange || null, sampleType: t.sampleType }
      })

      await addDocument(`facilities/${facilityId}/lab/orders`, {
        patientId,
        patientName: patient?.name || '',
        patientUhid: patient?.uhid || '',
        items,
        totalAmount: total,
        status: 'ordered',
        statusTimestamps: { ordered: Date.now() },
        orderDate: Date.now(),
        orderedBy: performedBy,
        facilityId,
      }, {
        user: performedBy, facilityId,
        audit: { action: 'lab_order_created', module: 'lab' },
      })

      await addDocument(`facilities/${facilityId}/billing`, {
        patientId,
        patientName: patient?.name || '',
        patientUhid: patient?.uhid || '',
        type: 'lab',
        description: `Lab — ${items.map((i) => i.testName).join(', ')}`,
        amount: total,
        status: 'pending',
        invoiceDate: Date.now(),
        facilityId,
      })

      onClose()
    } catch (err) {
      console.error('Lab order error:', err)
      setError('Failed to create order.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Order Lab Test" size="md">
      {error && <div className="auth-error">{error}</div>}
      <div className="form-group">
        <label>Patient *</label>
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="">Select patient...</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.uhid || p.phone}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Tests * ({selectedTests.length} selected)</label>
        {tests.length === 0 ? (
          <p className="text-muted">No tests in catalog. Add tests first.</p>
        ) : (
          <div className="test-checklist">
            {tests.map((t) => (
              <label key={t.id} className="checkbox-label test-check-item">
                <input
                  type="checkbox"
                  checked={selectedTests.includes(t.id)}
                  onChange={() => toggleTest(t.id)}
                />
                <span>{t.name}</span>
                <span className="text-muted" style={{ marginLeft: 'auto' }}>{formatINR(t.price)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="form-actions">
        <strong style={{ marginRight: 'auto' }}>Total: {formatINR(total)}</strong>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleOrder} disabled={saving}>
          {saving ? 'Ordering...' : 'Create Order'}
        </button>
      </div>
    </Modal>
  )
}
