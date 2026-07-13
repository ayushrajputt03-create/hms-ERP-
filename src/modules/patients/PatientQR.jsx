import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function PatientQR({ uhid }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!uhid || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, uhid, {
      width: 80,
      margin: 1,
      color: { dark: '#1E293B', light: '#FFFFFF' },
    }).catch(() => setError(true))
  }, [uhid])

  if (!uhid || error) return null

  return (
    <div className="qr-wrapper" title={`QR: ${uhid}`}>
      <canvas ref={canvasRef} />
    </div>
  )
}
