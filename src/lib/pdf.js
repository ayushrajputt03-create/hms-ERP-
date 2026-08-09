import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { departmentSummary } from './departments'
import { formatAge, maskPhone, BILLING_TYPE_LABELS } from './patients'
import { drawBarcode } from './barcode'
import { amountInWords } from './amountWords'

// Kept local rather than imported from lib/billing so the PDF layer stays free
// of the Supabase client — these documents are also built in scripts and tests.
const PAYMENT_MODE_LABELS_PDF = {
  cash: 'Cash', upi: 'UPI', card: 'Card',
  insurance: 'Insurance / TPA', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
}

const SOURCE_LABELS = {
  opd: 'Consultation', ipd: 'Bed / Room', pharmacy: 'Pharmacy',
  lab: 'Diagnostics', manual: 'Other Charge',
}

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

// Every document in the app is meant to come out of the ward/counter printer,
// not land in a Downloads folder for someone to lose. This opens the print
// dialog directly from a hidden iframe: no file is saved, and no popup window
// is opened (which browsers block). The blob URL is revoked once printing is
// done so the PDF doesn't linger in memory.
export function printPDF(pdf) {
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl')
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.src = blobUrl
  frame.onload = () => {
    try { frame.contentWindow?.focus() } catch { /* cross-origin blob, dialog still fires */ }
  }
  document.body.appendChild(frame)
  // Keep the frame alive long enough for the dialog to take over, then clean up.
  setTimeout(() => {
    frame.remove()
    URL.revokeObjectURL(blobUrl)
  }, 60000)
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

// ---------------------------------------------------------------------------
// Shared building blocks for the printed hospital documents (bill, pharmacy
// invoice, discharge summary). They all share one house style: branded header
// with a scannable barcode, a grey banner, a bordered two-column demographics
// block, and bordered tables.
// ---------------------------------------------------------------------------

const NAVY = [26, 54, 93]

// Branded header. `docLabel` prints in the badge on the right, above the
// barcode of `docNumber`. Returns the y the header ends on.
function drawDocHeader(pdf, facility, { docLabel, docNumber, numberPrefix = 'NO', extraLine, accent = NAVY }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12
  let y = 12

  const rightW = 46
  const rightX = pageWidth - margin - rightW
  const leftW = rightX - margin - 6

  pdf.setFontSize(15)
  pdf.setFont('helvetica', 'bold')
  const nameLines = pdf.splitTextToSize(String(facility?.facilityName || 'Hospital').toUpperCase(), leftW)
  pdf.text(nameLines, margin, y + 5)
  let ly = y + 5 + nameLines.length * 5.6

  pdf.setFontSize(8.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(45, 55, 72)
  const addressLine = [facility?.address, facility?.city, facility?.state, facility?.pincode]
    .filter(Boolean).join(', ')
  if (addressLine) {
    const lines = pdf.splitTextToSize(addressLine, leftW)
    pdf.text(lines, margin, ly)
    ly += lines.length * 3.9
  }
  pdf.setFontSize(7.5)
  pdf.setTextColor(74, 85, 104)
  const contact = [
    facility?.phone && `Phone: ${facility.phone}`,
    facility?.email,
    facility?.gstin && `GSTIN: ${facility.gstin}`,
  ].filter(Boolean).join('  |  ')
  if (contact) {
    const lines = pdf.splitTextToSize(contact, leftW)
    pdf.text(lines, margin, ly)
    ly += lines.length * 3.4
  }
  if (extraLine) {
    const lines = pdf.splitTextToSize(extraLine, leftW)
    pdf.text(lines, margin, ly)
    ly += lines.length * 3.4
  }
  pdf.setTextColor(0, 0, 0)

  // Right: document badge + barcode.
  pdf.setFillColor(...accent)
  pdf.rect(rightX, y, rightW, 6, 'F')
  pdf.setFontSize(6.8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(String(docLabel).toUpperCase(), rightX + rightW / 2, y + 4.1, { align: 'center' })
  pdf.setTextColor(0, 0, 0)

  const drawn = docNumber
    ? drawBarcode(pdf, docNumber, { x: rightX, y: y + 8, width: rightW, height: 10 })
    : false
  pdf.setFontSize(7.5)
  pdf.setFont('courier', 'bold')
  pdf.text(
    `${numberPrefix}: ${docNumber || '--'}`,
    pageWidth - margin,
    y + (drawn ? 22 : 12),
    { align: 'right' }
  )
  pdf.setFont('helvetica', 'normal')

  y = Math.max(ly + 1, y + (drawn ? 24 : 14))
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageWidth - margin, y)
  return y
}

// Grey title strip with a label on the left and a date on the right.
function drawDocBanner(pdf, { y, left, right }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12
  const w = pageWidth - margin * 2
  pdf.setFillColor(237, 242, 247)
  pdf.rect(margin, y, w, 6, 'F')
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.rect(margin, y, w, 6)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text(String(left).toUpperCase(), margin + 3, y + 4.1)
  if (right) pdf.text(String(right).toUpperCase(), pageWidth - margin - 3, y + 4.1, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  return y + 6
}

// Bordered two-column "Label : Value" block.
function drawDetailsBox(pdf, { y, leftRows, rightRows, labelW = 30 }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const padX = 3
  const dividerX = margin + contentWidth / 2
  const colW = contentWidth / 2 - padX * 2
  const top = y

  const renderCol = (rows, x) => {
    let ry = top + 5
    for (const [label, value, danger] of rows) {
      pdf.setFontSize(7.5)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(74, 85, 104)
      pdf.text(label, x, ry)
      pdf.setTextColor(...(danger ? [197, 48, 48] : [0, 0, 0]))
      const lines = pdf.splitTextToSize(`: ${value ?? '---'}`, colW - labelW)
      pdf.text(lines, x + labelW, ry)
      pdf.setTextColor(0, 0, 0)
      ry += Math.max(lines.length, 1) * 3.5 + 0.7
    }
    return ry
  }

  const endLeft = renderCol(leftRows, margin + padX)
  const endRight = renderCol(rightRows, dividerX + padX)
  const bottom = Math.max(endLeft, endRight) + 2

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, top, margin, bottom)
  pdf.line(pageWidth - margin, top, pageWidth - margin, bottom)
  pdf.line(margin, bottom, pageWidth - margin, bottom)
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.2)
  pdf.setLineDashPattern([0.8, 0.8], 0)
  pdf.line(dividerX, top + 2, dividerX, bottom - 2)
  pdf.setLineDashPattern([], 0)
  return bottom
}

// Bordered table with a filled header row, zebra body rows, and per-column
// alignment. Breaks to a new page and repeats the header when it runs out.
function drawDocTable(pdf, { y, headers, rows, widths, align = [], fontSize = 7.5, headerFill = NAVY, bottomLimit }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const limit = bottomLimit ?? pageHeight - 30
  const rowPadX = 2
  let cursor = y

  const drawHeader = () => {
    pdf.setFillColor(...headerFill)
    pdf.rect(margin, cursor, widths.reduce((a, b) => a + b, 0), 6, 'F')
    pdf.setFontSize(fontSize - 0.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    let x = margin
    headers.forEach((h, i) => {
      const a = align[i] || 'left'
      const tx = a === 'right' ? x + widths[i] - rowPadX : a === 'center' ? x + widths[i] / 2 : x + rowPadX
      pdf.text(String(h), tx, cursor + 4.1, { align: a })
      x += widths[i]
    })
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.3)
    pdf.rect(margin, cursor, widths.reduce((a, b) => a + b, 0), 6)
    cursor += 6
  }

  drawHeader()

  rows.forEach((row, idx) => {
    // Measure the tallest cell so a long description doesn't overlap.
    pdf.setFontSize(fontSize)
    const wrapped = row.map((cell, i) =>
      pdf.splitTextToSize(String(cell ?? ''), widths[i] - rowPadX * 2)
    )
    const rowH = Math.max(...wrapped.map((w) => w.length)) * 3.6 + 2.6

    if (cursor + rowH > limit) {
      pdf.addPage()
      cursor = 15
      drawHeader()
    }

    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252)
      pdf.rect(margin, cursor, widths.reduce((a, b) => a + b, 0), rowH, 'F')
    }

    let x = margin
    wrapped.forEach((lines, i) => {
      const a = align[i] || 'left'
      const tx = a === 'right' ? x + widths[i] - rowPadX : a === 'center' ? x + widths[i] / 2 : x + rowPadX
      pdf.text(lines, tx, cursor + 3.8, { align: a })
      pdf.setDrawColor(203, 213, 224)
      pdf.setLineWidth(0.15)
      pdf.rect(x, cursor, widths[i], rowH)
      x += widths[i]
    })
    cursor += rowH
  })

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, cursor, pageWidth - margin, cursor)
  return cursor
}

