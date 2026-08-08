import { jsPDF } from 'jspdf'

export function createPDF({ orientation = 'portrait', unit = 'mm', format = 'a4' } = {}) {
  return new jsPDF({ orientation, unit, format })
}

export function addHeader(pdf, facility, { y = 15 } = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth()

  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text(facility.facilityName || 'Hospital', pageWidth / 2, y, { align: 'center' })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  if (facility.address) {
    pdf.text(facility.address, pageWidth / 2, y + 6, { align: 'center' })
  }

  const contactParts = [facility.phone, facility.email].filter(Boolean)
  if (contactParts.length) {
    pdf.text(contactParts.join(' | '), pageWidth / 2, y + 11, { align: 'center' })
  }

  if (facility.gstin) {
    pdf.text(`GSTIN: ${facility.gstin}`, pageWidth / 2, y + 16, { align: 'center' })
  }

  pdf.setLineWidth(0.5)
  pdf.line(15, y + 20, pageWidth - 15, y + 20)

  return y + 25
}

export function addFooter(pdf, { text = 'This is a computer-generated document.' } = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'italic')
  pdf.text(text, pageWidth / 2, pageHeight - 10, { align: 'center' })
}

// Rx sheet the patient physically carries out of the OPD.
export function buildPrescriptionPDF({ facility, patient, visit, doctor }) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 15
  let y = addHeader(pdf, facility)

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('PRESCRIPTION', pageWidth / 2, y, { align: 'center' })
  y += 8

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  const left = [
    `Patient: ${patient?.name || visit?.patientName || '—'}`,
    `UHID: ${patient?.uhid || visit?.patientUhid || '—'}`,
    `Age / Sex: ${visit?.patientAgeSex || '—'}`,
  ]
  const right = [
    `Date: ${new Date(visit?.completedAt || visit?.visitDate || Date.now()).toLocaleDateString('en-IN')}`,
    `Doctor: Dr. ${doctor?.name || visit?.doctorName || '—'}`,
    doctor?.registrationNumber ? `Reg. No: ${doctor.registrationNumber}` : '',
  ].filter(Boolean)

  left.forEach((line, i) => pdf.text(line, margin, y + i * 5))
  right.forEach((line, i) => pdf.text(line, pageWidth - margin, y + i * 5, { align: 'right' }))
  y += Math.max(left.length, right.length) * 5 + 4

  pdf.setLineWidth(0.2)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 7

  if (patient?.allergies?.length) {
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(180, 0, 0)
    pdf.text(`ALLERGIES: ${patient.allergies.join(', ')}`, margin, y)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    y += 7
  }

  const clinical = [
    ['Chief Complaint', visit?.chiefComplaint],
    ['Diagnosis', visit?.diagnosis],
    ['Vitals', formatVitals(visit?.vitals)],
  ].filter(([, v]) => v)

  clinical.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${label}:`, margin, y)
    pdf.setFont('helvetica', 'normal')
    const lines = pdf.splitTextToSize(String(value), pageWidth - margin * 2 - 32)
    pdf.text(lines, margin + 32, y)
    y += lines.length * 5 + 2
  })

  y += 4
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Rx', margin, y)
  y += 4

  const rows = (visit?.prescription || []).map((p, i) => [
    String(i + 1),
    p.medicine || '—',
    p.dosage || '—',
    p.frequency || '—',
    p.duration || '—',
    p.notes || '',
  ])

  if (rows.length) {
    y = addTable(pdf, {
      headers: ['#', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions'],
      rows,
      startY: y,
      colWidths: [8, 45, 26, 30, 24, 47],
    })
  } else {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'italic')
    pdf.text('No medicines prescribed.', margin, y + 5)
    y += 10
  }

  y += 8
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  if (visit?.notes) {
    const lines = pdf.splitTextToSize(`Advice: ${visit.notes}`, pageWidth - margin * 2)
    pdf.text(lines, margin, y)
    y += lines.length * 5 + 2
  }
  if (visit?.followUpDate) {
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Follow-up on: ${new Date(visit.followUpDate).toLocaleDateString('en-IN')}`, margin, y)
    y += 6
  }

  const signY = Math.max(y + 20, pdf.internal.pageSize.getHeight() - 40)
  pdf.setFont('helvetica', 'normal')
  pdf.line(pageWidth - margin - 55, signY, pageWidth - margin, signY)
  pdf.text(`Dr. ${doctor?.name || visit?.doctorName || ''}`, pageWidth - margin, signY + 5, { align: 'right' })
  if (doctor?.qualification) {
    pdf.setFontSize(8)
    pdf.text(doctor.qualification, pageWidth - margin, signY + 10, { align: 'right' })
  }

  addFooter(pdf)
  return pdf
}

function formatVitals(v) {
  if (!v) return ''
  return [
    v.bp && `BP ${v.bp}`,
    v.pulse && `Pulse ${v.pulse}`,
    v.temp && `Temp ${v.temp}°F`,
    v.spo2 && `SpO2 ${v.spo2}%`,
    v.weight && `Wt ${v.weight}kg`,
    v.bmi && `BMI ${v.bmi}`,
  ].filter(Boolean).join('  |  ')
}

export function addTable(pdf, { headers, rows, startY, colWidths }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 15
  const tableWidth = pageWidth - margin * 2
  const cellPadding = 3
  let y = startY

  if (!colWidths) {
    const w = tableWidth / headers.length
    colWidths = headers.map(() => w)
  }

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.setFillColor(5, 38, 89)
  pdf.setTextColor(255, 255, 255)
  pdf.rect(margin, y, tableWidth, 8, 'F')

  let x = margin
  headers.forEach((h, i) => {
    pdf.text(h, x + cellPadding, y + 5.5)
    x += colWidths[i]
  })
  y += 8

  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)

  rows.forEach((row, rowIdx) => {
    if (y > pdf.internal.pageSize.getHeight() - 25) {
      pdf.addPage()
      y = 15
    }

    if (rowIdx % 2 === 1) {
      pdf.setFillColor(245, 245, 245)
      pdf.rect(margin, y, tableWidth, 7, 'F')
    }

    x = margin
    row.forEach((cell, i) => {
      pdf.text(String(cell ?? ''), x + cellPadding, y + 5)
      x += colWidths[i]
    })
    y += 7
  })

  return y
}
