// Code 128-B encoder for UHID barcodes on printed slips.
//
// A drawn-to-look-like-a-barcode block of random bars is worse than no barcode
// at all — the counter scanner reads nothing and staff lose trust in the print.
// This is the real Code 128-B symbology, so the UHID on an OPD parchi scans on
// any standard 1D reader.

// Standard Code 128 width patterns, indexed by code value 0-106. Each digit is
// a module width, alternating bar/space starting with a bar.
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '112142', '112241', '122141', '114212', '124112',
  '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143',
  '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131',
  '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const STOP = 106

// Returns { bars, totalModules } or null when there is nothing printable.
export function encodeCode128B(value) {
  const text = String(value ?? '').replace(/[^\x20-\x7E]/g, '')
  if (!text) return null

  const codes = [START_B]
  let checksum = START_B
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32
    codes.push(v)
    checksum += v * (i + 1)
  }
  codes.push(checksum % 103)
  codes.push(STOP)

  const bars = []
  let totalModules = 0
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code]
    for (let i = 0; i < pattern.length; i++) {
      const width = Number(pattern[i])
      bars.push({ isBar: i % 2 === 0, width })
      totalModules += width
    }
  }
  return { bars, totalModules }
}

// Draws the barcode into a jsPDF doc scaled to exactly `width` mm.
// Returns false when the value can't be encoded, so callers can fall back
// to plain text rather than printing a blank box.
export function drawBarcode(pdf, value, { x, y, width, height }) {
  const encoded = encodeCode128B(value)
  if (!encoded) return false

  const unit = width / encoded.totalModules
  let cursor = x
  pdf.setFillColor(0, 0, 0)
  for (const { isBar, width: modules } of encoded.bars) {
    const barWidth = modules * unit
    if (isBar) pdf.rect(cursor, y, barWidth, height, 'F')
    cursor += barWidth
  }
  return true
}
