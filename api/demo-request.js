const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  const { name, org, email, subject, note } = request.body || {}
  if (![name, org, email].every((value) => typeof value === 'string' && value.trim()) || !EMAIL.test(email)) {
    return response.status(400).json({ error: 'Please provide your name, organization, and a valid work email.' })
  }
  const recipient = process.env.DEMO_RECIPIENT_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  const sender = process.env.DEMO_FROM_EMAIL
  if (!recipient || !apiKey || !sender) {
    return response.status(503).json({ error: 'Demo requests are being configured. Please try again shortly.' })
  }
  const clean = (value, max = 1000) => String(value || '').trim().slice(0, max)
  const payload = {
    from: sender, to: [recipient], reply_to: clean(email, 254),
    subject: `HMS ERP demo request — ${clean(org, 140)}`,
    text: `New HMS ERP demo request\n\nName: ${clean(name, 140)}\nOrganization: ${clean(org, 160)}\nEmail: ${clean(email, 254)}\nFacility type: ${clean(subject, 120)}\nNotes: ${clean(note)}\n`,
  }
  const mail = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!mail.ok) return response.status(502).json({ error: 'We could not send your request. Please try again shortly.' })
  return response.status(201).json({ ok: true })
}
