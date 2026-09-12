import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, CheckCircle2, Send, X } from 'lucide-react'
import { EASE } from './landing-data'

const SUBJECTS = ['Multi-specialty hospital', 'Clinic / single practice', 'Diagnostic center', 'Hospital group / network']

export default function DemoModal({ open, onClose }) {
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ name: '', org: '', email: '', subject: SUBJECTS[0], note: '' })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  function submit(e) {
    e.preventDefault()
    setDone(true)
    try {
      const list = JSON.parse(localStorage.getItem('hms_demo_requests') || '[]')
      list.push({ ...form, at: new Date().toISOString() })
      localStorage.setItem('hms_demo_requests', JSON.stringify(list))
    } catch { /* ignore */ }
  }

  function close() {
    onClose()
    setTimeout(() => setDone(false), 400)
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={close}>
      <motion.div className={`demo-modal ${done ? 'done' : ''}`} initial={{ opacity: 0, y: 34, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={{ duration: 0.4, ease: EASE }} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="demo-success">
            <motion.div className="check-pop" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}><CheckCircle2 size={46} /></motion.div>
            <h3>Request received</h3>
            <p>Thanks{form.name ? `, ${form.name.split(' ')[0]}` : ''}! Our team will reach out at <strong>{form.email || 'your email'}</strong> to schedule your walkthrough.</p>
            <button className="btn primary" onClick={close}>Done</button>
          </div>
        ) : (
          <>
            <div className="demo-head">
              <div><span className="pulse-dot" /><h3>Book a demo</h3><p>See HMS live on your setup — free, no commitment.</p></div>
              <button className="modal-x" onClick={close} aria-label="Close"><X size={18} /></button>
            </div>
            <form onSubmit={submit}>
              <div className="frow"><label><span>Full name</span><input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Ananya Verma" autoFocus /></label><label><span>Hospital / clinic</span><input required value={form.org} onChange={(e) => set('org', e.target.value)} placeholder="Sunrise Multispeciality" /></label></div>
              <label className="fcol"><span>Work email</span><input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@hospital.com" /></label>
              <label className="fcol"><span>Facility type</span><select value={form.subject} onChange={(e) => set('subject', e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select></label>
              <div className="frow"><label className="fcol"><span>Anything we should know?</span><textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional — beds, specialties, current setup..." /></label></div>
              <button className="btn primary big submit" type="submit">Request demo <Send size={16} /></button>
              <p className="demo-foot"><span className="pulse-dot" />We reply within one business day.</p>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}