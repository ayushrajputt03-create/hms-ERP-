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