// Amount-in-words card + right-hand calculation column, in a boxed strip.
function drawTotalsBox(pdf, { y, wordsText, metaLines = [], calcRows }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const calcW = 74
  const calcX = pageWidth - margin - calcW
  const leftW = calcW ? calcX - margin - 6 : contentWidth
  const top = y

  // Left: words card.
  pdf.setDrawColor(160, 174, 192)
  pdf.setLineWidth(0.2)
  const wordsLines = pdf.splitTextToSize(wordsText || '', leftW - 6)
  const wordsH = wordsLines.length * 3.8 + 9
  pdf.setFillColor(255, 255, 255)
  pdf.rect(margin + 3, top + 3, leftW, wordsH, 'FD')
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(113, 128, 150)
  pdf.text('AMOUNT IN WORDS', margin + 6, top + 7.5)
  pdf.setFontSize(8)
  pdf.setTextColor(...NAVY)
  pdf.text(wordsLines, margin + 6, top + 12)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')

  let metaY = top + wordsH + 7
  pdf.setFontSize(7.5)
  for (const line of metaLines.filter(Boolean)) {
    pdf.text(pdf.splitTextToSize(line, leftW), margin + 3, metaY)
    metaY += 4
  }

  // Right: calculation rows.
  let cy = top + 6
  for (const { label, value, style } of calcRows) {
    if (style === 'grand') {
      pdf.setDrawColor(0, 0, 0)
      pdf.setLineWidth(0.4)
      pdf.line(calcX, cy - 3.5, calcX + calcW, cy - 3.5)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...NAVY)
    } else if (style === 'paid') {
      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(39, 103, 73)
    } else if (style === 'due') {
      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(197, 48, 48)
    } else if (style === 'minus') {
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(197, 48, 48)
    } else {
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0)
    }
    pdf.text(label, calcX, cy)
    pdf.text(String(value), calcX + calcW, cy, { align: 'right' })
    if (style === 'grand') {
      pdf.setLineWidth(0.4)
      pdf.line(calcX, cy + 2, calcX + calcW, cy + 2)
      cy += 4
    }
    pdf.setTextColor(0, 0, 0)
    cy += style === 'grand' ? 5 : 4.4
  }

  const bottom = Math.max(metaY + 1, cy + 1, top + wordsH + 8)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.rect(margin, top, contentWidth, bottom - top)
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.2)
  pdf.line(calcX - 3, top + 2, calcX - 3, bottom - 2)
  return bottom
}

// Verification QR on the left, signature block on the right.
async function drawSignatureStrip(pdf, { y, qrValue, qrTitle, qrLines = [], signName, signRole }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, y, pageWidth - margin, y)

  const qr = qrValue ? await uhidQrDataUrl(qrValue) : null
  if (qr) {
    const size = 17
    pdf.addImage(qr, 'PNG', margin + 2, y + 3, size, size)
    pdf.setDrawColor(203, 213, 224)
    pdf.setLineWidth(0.2)
    pdf.rect(margin + 2, y + 3, size, size)
    const tx = margin + size + 6
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.text(qrTitle || 'Scan to verify', tx, y + 7)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.8)
    pdf.setTextColor(74, 85, 104)
    qrLines.filter(Boolean).forEach((line, i) => pdf.text(String(line), tx, y + 11 + i * 3.4))
    pdf.setTextColor(0, 0, 0)
  }

  const signW = 52
  const signX = pageWidth - margin - signW
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  pdf.line(signX, y + 16, signX + signW, y + 16)
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text(signName || '', signX + signW / 2, y + 19.5, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.setTextColor(113, 128, 150)
  pdf.text(signRole || '', signX + signW / 2, y + 23, { align: 'center' })
  pdf.setTextColor(0, 0, 0)
  return y + 26
}

function drawDocFooter(pdf, { terms = [], moduleName }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const top = pageHeight - 18
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.2)
  pdf.setLineDashPattern([0.8, 0.8], 0)
  pdf.line(margin, top, pageWidth - margin, top)
  pdf.setLineDashPattern([], 0)
  pdf.setFontSize(6.2)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(113, 128, 150)
  terms.filter(Boolean).forEach((t, i) => {
    pdf.text(pdf.splitTextToSize(`${i + 1}. ${t}`, pageWidth - margin * 2 - 30), margin, top + 4 + i * 3.2)
  })
  if (moduleName) pdf.text(moduleName, pageWidth - margin, top + 4, { align: 'right' })
  pdf.text('Page 1 of 1', pageWidth - margin, top + 7.2, { align: 'right' })
  pdf.setTextColor(0, 0, 0)
}

