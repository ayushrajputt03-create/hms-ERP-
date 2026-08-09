// Rupees-in-words for printed bills, in the Indian numbering system
// (thousand / lakh / crore) — not the Western million/billion grouping.
// Every hospital bill and tax invoice in India carries this line, and a
// wrong grouping is the kind of thing an auditor picks up immediately.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n) {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return TENS[t] + (o ? ' ' + ONES[o] : '')
}

function threeDigits(n) {
  const h = Math.floor(n / 100)
  const rest = n % 100
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ')
}

// 12345678 -> "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight"
function integerToWords(num) {
  if (num === 0) return 'Zero'
  const parts = []
  const crore = Math.floor(num / 10000000)
  num %= 10000000
  const lakh = Math.floor(num / 100000)
  num %= 100000
  const thousand = Math.floor(num / 1000)
  const rest = num % 1000

  if (crore) parts.push(`${integerToWords(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (rest) parts.push(threeDigits(rest))
  return parts.join(' ')
}

// "Indian Rupees Two Thousand Five Hundred and Fifty Paise Only"
export function amountInWords(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return ''
  const negative = value < 0
  // Round to paise first so 0.005 float noise can't produce "Zero Paise".
  const totalPaise = Math.round(Math.abs(value) * 100)
  const rupees = Math.floor(totalPaise / 100)
  const paise = totalPaise % 100

  const words = [
    negative ? 'Minus' : '',
    'Indian Rupees',
    integerToWords(rupees),
    paise ? `and ${twoDigits(paise)} Paise` : '',
    'Only',
  ].filter(Boolean).join(' ')

  return words.replace(/\s+/g, ' ')
}
