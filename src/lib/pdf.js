import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { departmentSummary } from './departments'
import { formatAge, maskPhone, BILLING_TYPE_LABELS } from './patients'

// The "where do I go" strip. Patients read this at the counter, so it prints
// boxed and bold rather than folded into the body text.
function addRoutingBlock(pdf, record, { y, doctor }) {
  const line = departmentSummary({
    departmentName: record?.departmentName,
    doctorName: doctor?.name || record?.doctorName,
    floor: record?.floor,
    roomNumber: record?.roomNumber,
    bedName: record?.bedName,
  })
  if (!line) return y

  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 15
  pdf.setFillColor(240, 245, 252)
  pdf.setDrawColor(5, 38, 89)
  pdf.setLineWidth(0.3)
  pdf.rect(margin, y, pageWidth - margin * 2, 9, 'FD')

  pdf.setFontSize(9.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(5, 38, 89)
  pdf.text(line, margin + 3, y + 6)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setDrawColor(0, 0, 0)

  return y + 14
}

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

  y = addRoutingBlock(pdf, visit, { y, doctor })

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

// Renders the UHID as a QR data URI. Returns null rather than throwing — a
// missing QR must never stop the counter from printing a slip.
async function uhidQrDataUrl(uhid) {
  if (!uhid) return null
  try {
    return await QRCode.toDataURL(String(uhid), { width: 240, margin: 0 })
  } catch {
    return null
  }
}

// Draws a stack of "Label: value" pairs in one column and returns the y it
// ended on, so the two columns of the patient block can be laid out
// independently and the taller one decides where the notes area starts.
function addFieldColumn(pdf, fields, { x, y, labelWidth, colWidth }) {
  let cursor = y
  fields.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${label}:`, x, cursor)
    pdf.setFont('helvetica', 'normal')
    const lines = pdf.splitTextToSize(String(value ?? '—'), colWidth - labelWidth)
    pdf.text(lines, x + labelWidth, cursor)
    cursor += Math.max(lines.length, 1) * 4.6 + 1.4
  })
  return cursor
}

// OPD parchi, modelled on a government hospital out-patient record: routing
// strip at the top for the patient, a two-column record block for the clerk,
// and the rest of the sheet left blank for the doctor to write on by hand.
//
// Async because the QR has to be rasterised before it can be placed.
export async function buildOpdSlipPDF({ facility, patient, visit }) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2

  let y = addHeader(pdf, facility)

  // Room / wing / token strip. The token is the one thing a waiting patient
  // looks for, so it is the largest thing on the page.
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Consulting Room No.: ${visit?.roomNumber || '—'}`, margin, y + 4)
  pdf.text(`Wing: ${visit?.wing || '—'}`, pageWidth / 2, y + 4, { align: 'center' })

  pdf.setFontSize(8)
  pdf.text('TOKEN NO.', pageWidth - margin, y, { align: 'right' })
  pdf.setFontSize(22)
  pdf.setFont('helvetica', 'bold')
  pdf.text(String(visit?.tokenNumber ?? '—'), pageWidth - margin, y + 8, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  y += 13

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text(
    [visit?.departmentName, visit?.unit && `Unit: ${visit.unit}`].filter(Boolean).join('  —  ') || '—',
    margin,
    y
  )
  pdf.setFont('helvetica', 'normal')
  if (visit?.opdDays) {
    pdf.setFontSize(8.5)
    pdf.text(`OPD Days: ${visit.opdDays}`, margin, y + 4.5)
    y += 4.5
  }
  y += 6

  y = addRoutingBlock(pdf, visit, { y })

  // "OUT PATIENT RECORD" divider.
  pdf.setLineWidth(0.4)
  pdf.line(margin, y, pageWidth - margin, y)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text('OUT PATIENT RECORD', pageWidth / 2, y + 5.5, { align: 'center' })
  pdf.line(margin, y + 8, pageWidth - margin, y + 8)
  pdf.setFont('helvetica', 'normal')
  y += 14

  // Two-column record block. The QR sits at the top of the right column.
  const colWidth = contentWidth / 2 - 4
  const rightX = margin + contentWidth / 2 + 4
  const qr = await uhidQrDataUrl(patient?.uhid || visit?.patientUhid)
  let rightY = y
  if (qr) {
    const qrSize = 24
    pdf.addImage(qr, 'PNG', pageWidth - margin - qrSize, rightY, qrSize, qrSize)
    pdf.setFontSize(7)
    pdf.text('Scan for UHID', pageWidth - margin - qrSize / 2, rightY + qrSize + 3, { align: 'center' })
    rightY += qrSize + 7
  }

  pdf.setFontSize(8.5)
  const leftEnd = addFieldColumn(pdf, [
    ['Name', patient?.name || visit?.patientName],
    ['Department', visit?.departmentName],
    ['Dept. Reg. No.', visit?.deptRegNo],
    ['Date of Regn.', visit?.visitDate
      ? new Date(visit.visitDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : null],
    ['Unit', visit?.unit],
    ['Age', formatAge(patient?.dob)],
    ['Billing Type', BILLING_TYPE_LABELS[visit?.billingType] || visit?.billingType],
    ['Mobile', maskPhone(patient?.phone)],
    ['Address', [patient?.address, patient?.city, patient?.pincode].filter(Boolean).join(', ')],
  ], { x: margin, y, labelWidth: 26, colWidth })

  const rightEnd = addFieldColumn(pdf, [
    ['UHID', patient?.uhid || visit?.patientUhid],
    ['ABHA ID', patient?.abhaId],
    ['Fee', visit?.feeAmount != null ? `Rs. ${visit.feeAmount}` : null],
    ['Sex', patient?.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : null],
    [patient?.relationType || 'S/O', patient?.guardianName],
    ['Email', patient?.email],
    ['Occupation', patient?.occupation],
    ['Prepared By', visit?.preparedByName || visit?.registeredByName],
  ], { x: rightX, y: rightY, labelWidth: 26, colWidth })

  y = Math.max(leftEnd, rightEnd) + 3

  if (patient?.patientType === 'mlc') {
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(180, 0, 0)
    pdf.setFontSize(10)
    pdf.text('MEDICO-LEGAL CASE (MLC)', margin, y + 2)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    y += 7
  }

  if (visit?.chiefComplaint) {
    pdf.setFontSize(8.5)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Chief Complaint:', margin, y + 2)
    pdf.setFont('helvetica', 'normal')
    pdf.text(pdf.splitTextToSize(visit.chiefComplaint, contentWidth - 30), margin + 30, y + 2)
    y += 8
  }

  // Everything below here is deliberately left empty for the doctor's
  // handwritten notes — faint rules only, no printed content.
  pdf.setLineWidth(0.3)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 6
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'italic')
  pdf.text("Doctor's Notes / Rx", margin, y)
  pdf.setFont('helvetica', 'normal')
  y += 5

  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.15)
  for (let lineY = y; lineY < pageHeight - 20; lineY += 8) {
    pdf.line(margin, lineY, pageWidth - margin, lineY)
  }
  pdf.setDrawColor(0, 0, 0)

  addFooter(pdf, { text: 'Please show this slip at the department reception.' })
  return pdf
}

