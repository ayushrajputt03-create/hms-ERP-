export function formatINR(amount) {
  if (amount == null || isNaN(amount)) return '₹0'
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function formatDate(date, format = 'short') {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''

  if (format === 'short') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (format === 'long') {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (format === 'time') {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }
  if (format === 'datetime') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-IN')
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function generateUHID(prefix, counter) {
  return `${prefix}-${String(counter).padStart(6, '0')}`
}

export function debounce(fn, ms = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function classNames(...args) {
  return args.filter(Boolean).join(' ')
}

export function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function truncate(str, len = 30) {
  if (!str || str.length <= len) return str
  return str.slice(0, len) + '…'
}

export function toISODate(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().split('T')[0]
}

export function fromISODate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function calculateAge(dob) {
  if (!dob) return ''
  const birth = dob instanceof Date ? dob : new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}
