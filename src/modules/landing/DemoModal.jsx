import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { CheckCircle2, Send, X } from 'lucide-react'
import { EASE } from './landing-data'

const SUBJECTS = ['Multi-specialty hospital', 'Clinic / single practice', 'Diagnostic center', 'Hospital group / network']

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function DemoModal({ open, onClose }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ name: '', org: '', email: '', subject: SUBJECTS[0], note: '' })
  const panelRef = useRef(null)
  const lastFocus = useRef(null)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    lastFocus.current = document.activeElement
    const p = panelRef.current
    if (!p) return
    const first = p.querySelector('input, select, textarea, button')
    if (first) setTimeout(() => first.focus(), 250)
  }, [open])

  useEffect(() => () => {
    if (lastFocus.current?.focus) lastFocus.current.focus()
  }, [])

  useEffect(() => {
    function trap(e) {
      if (e.key !== 'Tab') return
      const p = panelRef.current
      if (!p) return
      const els = [...p.querySelectorAll(FOCUSABLE)]
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      const response = await fetch('/api/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Unable to send your request. Please try again.')
      setDone(true)
    } catch (err) { setError(err.message || 'Unable to send your request. Please try again.') } finally { setSending(false) }
  }

  function close() {
    onClose()
    setTimeout(() => setDone(false), 400)
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={close}>
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="demo-title" aria-describedby="demo-desc" className={`demo-modal ${done ? 'done' : ''}`} initial={{ opacity: 0, y: 34, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={{ duration: 0.4, ease: EASE }} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="demo-success" role="status" aria-live="polite">
            <motion.div className="check-pop" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}><CheckCircle2 size={46} /></motion.div>
            <h3>Request received</h3>
            <p>Thanks{form.name ? `, ${form.name.split(' ')[0]}` : ''}! Our team will reach out at <strong>{form.email || 'your email'}</strong> to schedule your walkthrough.</p>
            <button className="btn primary" onClick={close}>Done</button>
          </div>
        ) : (
          <>
            <div className="demo-head">
              <div><span className="pulse-dot" /><h3 id="demo-title">Book a demo</h3><p id="demo-desc">Tell us about your facility and we’ll plan a tailored walkthrough.</p></div>
              <button className="modal-x" onClick={close} aria-label="Close"><X size={18} /></button>
            </div>
            <form onSubmit={submit}>
              <div className="frow"><label><span>Full name <em className="req">*</em></span><input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Ananya Verma" autoComplete="name" /></label><label><span>Hospital / clinic <em className="req">*</em></span><input required value={form.org} onChange={(e) => set('org', e.target.value)} placeholder="Sunrise Multispeciality" autoComplete="organization" /></label></div>
              <label className="fcol"><span>Work email <em className="req">*</em></span><input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@hospital.com" autoComplete="email" /></label>
              <label className="fcol"><span>Facility type</span><select value={form.subject} onChange={(e) => set('subject', e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select></label>
              <div className="frow"><label className="fcol"><span>Anything we should know?</span><textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional — beds, specialties, current setup..." /></label></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="btn primary big submit" type="submit" disabled={sending}>{sending ? 'Sending request…' : <>Request demo <Send size={16} /></>}</button>
              <p className="demo-foot">Your details are used only to respond to this request. See our <a href="/privacy">Privacy notice</a>.</p>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