// Hospital bill / tax invoice — the sheet the billing counter hands over.
export async function buildHospitalInvoicePDF({ facility, patient, invoice }) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12

  const isIpd = (invoice?.sourceAdmissionIds || []).length > 0
  const total = Number(invoice?.total ?? invoice?.grandTotal ?? 0)
  const credited = Number(invoice?.creditedAmount) || 0
  const paid = Number(invoice?.paidAmount) || 0
  const balance = invoice?.balanceDue != null
    ? Number(invoice.balanceDue)
    : Math.max(total - credited - paid, 0)
  const gross = Number(invoice?.subtotal) || 0
  const discount = Number(invoice?.discount) || 0
  const gst = Number(invoice?.gstAmount) || 0
  const payments = invoice?.payments || []

  let y = drawDocHeader(pdf, facility, {
    docLabel: isIpd ? 'IPD Bill / Tax Invoice' : 'OPD Receipt / Tax Invoice',
    docNumber: invoice?.invoiceNumber,
    numberPrefix: 'INV',
  })

  y = drawDocBanner(pdf, {
    y,
    left: 'Patient Bill & Cash Receipt (Original for Recipient)',
    right: `Date: ${invoice?.invoiceDate
      ? new Date(invoice.invoiceDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '--'}`,
  })

  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')

  y = drawDetailsBox(pdf, {
    y,
    leftRows: [
      ['Patient Name', invoice?.patientName || patient?.name],
      ['Age / Sex', ageSex],
      ['UHID Number', invoice?.patientUhid || patient?.uhid],
      ['Mobile No', maskPhone(patient?.phone)],
    ],
    rightRows: [
      ['Department', invoice?.departmentName],
      ['Consulting Doctor', invoice?.doctorName ? `Dr. ${invoice.doctorName}` : null],
      ['Billing Mode', PAYMENT_MODE_LABELS_PDF[invoice?.paymentMode] || invoice?.paymentMode],
      ['ABHA ID / ABDM', patient?.abhaId],
    ],
    labelW: 32,
  })

  y += 4

  // Our line items carry a description, a source and an amount — quantity and
  // per-line discount aren't captured, so they print as 1 x net rather than
  // inventing figures the bill can't back up.
  const items = invoice?.lineItems || invoice?.items || []
  y = drawDocTable(pdf, {
    y,
    headers: ['#', 'Service / Charge Description', 'Category', 'Qty', 'Rate (Rs.)', 'Net Amt (Rs.)'],
    widths: [8, 90, 26, 12, 25, 25],
    align: ['center', 'left', 'left', 'center', 'right', 'right'],
    rows: items.map((it, i) => [
      i + 1,
      it.description || '--',
      SOURCE_LABELS[it.source] || it.source || 'Other',
      1,
      Number(it.amount || 0).toFixed(2),
      Number(it.amount || 0).toFixed(2),
    ]),
    bottomLimit: pdf.internal.pageSize.getHeight() - 110,
  })

  y += 4

  const lastPayment = payments[payments.length - 1]
  y = drawTotalsBox(pdf, {
    y,
    wordsText: amountInWords(total - credited),
    metaLines: [
      `Payment Mode: ${(PAYMENT_MODE_LABELS_PDF[invoice?.paymentMode] || invoice?.paymentMode || '--').toUpperCase()}`
        + (lastPayment?.referenceNumber ? `   |   Ref: ${lastPayment.referenceNumber}` : ''),
      invoice?.insuranceClaim
        ? `Insurance / TPA: ${invoice.insuranceClaim.tpaName || '--'} (${invoice.insuranceClaim.status || 'submitted'})`
        : '',
      invoice?.discountReason ? `Concession reason: ${invoice.discountReason}` : '',
      payments.length > 1 ? `${payments.length} part-payments received against this invoice.` : '',
    ],
    calcRows: [
      { label: 'Gross Service Amount', value: `Rs. ${gross.toFixed(2)}` },
      ...(discount > 0 ? [{ label: 'Concession / Discount', value: `- Rs. ${discount.toFixed(2)}`, style: 'minus' }] : []),
      { label: gst > 0 ? 'Tax / GST' : 'Tax / GST (Healthcare Exempt)', value: `Rs. ${gst.toFixed(2)}` },
      ...(credited > 0 ? [{ label: 'Credit Notes Issued', value: `- Rs. ${credited.toFixed(2)}`, style: 'minus' }] : []),
      { label: 'Net Payable', value: `Rs. ${(total - credited).toFixed(2)}`, style: 'grand' },
      { label: 'Amount Received', value: `Rs. ${paid.toFixed(2)}`, style: 'paid' },
      { label: 'Balance Due', value: balance > 0 ? `Rs. ${balance.toFixed(2)}` : 'Rs. 0.00 (NIL)', style: 'due' },
    ],
  })

  // Part-payment history — the reason a patient's receipt shows less than the
  // bill total, so it has to be on the paper they take home.
  if (payments.length > 1) {
    y += 4
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...NAVY)
    pdf.text('PAYMENT HISTORY', margin, y)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    y = drawDocTable(pdf, {
      y: y + 1.5,
      headers: ['Date', 'Mode', 'Reference', 'Amount (Rs.)'],
      widths: [45, 40, 66, 35],
      align: ['left', 'left', 'left', 'right'],
      headerFill: [113, 128, 150],
      rows: payments.map((p) => [
        p.paymentDate ? new Date(p.paymentDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '--',
        PAYMENT_MODE_LABELS_PDF[p.mode] || p.mode,
        p.referenceNumber || '--',
        Number(p.amount || 0).toFixed(2),
      ]),
    })
  }

  const sigY = Math.max(y + 6, pdf.internal.pageSize.getHeight() - 48)
  await drawSignatureStrip(pdf, {
    y: sigY,
    qrValue: invoice?.invoiceNumber,
    qrTitle: 'Scan to verify this receipt',
    qrLines: [`Invoice: ${invoice?.invoiceNumber || '--'}`, `UHID: ${invoice?.patientUhid || '--'}`],
    signName: invoice?.cashierName || '',
    signRole: 'Authorised Cashier / Billing Officer',
  })

  drawDocFooter(pdf, {
    terms: [
      'Healthcare services are exempt from GST under Notification No. 12/2017-Central Tax (Rate).',
      'Please retain this original receipt for insurance claim / reimbursement purposes.',
    ],
    moduleName: 'Billing & Financial Accounting',
  })
  return pdf
}

// Bordered section with a filled title bar — the discharge summary's
// "Clinical Course", "Investigations" etc.
// A row of 2-3 signature blocks along the bottom of a form.
function drawSignRow(pdf, { y, blocks }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, y, pageWidth - margin, y)

  const usable = pageWidth - margin * 2 - 8
  const w = usable / blocks.length
  blocks.forEach((b, i) => {
    const x = margin + 4 + i * w
    const lineW = w - 8
    pdf.setLineWidth(0.3)
    pdf.line(x, y + 14, x + lineW, y + 14)
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.text(String(b.name || ''), x + lineW / 2, y + 17.5, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.4)
    pdf.setTextColor(113, 128, 150)
    pdf.text(pdf.splitTextToSize(String(b.role || ''), lineW), x + lineW / 2, y + 20.8, { align: 'center' })
    pdf.setTextColor(0, 0, 0)
  })
  return y + 26
}

function drawSectionBox(pdf, { y, title, rightTitle, body, minBodyH = 0, ruled = 0 }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 12
  const w = pageWidth - margin * 2

  pdf.setFillColor(...NAVY)
  pdf.rect(margin, y, w, 5.5, 'F')
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(String(title).toUpperCase(), margin + 3, y + 3.8)
  if (rightTitle) pdf.text(String(rightTitle), pageWidth - margin - 3, y + 3.8, { align: 'right' })
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')

  pdf.setFontSize(8)
  const lines = body ? pdf.splitTextToSize(String(body), w - 6) : []
  const bodyH = Math.max(lines.length * 4 + 4, minBodyH, ruled ? ruled * 7 + 3 : 0)
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.3)
  pdf.rect(margin, y + 5.5, w, bodyH)
  if (lines.length) pdf.text(lines, margin + 3, y + 10)
  // Faint writing rules for the sections staff fill in by hand at the bedside.
  if (ruled) {
    pdf.setDrawColor(226, 232, 240)
    pdf.setLineWidth(0.15)
    const startY = y + 5.5 + (lines.length ? lines.length * 4 + 6 : 7)
    for (let i = 0; i < ruled; i++) {
      const ly = startY + i * 7
      if (ly > y + 5.5 + bodyH - 2) break
      pdf.line(margin + 3, ly, margin + w - 3, ly)
    }
  }
  return y + 5.5 + bodyH
}

