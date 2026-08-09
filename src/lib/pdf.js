import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { departmentSummary } from './departments'
import { formatAge, maskPhone, BILLING_TYPE_LABELS } from './patients'
import { drawBarcode } from './barcode'

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

// OPD parchi, laid out like a real government-hospital out-patient record:
// stamp / branding / scannable UHID barcode across the header, a bordered
// two-column demographics block for the counter clerk, and the whole lower
// half left ruled-but-blank for the doctor to write the Rx by hand.
//
// Async because the ABHA QR has to be rasterised before it can be placed.
export async function buildOpdSlipPDF({ facility, patient, visit }) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const NAVY = [26, 54, 93]

  const uhid = patient?.uhid || visit?.patientUhid || ''
  const token = visit?.tokenNumber

  // ---- HEADER: stamp box | hospital branding | UHID barcode ---------------
  let y = 12
  const stampW = 36
  const barcodeW = 42
  const barcodeX = pageWidth - margin - barcodeW

  pdf.setDrawColor(160, 174, 192)
  pdf.setLineWidth(0.2)
  pdf.setLineDashPattern([0.8, 0.8], 0)
  pdf.rect(margin, y, stampW, 17)
  pdf.setLineDashPattern([], 0)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(45, 55, 72)
  pdf.text('HMS RECORD', margin + stampW / 2, y + 4.5, { align: 'center' })
  pdf.setLineWidth(0.15)
  pdf.line(margin + 2, y + 5.8, margin + stampW - 2, y + 5.8)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text('OPD / CLINIC SLIP', margin + stampW / 2, y + 9.5, { align: 'center' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(...NAVY)
  pdf.text(`TOKEN NO : ${token ?? '--'}`, margin + stampW / 2, y + 14.5, { align: 'center' })
  pdf.setTextColor(0, 0, 0)

  const centerLeft = margin + stampW + 4
  const centerWidth = barcodeX - centerLeft - 4
  const centerX = centerLeft + centerWidth / 2

  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  const nameLines = pdf.splitTextToSize(
    String(facility?.facilityName || 'Hospital').toUpperCase(), centerWidth
  )
  pdf.text(nameLines, centerX, y + 4.5, { align: 'center' })
  let cy = y + 4.5 + nameLines.length * 5

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(45, 55, 72)
  const addressLine = [facility?.address, facility?.city, facility?.state, facility?.pincode]
    .filter(Boolean).join(', ')
  if (addressLine) {
    const addrLines = pdf.splitTextToSize(addressLine, centerWidth)
    pdf.text(addrLines, centerX, cy, { align: 'center' })
    cy += addrLines.length * 3.8
  }

  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(26, 32, 44)
  const roomLine = [
    visit?.roomNumber && `CONSULTING ROOM NO : ${visit.roomNumber}`,
    visit?.wing,
    token != null && `TOKEN NO : ${token}`,
  ].filter(Boolean).join(', ')
  if (roomLine) { cy += 1; pdf.text(roomLine, centerX, cy, { align: 'center' }); cy += 3.6 }
  if (visit?.departmentName) {
    pdf.text(`Clinic: ${visit.departmentName}`, centerX, cy, { align: 'center' })
    cy += 3.6
  }
  if (visit?.opdDays) {
    pdf.text(`Days: ${visit.opdDays}`, centerX, cy, { align: 'center' })
    cy += 3.6
  }
  pdf.setTextColor(0, 0, 0)

  // Scannable Code 128-B of the UHID — falls back to plain text if unencodable.
  const barcodeDrawn = drawBarcode(pdf, uhid, { x: barcodeX, y: y + 1, width: barcodeW, height: 11 })
  pdf.setFontSize(7.5)
  pdf.setFont('courier', 'bold')
  pdf.text(
    `UHID: ${uhid || '--'}`,
    pageWidth - margin,
    y + (barcodeDrawn ? 15.5 : 8),
    { align: 'right' }
  )
  pdf.setFont('helvetica', 'normal')

  y = Math.max(y + 18, cy + 1)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageWidth - margin, y)

  // ---- RECORD BANNER ------------------------------------------------------
  const bannerH = 6
  pdf.setFillColor(237, 242, 247)
  pdf.rect(margin, y, contentWidth, bannerH, 'F')
  pdf.setLineWidth(0.4)
  pdf.rect(margin, y, contentWidth, bannerH)
  pdf.setFontSize(9.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text('OUT  PATIENT  RECORD', pageWidth / 2, y + 4.2, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  y += bannerH

  // ---- DEMOGRAPHICS BOX ---------------------------------------------------
  const infoTop = y
  const padX = 3
  const leftX = margin + padX
  const rightColW = 72
  const dividerX = pageWidth - margin - rightColW - padX
  const rightX = dividerX + padX
  const leftColW = dividerX - padX - leftX
  const rightUsableW = pageWidth - margin - padX - rightX

  const infoRow = (label, value, { x, ry, labelW, colW, danger }) => {
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(45, 55, 72)
    pdf.text(label, x, ry)
    pdf.setTextColor(...(danger ? [197, 48, 48] : [0, 0, 0]))
    const lines = pdf.splitTextToSize(`: ${value ?? '---'}`, colW - labelW)
    pdf.text(lines, x + labelW, ry)
    pdf.setTextColor(0, 0, 0)
    return ry + Math.max(lines.length, 1) * 3.5 + 0.7
  }

  const isMlc = patient?.patientType === 'mlc'
  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')

  let ly = infoTop + 5
  const leftRows = [
    ['Name', patient?.name || visit?.patientName],
    ['Department', visit?.departmentName],
    ['Dept No.', visit?.deptRegNo],
    ['Date of Registration', visit?.visitDate
      ? new Date(visit.visitDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : null],
    ['Unit', visit?.unit],
    ['Age / Sex', ageSex],
    ['Billing Type', BILLING_TYPE_LABELS[visit?.billingType] || visit?.billingType],
    ['Mobile No', maskPhone(patient?.phone)],
    ['Address', [patient?.address, patient?.city, patient?.state, patient?.pincode]
      .filter(Boolean).join(', ')],
  ]
  for (const [label, value] of leftRows) {
    ly = infoRow(label, value, { x: leftX, ry: ly, labelW: 30, colW: leftColW })
  }
  ly = infoRow('Patient Type', isMlc ? 'MLC' : 'NON MLC',
    { x: leftX, ry: ly, labelW: 30, colW: leftColW, danger: isMlc })

  // Right column: ABHA QR + identity, then the counter/billing fields.
  let ry = infoTop + 4
  const qr = await uhidQrDataUrl(patient?.abhaAddress || patient?.abhaId || uhid)
  if (qr) {
    const qrSize = 16
    pdf.addImage(qr, 'PNG', rightX, ry, qrSize, qrSize)
    pdf.setDrawColor(203, 213, 224)
    pdf.setLineWidth(0.2)
    pdf.rect(rightX, ry, qrSize, qrSize)

    const abhaX = rightX + qrSize + 3
    const abhaW = pageWidth - margin - padX - abhaX
    pdf.setFontSize(7.5)
    pdf.setFont('courier', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(pdf.splitTextToSize(patient?.abhaId || 'ABHA not linked', abhaW), abhaX, ry + 3.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.setTextColor(74, 85, 104)
    if (patient?.abhaAddress) {
      pdf.text(pdf.splitTextToSize(patient.abhaAddress, abhaW), abhaX, ry + 7.5)
    }
    if (patient?.abhaId) {
      pdf.setDrawColor(144, 205, 244)
      pdf.setTextColor(43, 108, 176)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6)
      pdf.rect(abhaX, ry + 10, 20, 4)
      pdf.text('ABHA LINKED', abhaX + 10, ry + 12.8, { align: 'center' })
    }
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    ry += qrSize + 3
  }

  const rightRows = [
    ['Fee', visit?.feeAmount != null ? Number(visit.feeAmount).toFixed(2) : null],
    [patient?.relationType || 'S/O', patient?.guardianName],
    ['Email', patient?.email],
    ['Occupation', patient?.occupation],
    ['Prepared by', visit?.preparedByName || visit?.registeredByName],
  ]
  for (const [label, value] of rightRows) {
    ry = infoRow(label, value, { x: rightX, ry, labelW: 22, colW: rightUsableW })
  }

  const infoBottom = Math.max(ly, ry) + 2
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, infoTop, margin, infoBottom)
  pdf.line(pageWidth - margin, infoTop, pageWidth - margin, infoBottom)
  pdf.line(margin, infoBottom, pageWidth - margin, infoBottom)
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.2)
  pdf.setLineDashPattern([0.8, 0.8], 0)
  pdf.line(dividerX, infoTop + 2, dividerX, infoBottom - 2)
  pdf.setLineDashPattern([], 0)

  // ---- CLINICAL AREA (left blank for handwriting) -------------------------
  const footerTop = pageHeight - 20
  const clinTop = infoBottom
  const clinBottom = footerTop - 4
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.rect(margin, clinTop, contentWidth, clinBottom - clinTop)

  const splitX = margin + contentWidth * 0.32
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.2)
  pdf.line(splitX, clinTop, splitX, clinBottom)

  const heading = (text, hx, hy, hw) => {
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...NAVY)
    pdf.text(text, hx, hy)
    pdf.setDrawColor(226, 232, 240)
    pdf.setLineWidth(0.2)
    pdf.line(hx, hy + 1.5, hx + hw, hy + 1.5)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
  }

  heading('HISTORY / VITALS / INVESTIGATIONS', margin + 3, clinTop + 6, splitX - margin - 6)
  heading('CLINICAL NOTES / DIAGNOSIS / ADVICE (Rx)', splitX + 4, clinTop + 6,
    pageWidth - margin - splitX - 8)

  // The counter already knows the complaint — printing it saves the doctor
  // re-asking, and it is the only thing pre-filled in the writing area.
  if (visit?.chiefComplaint) {
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.text('C/O:', margin + 3, clinTop + 12)
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      pdf.splitTextToSize(visit.chiefComplaint, splitX - margin - 16),
      margin + 12, clinTop + 12
    )
  }
  if (patient?.allergies?.length) {
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(197, 48, 48)
    pdf.text(
      pdf.splitTextToSize(`ALLERGIES: ${patient.allergies.join(', ')}`, splitX - margin - 6),
      margin + 3, clinBottom - 6
    )
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
  }

  // Follow-up + signature footer inside the Rx column.
  pdf.setFontSize(7.5)
  pdf.setTextColor(74, 85, 104)
  pdf.text('Next Follow up: ______________________', splitX + 4, clinBottom - 6)
  pdf.setTextColor(0, 0, 0)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  const signW = 46
  const signX = pageWidth - margin - 4 - signW
  pdf.line(signX, clinBottom - 9, signX + signW, clinBottom - 9)
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text("Doctor's Signature & Stamp", signX + signW / 2, clinBottom - 5.5, { align: 'center' })
  pdf.setFont('helvetica', 'normal')

  // ---- FOOTER -------------------------------------------------------------
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, footerTop, pageWidth - margin, footerTop)
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(197, 48, 48)
  pdf.text(
    'Fine of Rs. 500 will be charged from any person found consuming tobacco products in hospital premises.',
    pageWidth / 2, footerTop + 4.5, { align: 'center' }
  )
  pdf.setTextColor(113, 128, 150)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text('Please show this slip at the department reception.', margin, footerTop + 9.5)
  pdf.text(
    new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
    pageWidth / 2, footerTop + 9.5, { align: 'center' }
  )
  pdf.text('Page 1 of 1', pageWidth - margin, footerTop + 9.5, { align: 'right' })
  pdf.setTextColor(0, 0, 0)

  return pdf
}

