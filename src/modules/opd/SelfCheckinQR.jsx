import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import Modal from '@components/Modal'
import { Printer } from 'lucide-react'

// The /book/:facilityId self-booking flow (public/QRBookingPage.jsx) has
// existed since the QR-booking RPCs shipped, but nothing in the staff UI
// ever generated or displayed the QR code patients are meant to scan — the
// endpoint was reachable only if someone already had the exact URL. This is
// that missing piece: a printable QR reception can put up at the front desk.
export default function SelfCheckinQR({ facilityId, facilityName }) {
  const [open, setOpen] = useState(false)
  const canvasRef = useRef(null)
  const bookingUrl = `${window.location.origin}/book/${facilityId}`

  useEffect(() => {
    if (!open || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, bookingUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#052659', light: '#FFFFFF' },
    })
  }, [open, bookingUrl])

  return (
    <>
      <button className="btn btn-outline" onClick={() => setOpen(true)}>
        Self Check-in QR
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Patient Self Check-in QR" size="sm">
        <div className="self-checkin-qr">
          <canvas ref={canvasRef} />
          <p><strong>{facilityName}</strong></p>
          <p className="text-muted">Patients scan this to book a token without waiting at the desk.</p>
          <p className="font-mono text-muted" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{bookingUrl}</p>
          <button className="btn btn-primary btn-block" onClick={() => window.print()}>
            <Printer size={15} /> Print
          </button>
        </div>
      </Modal>
    </>
  )
}