// IPD admission slip — carries the ward/bed alongside the department location so
// visitors and ward staff can find the patient from one piece of paper.
export function buildIpdAdmissionSlipPDF({ facility, patient, admission }) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 15
  let y = addHeader(pdf, facility)

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('ADMISSION SLIP', pageWidth / 2, y, { align: 'center' })
  y += 9

  y = addRoutingBlock(pdf, admission, { y })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  const rows = [
    ['Patient', patient?.name || admission?.patientName || '—'],
    ['UHID', patient?.uhid || admission?.patientUhid || '—'],
    ['Admission No.', admission?.id || '—'],
    ['Admitted On', admission?.admissionDate
      ? new Date(admission.admissionDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '—'],
    ['Department', admission?.departmentName || '—'],
    ['Attending Doctor', admission?.doctorName ? `Dr. ${admission.doctorName}` : '—'],
    ['Floor', admission?.floor || '—'],
    ['Room No.', admission?.roomNumber || '—'],
    ['Ward', admission?.wardName || '—'],
    ['Bed', admission?.bedName || '—'],
    ['Bed Charge / Day', admission?.ratePerDay != null ? `Rs. ${admission.ratePerDay}` : '—'],
    ['Admission Diagnosis', admission?.diagnosis || '—'],
  ]
  rows.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${label}:`, margin, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(pdf.splitTextToSize(String(value), pageWidth - margin * 2 - 45), margin + 45, y)
    y += 6
  })

  const signY = Math.max(y + 20, pdf.internal.pageSize.getHeight() - 40)
  pdf.line(margin, signY, margin + 55, signY)
  pdf.text('Attendant Signature', margin, signY + 5)
  pdf.line(pageWidth - margin - 55, signY, pageWidth - margin, signY)
  pdf.text('Admitting Officer', pageWidth - margin, signY + 5, { align: 'right' })

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