// IPD discharge summary — the clinical resume the patient carries to their
// follow-up and their insurer.
export async function buildDischargeSummaryPDF({ facility, patient, admission, doses = [] }) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const contentWidth = pageWidth - margin * 2

  const uhid = patient?.uhid || admission?.patientUhid || ''
  const ipdNo = admission?.ipdNumber || admission?.id || ''
  const stayDays = admission?.stayDays
    || Math.max(1, Math.ceil(((admission?.dischargedAt || Date.now()) - (admission?.admissionDate || Date.now())) / 86400000))

  let y = drawDocHeader(pdf, facility, {
    docLabel: 'Inpatient Discharge Summary',
    docNumber: ipdNo,
    numberPrefix: 'IPD',
    extraLine: facility?.emergencyPhone ? `EMERGENCY CASUALTY 24x7: ${facility.emergencyPhone}` : '',
  })

  y = drawDocBanner(pdf, {
    y,
    left: 'Clinical Discharge Summary & Patient Resume',
    right: `Discharged: ${admission?.dischargedAt
      ? new Date(admission.dischargedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '--'}`,
  })

  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')

  y = drawDetailsBox(pdf, {
    y,
    leftRows: [
      ['Patient Name', patient?.name || admission?.patientName],
      ['Age / Sex', ageSex],
      ['UHID Number', uhid],
      ['IPD Admission No', ipdNo],
      ['ABHA ID / ABDM', patient?.abhaId],
    ],
    rightRows: [
      ['Department', admission?.departmentName],
      ['Ward / Bed', [admission?.wardName, admission?.bedName].filter(Boolean).join(', ')],
      ['Consultant Incharge', admission?.doctorName ? `Dr. ${admission.doctorName}` : null],
      ['Admission Date/Time', admission?.admissionDate
        ? new Date(admission.admissionDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : null],
      ['Length of Stay', `${stayDays} day${stayDays !== 1 ? 's' : ''}`],
    ],
    labelW: 32,
  })

  y += 4

  // Diagnosis band.
  pdf.setFillColor(235, 248, 255)
  pdf.setDrawColor(203, 213, 224)
  pdf.setLineWidth(0.3)
  const diagLines = pdf.splitTextToSize(admission?.diagnosis || 'Not recorded', contentWidth - 30)
  const diagH = diagLines.length * 4.4 + 9
  pdf.rect(margin, y, contentWidth, diagH, 'FD')
  pdf.setFillColor(49, 130, 206)
  pdf.rect(margin, y, 1.6, diagH, 'F')
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(113, 128, 150)
  pdf.text('FINAL DIAGNOSIS', margin + 5, y + 4.5)
  pdf.setFontSize(10)
  pdf.setTextColor(43, 108, 176)
  pdf.text(diagLines, margin + 5, y + 9.5)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  y += diagH + 4

  y = drawSectionBox(pdf, {
    y,
    title: 'Clinical Course in Hospital & Discharge Advice',
    rightTitle: admission?.status === 'discharged' ? 'Discharged' : 'In Progress',
    body: admission?.dischargeSummary || 'No discharge summary recorded.',
    minBodyH: 26,
  })

  // Medication administered during the stay — this is the MAR, which is what
  // the ward actually records; a separate structured discharge prescription
  // isn't captured by the discharge form, so nothing is invented here.
  if (doses.length) {
    y += 4
    y = drawDocTable(pdf, {
      y,
      headers: ['#', 'Medicine', 'Dosage', 'Scheduled', 'Status'],
      widths: [8, 66, 34, 44, 34],
      align: ['center', 'left', 'left', 'left', 'left'],
      rows: doses.map((d, i) => [
        i + 1,
        d.medicine || '--',
        d.dosage || '--',
        d.scheduledTime || '--',
        d.administered
          ? `Given${d.administeredAt ? ' ' + new Date(d.administeredAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}`
          : 'Not given',
      ]),
      bottomLimit: pageHeight - 80,
    })
  }

  // Follow-up + emergency advice, side by side.
  y += 5
  const cardW = contentWidth / 2 - 3
  const cardH = 22
  pdf.setFillColor(230, 255, 250)
  pdf.setDrawColor(129, 230, 217)
  pdf.setLineWidth(0.3)
  pdf.rect(margin, y, cardW, cardH, 'FD')
  pdf.setFontSize(6.8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(35, 78, 82)
  pdf.text('FOLLOW-UP ADVICE & NEXT REVIEW', margin + 3, y + 4.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.2)
  pdf.setTextColor(26, 32, 44)
  pdf.text(pdf.splitTextToSize(
    `Report to ${admission?.departmentName || 'the'} OPD for review. Carry this summary and all reports.`,
    cardW - 6
  ), margin + 3, y + 9)
  pdf.setDrawColor(129, 230, 217)
  pdf.setLineWidth(0.2)
  pdf.text('Review on: ', margin + 3, y + 18)
  pdf.line(margin + 20, y + 18.5, margin + cardW - 3, y + 18.5)

  const ex = margin + cardW + 6
  pdf.setFillColor(255, 245, 245)
  pdf.setDrawColor(254, 178, 178)
  pdf.setLineWidth(0.3)
  pdf.rect(ex, y, cardW, cardH, 'FD')
  pdf.setFontSize(6.8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(155, 44, 44)
  pdf.text('EMERGENCY WARNING SIGNS', ex + 3, y + 4.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.2)
  pdf.setTextColor(116, 42, 42)
  pdf.text(pdf.splitTextToSize(
    'In case of high fever, bleeding, breathlessness, severe pain, persistent vomiting or altered consciousness, '
    + `report immediately to the hospital emergency casualty${facility?.emergencyPhone ? ' (' + facility.emergencyPhone + ')' : ''}.`,
    cardW - 6
  ), ex + 3, y + 9)
  pdf.setTextColor(0, 0, 0)
  y += cardH

  if (patient?.allergies?.length) {
    y += 4
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(197, 48, 48)
    pdf.text(`KNOWN ALLERGIES: ${patient.allergies.join(', ')}`, margin, y)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
  }

  // Two signatures: ward RMO and the consultant who owned the admission.
  const sigY = Math.max(y + 10, pageHeight - 44)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, sigY, pageWidth - margin, sigY)
  const signW = 62
  const blocks = [
    { x: margin + 4, name: admission?.dischargedByName || '', role: 'Resident Medical Officer / Ward Incharge' },
    { x: pageWidth - margin - 4 - signW, name: admission?.doctorName ? `Dr. ${admission.doctorName}` : '', role: 'Consultant Incharge' },
  ]
  for (const b of blocks) {
    pdf.setLineWidth(0.3)
    pdf.line(b.x, sigY + 14, b.x + signW, sigY + 14)
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.text(b.name, b.x + signW / 2, sigY + 17.5, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.setTextColor(113, 128, 150)
    pdf.text(b.role, b.x + signW / 2, sigY + 21, { align: 'center' })
    pdf.setTextColor(0, 0, 0)
  }

  drawDocFooter(pdf, {
    terms: [
      'This is an official computer-generated Inpatient Discharge Summary.',
      'Keep this summary for medical follow-up and insurance / TPA claim settlement.',
    ],
    moduleName: 'IPD Discharge & Clinical Documentation',
  })
  return pdf
}

// Pharmacy retail drug invoice. Indian pharmacy prices are quoted
// GST-inclusive, so the taxable value is back-calculated out of the line
// amount rather than added on top — the patient pays exactly the shelf price.
export async function buildPharmacyInvoicePDF({
  facility, patient, sale, doctor, medicineById = {}, batchById = {}, pharmacistName,
}) {
  const pdf = createPDF()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12

  const gstEnabled = !!facility?.gstEnabled
  const gstRate = Number(facility?.gstRate) || 12
  const items = sale?.items || []
  const total = Number(sale?.total) || items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0)

  const licenceLine = [
    facility?.dlNo20B && `DL 20B: ${facility.dlNo20B}`,
    facility?.dlNo21B && `DL 21B: ${facility.dlNo21B}`,
  ].filter(Boolean).join('  |  ')

  let y = drawDocHeader(pdf, facility, {
    docLabel: sale?.type === 'walk_in' ? 'Pharmacy Invoice (Walk-in)' : 'Pharmacy Tax Invoice',
    docNumber: sale?.billNumber || sale?.id,
    numberPrefix: 'BILL',
    extraLine: licenceLine,
    accent: [39, 103, 73],
  })

  y = drawDocBanner(pdf, {
    y,
    left: 'Retail Drug Invoice & Cash Receipt (Original for Recipient)',
    right: `Date: ${sale?.saleDate
      ? new Date(sale.saleDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '--'}`,
  })

  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')

  y = drawDetailsBox(pdf, {
    y,
    leftRows: [
      ['Patient Name', sale?.patientName || patient?.name || 'Walk-in Customer'],
      ['Age / Sex', ageSex],
      ['UHID Number', sale?.patientUhid || patient?.uhid],
      ['Mobile No', maskPhone(patient?.phone)],
    ],
    rightRows: [
      ['Prescribing Doctor', doctor?.name ? `Dr. ${doctor.name}` : null],
      ['Doctor Reg. No', doctor?.registrationNumber],
      ['Billing Type', sale?.type === 'walk_in' ? 'Walk-in Retail' : 'OPD Prescription'],
      ['ABHA ID / ABDM', patient?.abhaId],
    ],
    labelW: 32,
  })

  y += 4

  const rows = items.map((it, i) => {
    const med = medicineById[it.medicineId] || {}
    const batch = batchById[it.batchId] || {}
    const amount = Number(it.subtotal) || (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)
    return {
      hsn: med.hsnCode || '--',
      amount,
      cells: [
        i + 1,
        [it.name || med.name || '--', med.category].filter(Boolean).join('\n'),
        med.hsnCode || '--',
        it.batchNumber || batch.batchNumber || '--',
        batch.expiryDate
          ? new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' })
          : '--',
        it.quantity,
        Number(it.unitPrice || 0).toFixed(2),
        amount.toFixed(2),
      ],
    }
  })

  y = drawDocTable(pdf, {
    y,
    headers: ['#', 'Medicine / Drug Description', 'HSN', 'Batch', 'Exp', 'Qty', 'Rate (Rs.)', 'Amount (Rs.)'],
    widths: [8, 56, 20, 24, 14, 12, 24, 28],
    align: ['center', 'left', 'center', 'center', 'center', 'center', 'right', 'right'],
    rows: rows.map((r) => r.cells),
    bottomLimit: pageHeight - 105,
  })

  // HSN-wise tax split — the part a GST audit actually looks at.
  let taxableTotal = total
  let taxTotal = 0
  if (gstEnabled) {
    const byHsn = {}
    for (const r of rows) {
      byHsn[r.hsn] = (byHsn[r.hsn] || 0) + r.amount
    }
    const half = gstRate / 2
    const hsnRows = Object.entries(byHsn).map(([hsn, gross]) => {
      const taxable = gross / (1 + gstRate / 100)
      const tax = gross - taxable
      return [hsn, taxable.toFixed(2), `${half}%`, (tax / 2).toFixed(2), `${half}%`, (tax / 2).toFixed(2), tax.toFixed(2)]
    })
    taxableTotal = Object.values(byHsn).reduce((s, g) => s + g / (1 + gstRate / 100), 0)
    taxTotal = total - taxableTotal

    y += 4
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...NAVY)
    pdf.text('HSN-WISE GST SUMMARY (TAX INCLUDED IN RATE)', margin, y)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    y = drawDocTable(pdf, {
      y: y + 1.5,
      headers: ['HSN Code', 'Taxable Value', 'CGST %', 'CGST Amt', 'SGST %', 'SGST Amt', 'Total Tax'],
      widths: [32, 30, 20, 28, 20, 28, 28],
      align: ['left', 'right', 'center', 'right', 'center', 'right', 'right'],
      headerFill: [113, 128, 150],
      fontSize: 7,
      rows: hsnRows,
    })
  }

  y += 4
  y = drawTotalsBox(pdf, {
    y,
    wordsText: amountInWords(total),
    metaLines: [
      `Dispensed by: ${pharmacistName || sale?.dispensedByRole || '--'}`,
      sale?.opdVisitId ? 'Dispensed against an OPD prescription.' : '',
    ],
    calcRows: [
      ...(gstEnabled
        ? [
            { label: 'Taxable Value (Excl. GST)', value: `Rs. ${taxableTotal.toFixed(2)}` },
            { label: `CGST @ ${gstRate / 2}%`, value: `Rs. ${(taxTotal / 2).toFixed(2)}` },
            { label: `SGST @ ${gstRate / 2}%`, value: `Rs. ${(taxTotal / 2).toFixed(2)}` },
          ]
        : [{ label: 'Total Value', value: `Rs. ${total.toFixed(2)}` }]),
      { label: 'Net Payable', value: `Rs. ${total.toFixed(2)}`, style: 'grand' },
      { label: 'Amount Received', value: `Rs. ${total.toFixed(2)}`, style: 'paid' },
    ],
  })

  const sigY = Math.max(y + 6, pageHeight - 46)
  await drawSignatureStrip(pdf, {
    y: sigY,
    qrValue: sale?.billNumber || sale?.id,
    qrTitle: 'Scan to verify this bill',
    qrLines: [`Bill: ${sale?.billNumber || sale?.id || '--'}`],
    signName: pharmacistName || '',
    signRole: 'Registered Pharmacist / Store Incharge',
  })

  drawDocFooter(pdf, {
    terms: [
      'Schedule H / H1 / X drugs are sold only against a valid prescription of a Registered Medical Practitioner.',
      'Goods once sold are not taken back without the original bill. Please check the expiry date before leaving the counter.',
    ],
    moduleName: 'Pharmacy & Drug Inventory Billing',
  })
  return pdf
}