// IPD admission slip, in the same house style as the OPD parchi: the ward and
// bed are the thing visitors and ward staff read off it, so they print large
// in their own band rather than buried in a field list. Carries the standard
// admission undertaking and both signature blocks a real admission needs.
export function buildIpdAdmissionSlipPDF({ facility, patient, admission }) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const NAVY = [26, 54, 93]

  const uhid = patient?.uhid || admission?.patientUhid || ''
  const ipdNo = admission?.ipdNumber || admission?.id || ''

  // ---- HEADER -------------------------------------------------------------
  let y = 12
  const stampW = 36
  const barcodeW = 42
  const barcodeX = pageWidth - margin - barcodeW

  pdf.setDrawColor(160, 174, 192)
  pdf.setLineWidth(0.2)
  pdf.setLineDashPattern([0.8, 0.8], 0)
  pdf.rect(margin, y, stampW, 17)
  pdf.setLineDashPattern([], 0)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(45, 55, 72)
  pdf.text('HMS RECORD', margin + stampW / 2, y + 4.5, { align: 'center' })
  pdf.setLineWidth(0.15)
  pdf.line(margin + 2, y + 5.8, margin + stampW - 2, y + 5.8)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text('IPD ADMISSION SLIP', margin + stampW / 2, y + 9.5, { align: 'center' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(...NAVY)
  pdf.text(pdf.splitTextToSize(`IPD NO : ${ipdNo || '--'}`, stampW - 3),
    margin + stampW / 2, y + 14, { align: 'center' })
  pdf.setTextColor(0, 0, 0)

  const centerLeft = margin + stampW + 4
  const centerWidth = barcodeX - centerLeft - 4
  const centerX = centerLeft + centerWidth / 2

  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  const nameLines = pdf.splitTextToSize(
    String(facility?.facilityName || 'Hospital').toUpperCase(), centerWidth
  )
  pdf.text(nameLines, centerX, y + 4.5, { align: 'center' })
  let cy = y + 4.5 + nameLines.length * 5

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(45, 55, 72)
  const addressLine = [facility?.address, facility?.city, facility?.state, facility?.pincode]
    .filter(Boolean).join(', ')
  if (addressLine) {
    const addrLines = pdf.splitTextToSize(addressLine, centerWidth)
    pdf.text(addrLines, centerX, cy, { align: 'center' })
    cy += addrLines.length * 3.8
  }
  const contact = [facility?.phone && `Ph: ${facility.phone}`, facility?.email]
    .filter(Boolean).join('  |  ')
  if (contact) { pdf.text(contact, centerX, cy, { align: 'center' }); cy += 3.8 }
  pdf.setTextColor(0, 0, 0)

  const barcodeDrawn = drawBarcode(pdf, uhid, { x: barcodeX, y: y + 1, width: barcodeW, height: 11 })
  pdf.setFontSize(7.5)
  pdf.setFont('courier', 'bold')
  pdf.text(`UHID: ${uhid || '--'}`, pageWidth - margin,
    y + (barcodeDrawn ? 15.5 : 8), { align: 'right' })
  pdf.setFont('helvetica', 'normal')

  y = Math.max(y + 18, cy + 1)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageWidth - margin, y)

  // ---- BANNER -------------------------------------------------------------
  pdf.setFillColor(237, 242, 247)
  pdf.rect(margin, y, contentWidth, 6, 'F')
  pdf.setLineWidth(0.4)
  pdf.rect(margin, y, contentWidth, 6)
  pdf.setFontSize(9.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text('IN  PATIENT  ADMISSION  RECORD', pageWidth / 2, y + 4.2, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  y += 6

  // ---- WARD / BED BAND ----------------------------------------------------
  // The one line a visitor at the gate actually needs.
  const bandH = 13
  pdf.setFillColor(240, 245, 252)
  pdf.rect(margin, y, contentWidth, bandH, 'F')
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.rect(margin, y, contentWidth, bandH)

  const cellW = contentWidth / 4
  const bandCells = [
    ['WARD', admission?.wardName],
    ['BED', admission?.bedName],
    ['FLOOR', admission?.floor],
    ['ROOM', admission?.roomNumber],
  ]
  bandCells.forEach(([label, value], i) => {
    const cx = margin + cellW * i
    if (i > 0) {
      pdf.setDrawColor(203, 213, 224)
      pdf.setLineWidth(0.2)
      pdf.line(cx, y + 1.5, cx, y + bandH - 1.5)
    }
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(74, 85, 104)
    pdf.text(label, cx + cellW / 2, y + 4.5, { align: 'center' })
    pdf.setFontSize(12)
    pdf.setTextColor(...NAVY)
    pdf.text(String(value || '--'), cx + cellW / 2, y + 10.5, { align: 'center' })
  })
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  y += bandH

  // ---- DEMOGRAPHICS / ADMISSION BOX --------------------------------------
  const infoTop = y
  const padX = 3
  const leftX = margin + padX
  const dividerX = margin + contentWidth / 2
  const rightX = dividerX + padX
  const colW = contentWidth / 2 - padX * 2

  const infoRow = (label, value, { x, ry, labelW, width, danger }) => {
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(45, 55, 72)
    pdf.text(label, x, ry)
    pdf.setTextColor(...(danger ? [197, 48, 48] : [0, 0, 0]))
    const lines = pdf.splitTextToSize(`: ${value ?? '---'}`, width - labelW)
    pdf.text(lines, x + labelW, ry)
    pdf.setTextColor(0, 0, 0)
    return ry + Math.max(lines.length, 1) * 3.5 + 0.7
  }

  const isMlc = patient?.patientType === 'mlc'
  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')

  let ly = infoTop + 5
  for (const [label, value] of [
    ['Patient Name', patient?.name || admission?.patientName],
    ['UHID', uhid],
    ['Age / Sex', ageSex],
    ['Mobile No', maskPhone(patient?.phone)],
    [patient?.relationType || 'S/O', patient?.guardianName],
    ['Address', [patient?.address, patient?.city, patient?.state, patient?.pincode]
      .filter(Boolean).join(', ')],
    ['Blood Group', patient?.bloodGroup],
  ]) {
    ly = infoRow(label, value, { x: leftX, ry: ly, labelW: 26, width: colW })
  }
  ly = infoRow('Patient Type', isMlc ? 'MLC' : 'NON MLC',
    { x: leftX, ry: ly, labelW: 26, width: colW, danger: isMlc })

  let ry = infoTop + 5
  for (const [label, value] of [
    ['Admission No.', ipdNo],
    ['Admitted On', admission?.admissionDate
      ? new Date(admission.admissionDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : null],
    ['Department', admission?.departmentName],
    ['Consultant', admission?.doctorName ? `Dr. ${admission.doctorName}` : null],
    ['Bed Charge / Day', admission?.ratePerDay != null ? `Rs. ${admission.ratePerDay}` : null],
    ['Billing Type', BILLING_TYPE_LABELS[admission?.billingType] || admission?.billingType],
    ['Admitted By', admission?.admittedByName || admission?.preparedByName],
    ['Provisional Diagnosis', admission?.diagnosis],
  ]) {
    ry = infoRow(label, value, { x: rightX, ry, labelW: 30, width: colW })
  }

  const infoBottom = Math.max(ly, ry) + 2
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, infoTop, margin, infoBottom)
  pdf.line(pageWidth - margin, infoTop, pageWidth - margin, infoBottom)
  pdf.line(margin, infoBottom, pageWidth - margin, infoBottom)
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.2)
  pdf.setLineDashPattern([0.8, 0.8], 0)
  pdf.line(dividerX, infoTop + 2, dividerX, infoBottom - 2)
  pdf.setLineDashPattern([], 0)

  y = infoBottom + 5

  if (patient?.allergies?.length) {
    pdf.setFillColor(255, 245, 245)
    pdf.setDrawColor(197, 48, 48)
    pdf.setLineWidth(0.3)
    pdf.rect(margin, y, contentWidth, 7, 'FD')
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(197, 48, 48)
    pdf.text(`ALLERGIES: ${patient.allergies.join(', ')}`, margin + 3, y + 4.6)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    y += 11
  }

  // ---- ATTENDANT / NEXT OF KIN (filled in by hand at the counter) ---------
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  const kinH = 20
  pdf.rect(margin, y, contentWidth, kinH)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(...NAVY)
  pdf.text('ATTENDANT / NEXT OF KIN', margin + 3, y + 5)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setDrawColor(160, 174, 192)
  pdf.setLineWidth(0.2)
  const kinFields = [['Name', 0], ['Relation', 1], ['Mobile No', 2]]
  kinFields.forEach(([label, i]) => {
    const fx = margin + 3 + (contentWidth / 3) * i
    pdf.text(`${label}:`, fx, y + 12)
    pdf.line(fx + 18, y + 12.5, fx + contentWidth / 3 - 8, y + 12.5)
  })
  pdf.text('ID Proof:', margin + 3, y + 17.5)
  pdf.line(margin + 21, y + 18, pageWidth - margin - 3, y + 18)
  y += kinH + 5

  // ---- UNDERTAKING --------------------------------------------------------
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(45, 55, 72)
  pdf.text('DECLARATION', margin, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.8)
  pdf.setTextColor(74, 85, 104)
  const undertaking = 'I hereby give consent for the admission and necessary treatment of the above patient. '
    + 'I have been informed of the applicable bed and treatment charges and undertake to settle all hospital '
    + 'dues before discharge. I understand that valuables brought into the hospital are the sole responsibility '
    + 'of the patient and attendant.'
  pdf.text(pdf.splitTextToSize(undertaking, contentWidth), margin, y + 4)
  pdf.setTextColor(0, 0, 0)
  y += 20

  // ---- SIGNATURES ---------------------------------------------------------
  const signY = Math.min(Math.max(y + 12, pageHeight - 42), pageHeight - 34)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  const signW = 55
  pdf.line(margin, signY, margin + signW, signY)
  pdf.line(pageWidth - margin - signW, signY, pageWidth - margin, signY)
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Attendant / Patient Signature', margin, signY + 4)
  pdf.text('Admitting Officer', pageWidth - margin, signY + 4, { align: 'right' })
  pdf.setFont('helvetica', 'normal')

  // ---- FOOTER -------------------------------------------------------------
  const footerTop = pageHeight - 20
  pdf.setLineWidth(0.4)
  pdf.line(margin, footerTop, pageWidth - margin, footerTop)
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(197, 48, 48)
  pdf.text('Please retain this slip. It is required at the time of discharge and billing.',
    pageWidth / 2, footerTop + 4.5, { align: 'center' })
  pdf.setTextColor(113, 128, 150)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text('IPD Admission Record', margin, footerTop + 9.5)
  pdf.text(new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
    pageWidth / 2, footerTop + 9.5, { align: 'center' })
  pdf.text('Page 1 of 1', pageWidth - margin, footerTop + 9.5, { align: 'right' })
  pdf.setTextColor(0, 0, 0)

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