// Pathology / diagnostic lab report. Out-of-range values print in red with a
// LOW/HIGH flag worked out from the test's own reference interval, because a
// result the reader has to compare by eye is the one that gets missed.
function rangeFlag(value, normalRange) {
  const num = parseFloat(value)
  if (!Number.isFinite(num) || !normalRange) return null
  const m = String(normalRange).match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
  if (!m) return null
  const min = parseFloat(m[1])
  const max = parseFloat(m[2])
  if (num < min) return 'LOW'
  if (num > max) return 'HIGH'
  return 'NORMAL'
}

export async function buildLabReportPDF({ facility, patient, order, pathologistName }) {
  const pdf = createPDF()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12

  const items = order?.items || []
  const reportedAt = order?.statusTimestamps?.report_ready || order?.reportedAt || Date.now()

  let y = drawDocHeader(pdf, facility, {
    docLabel: 'Pathology Report',
    docNumber: order?.sampleId || order?.id,
    numberPrefix: 'SAMPLE',
    extraLine: facility?.nablNumber ? `NABL Accredited Lab No. ${facility.nablNumber}` : '',
    accent: [43, 108, 176],
  })

  y = drawDocBanner(pdf, {
    y,
    left: 'Diagnostic Test Report & Clinical Interpretation',
    right: `Reported: ${new Date(reportedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
  })

  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')

  y = drawDetailsBox(pdf, {
    y,
    leftRows: [
      ['Patient Name', order?.patientName || patient?.name],
      ['Age / Sex', ageSex],
      ['UHID Number', order?.patientUhid || patient?.uhid],
      ['Order No.', order?.id],
    ],
    rightRows: [
      ['Referred By', order?.doctorName ? `Dr. ${order.doctorName}` : null],
      ['Sample Collected', order?.statusTimestamps?.sample_collected
        ? new Date(order.statusTimestamps.sample_collected).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : (order?.orderDate ? new Date(order.orderDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null)],
      ['Sample Type', [...new Set(items.map((i) => i.sampleType).filter(Boolean))].join(', ') || null],
      ['ABHA ID / ABDM', patient?.abhaId],
    ],
    labelW: 32,
  })

  y += 4
  y = drawDocTable(pdf, {
    y,
    headers: ['Test Parameter', 'Result', 'Unit', 'Biological Ref. Interval', 'Flag'],
    widths: [62, 30, 20, 48, 26],
    align: ['left', 'center', 'center', 'left', 'center'],
    rows: items.map((it) => [
      it.testName || '--',
      it.result || '--',
      it.unit || '--',
      it.normalRange || '--',
      rangeFlag(it.result, it.normalRange) || (it.abnormal ? 'ABNORMAL' : '--'),
    ]),
    bottomLimit: pageHeight - 80,
  })

  // Re-print abnormal results in red over the table rows we just drew is
  // fragile; instead the out-of-range findings are called out explicitly.
  const abnormal = items.filter((it) => {
    const f = rangeFlag(it.result, it.normalRange)
    return f === 'LOW' || f === 'HIGH' || (f === null && it.abnormal)
  })
  const remarks = items.filter((it) => it.remark)

  if (abnormal.length || remarks.length) {
    y += 4
    const lines = [
      ...abnormal.map((it) => {
        const f = rangeFlag(it.result, it.normalRange)
        return `${it.testName}: ${it.result}${it.unit ? ' ' + it.unit : ''} — ${f || 'ABNORMAL'}`
          + (it.normalRange ? ` (ref ${it.normalRange})` : '')
      }),
      ...remarks.map((it) => `${it.testName}: ${it.remark}`),
    ]
    y = drawSectionBox(pdf, {
      y,
      title: 'Out-of-Range Findings & Laboratory Remarks',
      rightTitle: abnormal.length ? `${abnormal.length} flagged` : 'No abnormal values',
      body: lines.join('\n'),
      minBodyH: 14,
    })
  }

  const sigY = Math.max(y + 6, pageHeight - 46)
  await drawSignatureStrip(pdf, {
    y: sigY,
    qrValue: order?.sampleId || order?.id,
    qrTitle: 'Scan to verify this report',
    qrLines: [`UHID: ${order?.patientUhid || '--'}`],
    signName: pathologistName || order?.reportedBy || '',
    signRole: 'Consultant Pathologist / Lab Director',
  })

  drawDocFooter(pdf, {
    terms: [
      'This is a computer-generated laboratory report.',
      'Results must always be correlated clinically by the treating medical practitioner.',
    ],
    moduleName: 'Laboratory Information System',
  })
  return pdf
}

// Shared demographics rows for the IPD bedside forms.
function ipdDetailRows(patient, admission) {
  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')
  return {
    left: [
      ['Patient Name', patient?.name || admission?.patientName],
      ['Age / Sex', ageSex],
      ['UHID Number', patient?.uhid || admission?.patientUhid],
      ['IPD Admission No', admission?.ipdNumber || admission?.id],
    ],
    right: [
      ['Department', admission?.departmentName],
      ['Ward / Bed', [admission?.wardName, admission?.bedName].filter(Boolean).join(', ')],
      ['Consultant', admission?.doctorName ? `Dr. ${admission.doctorName}` : null],
      ['Admitted On', admission?.admissionDate
        ? new Date(admission.admissionDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : null],
    ],
  }
}

// Daily bedside nursing chart. The vitals grid and fluid balance print blank —
// this sheet is meant to hang at the bed and be filled in by hand each round;
// only the MAR is pre-populated, because those doses are already ordered.
export function buildNursingChartPDF({ facility, patient, admission, doses = [], chartDate = Date.now() }) {
  const pdf = createPDF()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const rows = ipdDetailRows(patient, admission)

  let y = drawDocHeader(pdf, facility, {
    docLabel: 'Bedside Nursing Chart',
    docNumber: admission?.ipdNumber || admission?.id,
    numberPrefix: 'IPD',
    extraLine: [admission?.wardName, admission?.bedName].filter(Boolean).join(' | '),
  })
  y = drawDocBanner(pdf, {
    y,
    left: 'Daily Nursing Chart & Medication Administration Record',
    right: `Date: ${new Date(chartDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`,
  })
  y = drawDetailsBox(pdf, { y, leftRows: rows.left, rightRows: rows.right, labelW: 32 })

  y += 4
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(...NAVY)
  pdf.text('4-HOURLY VITAL SIGNS (TPR / BP / SpO2)', 12, y)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  y = drawDocTable(pdf, {
    y: y + 1.5,
    headers: ['Time', 'Temp (F)', 'Pulse /min', 'Resp /min', 'BP mmHg', 'SpO2 %', 'Nurse Initials & Remarks'],
    widths: [22, 22, 24, 24, 26, 20, 48],
    align: ['left', 'center', 'center', 'center', 'center', 'center', 'left'],
    rows: ['06:00', '10:00', '14:00', '18:00', '22:00', '02:00'].map((t) => [t, '', '', '', '', '', '']),
    bottomLimit: pageHeight - 100,
  })

  if (doses.length) {
    y += 4
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...NAVY)
    pdf.text('MEDICATION ADMINISTRATION RECORD (MAR)', 12, y)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'normal')
    y = drawDocTable(pdf, {
      y: y + 1.5,
      headers: ['#', 'Prescribed Medicine', 'Dosage', 'Scheduled', 'Status', 'Nurse Sign'],
      widths: [8, 58, 32, 28, 30, 30],
      align: ['center', 'left', 'left', 'left', 'left', 'left'],
      rows: doses.map((d, i) => [
        i + 1, d.medicine || '--', d.dosage || '--', d.scheduledTime || '--',
        d.administered ? 'GIVEN' : 'Due', '',
      ]),
      bottomLimit: pageHeight - 70,
    })
  }

  y += 4
  y = drawDocTable(pdf, {
    y,
    headers: ['Fluid Intake Source', 'Intake (mL)', 'Fluid Output Source', 'Output (mL)'],
    widths: [58, 32, 58, 38],
    align: ['left', 'right', 'left', 'right'],
    headerFill: [113, 128, 150],
    rows: [['IV Fluids', '', 'Urine Output', ''], ['Oral', '', 'Drain / Vomitus', ''], ['TOTAL 24-HR INTAKE', '', 'TOTAL 24-HR OUTPUT', '']],
    bottomLimit: pageHeight - 46,
  })

  drawSignRow(pdf, {
    y: Math.max(y + 6, pageHeight - 46),
    blocks: [
      { name: '', role: 'Primary Ward Nurse' },
      { name: '', role: 'Nursing Supervisor' },
      { name: admission?.doctorName ? `Dr. ${admission.doctorName}` : '', role: 'Resident Medical Officer' },
    ],
  })
  drawDocFooter(pdf, {
    terms: [
      'Every dose and vital check must be signed with time and staff initials by the administering nurse.',
      'Verified at each shift handover and filed in the inpatient case record.',
    ],
    moduleName: 'Inpatient Nursing & MAR',
  })
  return pdf
}

// IPD admission sheet, with the informed consent as a second page — the two
// sheets the admission counter prints together for signature.
export function buildAdmissionConsentPDF({ facility, patient, admission }) {
  const pdf = createPDF()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const rows = ipdDetailRows(patient, admission)

  let y = drawDocHeader(pdf, facility, {
    docLabel: 'IPD Admission Sheet',
    docNumber: admission?.ipdNumber || admission?.id,
    numberPrefix: 'ADM',
  })
  y = drawDocBanner(pdf, {
    y,
    left: 'Inpatient Admission Record',
    right: `Admitted: ${admission?.admissionDate
      ? new Date(admission.admissionDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '--'}`,
  })
  y = drawDetailsBox(pdf, {
    y,
    leftRows: [
      ...rows.left,
      ['Mobile No', maskPhone(patient?.phone)],
      ['Address', [patient?.address, patient?.city, patient?.state].filter(Boolean).join(', ')],
    ],
    rightRows: [
      ...rows.right,
      ['ABHA ID / ABDM', patient?.abhaId],
      ['Bed Charge / Day', admission?.ratePerDay != null ? `Rs. ${admission.ratePerDay}` : null],
    ],
    labelW: 32,
  })

  y += 4
  y = drawSectionBox(pdf, {
    y,
    title: 'Provisional Diagnosis & Reason for Admission',
    body: admission?.diagnosis || '',
    ruled: admission?.diagnosis ? 1 : 3,
  })
  y += 3
  // Admission vitals and next-of-kin aren't captured by the admit form, so
  // they print as ruled fields for the counter to complete by hand.
  y = drawSectionBox(pdf, {
    y, title: 'Vital Signs at Admission (BP / Pulse / Temp / SpO2) & Known Allergies',
    body: patient?.allergies?.length ? `Known allergies: ${patient.allergies.join(', ')}` : '',
    ruled: 2,
  })
  y += 3
  y = drawSectionBox(pdf, {
    y, title: 'Next of Kin / Attendant, Contact Number & Insurance / TPA Details', ruled: 3,
  })

  drawSignRow(pdf, {
    y: Math.max(y + 8, pageHeight - 46),
    blocks: [
      { name: '', role: 'Patient / Next of Kin Signature' },
      { name: '', role: 'Admitting Medical Officer' },
      { name: '', role: 'Witness / Ward Nurse' },
    ],
  })
  drawDocFooter(pdf, {
    terms: ['Signed original to be retained in the inpatient case file at the ward nursing station.'],
    moduleName: 'IPD Admission & Consent',
  })

  // ---- Page 2: informed consent ----
  pdf.addPage()
  let cy = drawDocHeader(pdf, facility, {
    docLabel: 'Informed Consent',
    docNumber: admission?.ipdNumber || admission?.id,
    numberPrefix: 'ADM',
  })
  cy = drawDocBanner(pdf, { y: cy, left: 'Informed Consent for Admission & Treatment' })
  cy = drawDetailsBox(pdf, { y: cy, leftRows: rows.left.slice(0, 3), rightRows: rows.right.slice(0, 3), labelW: 32 })

  cy += 4
  const patientName = patient?.name || admission?.patientName || '__________________________'
  const consult = admission?.doctorName ? `Dr. ${admission.doctorName}` : '__________________________'
  cy = drawSectionBox(pdf, {
    y: cy,
    title: 'Consent Declaration',
    body:
      `I, ${patientName} (or next of kin signing on the patient's behalf), give my voluntary informed consent `
      + `for admission to ${facility?.facilityName || 'this hospital'} under the care of ${consult} and team.\n\n`
      + 'The nature of the condition, the proposed investigations and medical or surgical procedures, their '
      + 'expected benefits, the possible risks and complications, and the available alternatives have been '
      + 'explained to me in a language I understand, and my questions have been answered.\n\n'
      + 'I consent to diagnostic tests, administration of medicines, blood transfusion if required, anaesthesia, '
      + 'and to any additional procedure the treating doctors judge necessary during the course of treatment.\n\n'
      + 'I understand that no guarantee has been given to me about the outcome of the treatment.',
    minBodyH: 62,
  })
  cy += 3
  cy = drawSectionBox(pdf, { y: cy, title: 'Procedure / Treatment Specifically Consented To', ruled: 3 })

  drawSignRow(pdf, {
    y: Math.max(cy + 10, pageHeight - 46),
    blocks: [
      { name: '', role: "Patient / Next of Kin Signature & Date" },
      { name: '', role: 'Doctor Explaining the Consent' },
      { name: '', role: 'Witness Signature' },
    ],
  })
  drawDocFooter(pdf, {
    terms: [
      'This consent is printed in English. Where the signatory does not read English, the contents must be '
      + 'explained in a language they understand and that fact recorded by the witness.',
    ],
    moduleName: 'IPD Admission & Consent',
  })
  return pdf
}

// Emergency medico-legal case report. Deliberately a structured blank form:
// the app records the patient, not the police/FIR/injury findings, and a
// medico-legal document must be written and signed by the duty officer.
export function buildMlcReportPDF({ facility, patient, visit }) {
  const pdf = createPDF()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const DANGER = [197, 48, 48]

  const ageSex = [
    formatAge(patient?.dob),
    patient?.gender && patient.gender[0].toUpperCase() + patient.gender.slice(1),
  ].filter(Boolean).join(' / ')

  let y = drawDocHeader(pdf, facility, {
    docLabel: 'Medico-Legal Case (MLC)',
    docNumber: visit?.mlcNumber || visit?.id || patient?.uhid,
    numberPrefix: 'MLC',
    extraLine: facility?.emergencyPhone ? `EMERGENCY CASUALTY 24x7: ${facility.emergencyPhone}` : '',
    accent: DANGER,
  })
  y = drawDocBanner(pdf, {
    y,
    left: 'Medico-Legal Injury & Casualty Examination Report',
    right: `Examined: ${new Date(visit?.visitDate || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
  })
  y = drawDetailsBox(pdf, {
    y,
    leftRows: [
      ['Patient Name', patient?.name || visit?.patientName],
      ['Age / Sex', ageSex],
      ['UHID Number', patient?.uhid || visit?.patientUhid],
      ['Address', [patient?.address, patient?.city, patient?.state].filter(Boolean).join(', ')],
      ['Identification Marks', ''],
    ],
    rightRows: [
      ['Brought By', ''],
      ['Police Station', ''],
      ['DD / FIR No.', ''],
      ['Alleged Incident', ''],
      ['Consciousness / GCS', ''],
    ],
    labelW: 34,
  })

  y += 4
  y = drawSectionBox(pdf, {
    y, title: 'Brief History of Alleged Incident (as narrated by patient / police)', ruled: 3,
  })
  y += 3
  y = drawSectionBox(pdf, {
    y, title: 'General Casualty Examination (BP / Pulse / SpO2 / Pupils / Smell of Alcohol)', ruled: 2,
  })

  y += 4
  y = drawDocTable(pdf, {
    y,
    headers: ['#', 'Description & Location of Injury', 'Dimensions', 'Weapon / Force', 'Nature'],
    widths: [8, 84, 28, 34, 32],
    align: ['center', 'left', 'left', 'left', 'left'],
    headerFill: DANGER,
    rows: [1, 2, 3, 4].map((n) => [n, '', '', '', '']),
    bottomLimit: pageHeight - 60,
  })

  y += 3
  y = drawSectionBox(pdf, { y, title: 'Treatment Given & Opinion / Referral', ruled: 2 })

  drawSignRow(pdf, {
    y: Math.max(y + 6, pageHeight - 46),
    blocks: [
      { name: '', role: 'Signature / Thumb Impression of Injured' },
      { name: '', role: 'Signature of Police Official' },
      { name: '', role: 'Casualty Medical Officer' },
    ],
  })
  drawDocFooter(pdf, {
    terms: [
      'Medico-legal document. Original to be forwarded to the police station; duplicate retained in the hospital MLC record.',
      'To be completed in the doctor\'s own hand and signed with name, registration number and time of examination.',
    ],
    moduleName: 'Emergency & Medico-Legal Records',
  })
  return pdf
}

// OT operative note and anaesthesia record. The app has no OT module, so the
// clinical content prints blank for theatre staff to complete and sign.
export function buildOtRecordPDF({ facility, patient, admission }) {
  const pdf = createPDF()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const rows = ipdDetailRows(patient, admission)

  let y = drawDocHeader(pdf, facility, {
    docLabel: 'OT Surgical & Anaesthesia Record',
    docNumber: admission?.ipdNumber || admission?.id,
    numberPrefix: 'IPD',
  })
  y = drawDocBanner(pdf, {
    y,
    left: 'Operative Record & Intraoperative Anaesthesia Chart',
    right: `Date: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}`,
  })
  y = drawDetailsBox(pdf, {
    y,
    leftRows: rows.left,
    rightRows: [
      ['Operating Surgeon', ''],
      ['Anaesthetist', ''],
      ['Scrub / OT Nurse', ''],
      ['OT Room / ASA Grade', ''],
    ],
    labelW: 34,
  })

  y += 4
  y = drawSectionBox(pdf, {
    y, title: 'Pre-Operative & Post-Operative Diagnosis / Procedure Performed',
    body: admission?.diagnosis ? `Admission diagnosis: ${admission.diagnosis}` : '',
    ruled: 3,
  })
  y += 3
  y = drawSectionBox(pdf, {
    y, title: 'Operative Findings, Step-by-Step Course, Suture & Haemostasis', ruled: 6,
  })
  y += 3
  y = drawSectionBox(pdf, {
    y, title: 'Anaesthesia Technique, Drugs, IV Fluids & Estimated Blood Loss', ruled: 3,
  })

  y += 4
  y = drawDocTable(pdf, {
    y,
    headers: ['Time', 'BP (mmHg)', 'Heart Rate /min', 'SpO2 %', 'Anaesthetist Note'],
    widths: [26, 32, 32, 24, 72],
    align: ['left', 'center', 'center', 'center', 'left'],
    rows: [1, 2, 3, 4].map(() => ['', '', '', '', '']),
    bottomLimit: pageHeight - 50,
  })

  drawSignRow(pdf, {
    y: Math.max(y + 6, pageHeight - 46),
    blocks: [
      { name: '', role: 'Consultant Anaesthetist' },
      { name: '', role: 'Scrub Nurse Verification' },
      { name: '', role: 'Operating Surgeon' },
    ],
  })
  drawDocFooter(pdf, {
    terms: [
      'Operative note must be written immediately after the procedure and signed by the operating surgeon.',
      'Original filed in the inpatient medical record; specimen details recorded separately if sent to pathology.',
    ],
    moduleName: 'Operation Theatre & Surgical Suite',
  })
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

// Advance deposit receipt + running ledger (Phase 9, Part B item 10).
//
// The patient's copy of money handed over before treatment. It is not a bill:
// the amount is a liability the hospital owes back until a discharge bill
// consumes it, which is why the ledger strip below the receipt shows what has
// been adjusted and what is still on deposit. Refunds print from the same
// builder with `mode: 'refund'`, which is what makes the credit note and the
// original receipt agree on the running balance.
export function buildAdvanceDepositReceiptPDF({
  facility, patient, deposit, ledger = [], mode = 'receipt',
}) {
  const pdf = createPDF()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 15
  const isRefund = mode === 'refund'

  let y = addHeader(pdf, facility || {})

  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.text(isRefund ? 'REFUND CREDIT NOTE' : 'ADVANCE DEPOSIT RECEIPT',
    pageWidth / 2, y, { align: 'center' })
  y += 9

  pdf.setFontSize(9.5)
  pdf.setFont('helvetica', 'normal')

  const left = [
    ['Receipt No.', deposit?.receiptNumber || '—'],
    ['Date', formatReceiptDate(deposit?.createdAt)],
    ['Mode', PAYMENT_MODE_LABELS_PDF[deposit?.depositMode] || deposit?.depositMode || '—'],
    ['Voucher', deposit?.voucherNumber || '—'],
  ]
  const right = [
    ['Patient', patient?.name || deposit?.patientName || '—'],
    ['UHID', patient?.uhid || deposit?.patientUhid || '—'],
    ['Age / Sex', [formatAge(patient?.dob), patient?.gender].filter(Boolean).join(' / ') || '—'],
    ['Phone', patient?.phone ? maskPhone(patient.phone) : '—'],
  ]

  const colY = y
  left.forEach(([k, v], i) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${k}:`, margin, colY + i * 6)
    pdf.setFont('helvetica', 'normal')
    pdf.text(String(v), margin + 26, colY + i * 6)
  })
  right.forEach(([k, v], i) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${k}:`, pageWidth / 2 + 5, colY + i * 6)
    pdf.setFont('helvetica', 'normal')
    pdf.text(String(v), pageWidth / 2 + 28, colY + i * 6)
  })
  y = colY + left.length * 6 + 6

  // The amount box — the one number the patient checks at the counter.
  const amount = Number(deposit?.amount) || 0
  pdf.setFillColor(240, 245, 252)
  pdf.setDrawColor(5, 38, 89)
  pdf.setLineWidth(0.4)
  pdf.rect(margin, y, pageWidth - margin * 2, 16, 'FD')
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(5, 38, 89)
  pdf.text(isRefund ? 'Amount Refunded' : 'Amount Received', margin + 4, y + 6.5)
  pdf.setFontSize(14)
  pdf.text(`Rs. ${amount.toFixed(2)}`, pageWidth - margin - 4, y + 7, { align: 'right' })
  pdf.setFontSize(8.5)
  pdf.setFont('helvetica', 'italic')
  pdf.text(amountInWords(amount), margin + 4, y + 12.5)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setDrawColor(0, 0, 0)
  y += 22

  // Running ledger. Without it the receipt states a number the patient cannot
  // reconcile against anything — this is the part that makes it auditable.
  if (ledger.length > 0) {
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Deposit Ledger', margin, y)
    y += 5

    let running = 0
    const rows = ledger.map((e) => {
      const credit = Number(e.credit) || 0
      const debit = Number(e.debit) || 0
      running += credit - debit
      return [
        formatReceiptDate(e.date),
        e.description || e.narration || '—',
        credit ? credit.toFixed(2) : '—',
        debit ? debit.toFixed(2) : '—',
        running.toFixed(2),
      ]
    })
    y = addTable(pdf, {
      headers: ['Date', 'Particulars', 'Deposited', 'Adjusted', 'Balance'],
      rows,
      startY: y,
      colWidths: [24, 76, 26, 26, 28],
    })
    y += 4
  }

  const balance = Number(deposit?.balanceRemaining ?? deposit?.amount ?? 0)
  pdf.setFontSize(10.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Balance on Deposit: Rs. ${balance.toFixed(2)}`, pageWidth - margin, y + 4,
    { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  y += 16

  pdf.setFontSize(8.5)
  pdf.text(isRefund
    ? 'Refund issued against the unadjusted balance of the above deposit.'
    : 'This deposit is refundable and will be adjusted against your final bill.',
    margin, y)
  y += 6
  pdf.text('Received with thanks, subject to realisation.', margin, y)

  const sigY = pdf.internal.pageSize.getHeight() - 32
  pdf.setLineWidth(0.3)
  pdf.line(pageWidth - margin - 55, sigY, pageWidth - margin, sigY)
  pdf.setFontSize(9)
  pdf.text('Authorised Signatory', pageWidth - margin - 27.5, sigY + 5, { align: 'center' })
  pdf.line(margin, sigY, margin + 55, sigY)
  pdf.text('Patient / Attendant', margin + 27.5, sigY + 5, { align: 'center' })

  addFooter(pdf, { text: 'Computer-generated receipt. Please retain for adjustment against your final bill.' })
  return pdf
}

function formatReceiptDate(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
