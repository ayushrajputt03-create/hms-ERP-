import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  motion, AnimatePresence, MotionConfig, useScroll, useSpring,
  useMotionValueEvent, animate,
} from 'motion/react'
import { Activity, ArrowRight, ArrowUp, HeartPulse } from 'lucide-react'
import { EASE, SPRING_LIGHT, navLinks, footerCols } from './landing-data'
import { Magnetic } from './primitives'
import DemoModal from './DemoModal'
import { Hero, Marquee, Stats, Trust, Problem, Showcase, Journey, Operations, Security, Roles, Compare, Pricing, Testimonials, FAQ, CTA } from './sections'
import './landing.css'

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })
  return <motion.div className="progress" style={{ scaleX }} />
}

function Preloader() {
  const [p, setP] = useState(0)
  useEffect(() => {
    const c = animate(0, 100, { duration: 1.5, ease: EASE, onUpdate: (v) => setP(Math.round(v)) })
    return () => c.stop()
  }, [])
  return (
    <div className="preload">
      <motion.div className="preload-logo" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...SPRING_LIGHT }}>
        <span className="tile"><motion.span animate={{ rotate: [0, -12, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: EASE }}><Activity size={22} /></motion.span></span>
        <b>HMS Hospital</b>
      </motion.div>
      <div className="loadbar"><motion.i style={{ width: `${p}%` }} /></div>
      <motion.small initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>{p}%</motion.small>
    </div>
  )
}

function Nav({ loading, open, setOpen, onDemo }) {
  const { scrollY } = useScroll(), [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState(null)
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 40))
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.isIntersecting && setActive(`#${e.target.id}`))
    }, { rootMargin: '-35% 0px -60% 0px', threshold: 0 })
    navLinks.forEach((l) => { const el = document.getElementById(l.href.slice(1)); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [])
  return (
    <>
      <motion.header className={`nav ${scrolled ? 'scrolled' : ''}`} initial={{ y: -70, opacity: 0 }} animate={loading ? {} : { y: 0, opacity: 1 }} transition={{ duration: 0.7, ease: EASE }}>
        <Link className="brand" to="/"><span><Activity size={18} /></span><b>HMS <em>Hospital</em></b></Link>
        <nav>{navLinks.map((l, i) => <motion.a key={l.label} href={l.href} className={active === l.href ? 'active' : ''} initial={{ opacity: 0, y: -10 }} animate={loading ? {} : { opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.5, ease: EASE }}>{l.label}{active === l.href && <motion.i className="nav-ink" layoutId="nav-ink" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}</motion.a>)}</nav>
        <div className="nav-actions">
          <Link className="sign" to="/login">Sign in</Link>
          <Magnetic className="mag-b"><a className="btn primary" href="#cta" onClick={(e) => { e.preventDefault(); onDemo() }}>Book a demo <ArrowRight size={15} /></a></Magnetic>
        </div>
        <button className="hamb" aria-label="Menu" onClick={() => setOpen(!open)}><motion.span animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -4 }} /><motion.span animate={open ? { rotate: -45, y: 0 } : { rotate: 0, y: 4 }} /></button>
      </motion.header>
      <AnimatePresence>
        {open && (
          <motion.div className="mobile-menu" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35, ease: EASE }}>
            {navLinks.map((l, i) => <motion.a key={l.label} href={l.href} onClick={() => setOpen(false)} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>{l.label}</motion.a>)}
            <Link to="/login" onClick={() => setOpen(false)}>Sign in</Link>
            <a className="btn primary" href="#cta" onClick={() => { setOpen(false); onDemo() }}>Book a demo <ArrowRight size={16} /></a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function BackToTop() {
  const { scrollY } = useScroll(), [show, setShow] = useState(false)
  useMotionValueEvent(scrollY, 'change', (v) => setShow(v > 640))
  return (
    <AnimatePresence>
      {show && <motion.button className="to-top" aria-label="Back to top" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.3, ease: EASE }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={18} /></motion.button>}
    </AnimatePresence>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="foot-brand"><Link className="brand" to="/"><span><Activity size={18} /></span><b>HMS <em>Hospital</em></b></Link><p>The operating system for modern healthcare.</p><div className="foot-pills">{['Cloud', 'HIPAA-ready', 'RBAC'].map((x) => <span key={x}>{x}</span>)}</div></div>
      {footerCols.map(([head, links]) => <div className="foot-col" key={head}><b>{head}</b>{links.map((l) => <a href="#" key={l}>{l}</a>)}</div>)}
      <div className="foot-col"><b>Get in touch</b><a href="mailto:hello@hms.erp">hello@hms.erp</a><a href="tel:+910000000000">+91 00000 00000</a><span className="foot-note">Mon–Sat · 9:00–19:00 IST</span></div>
      <div className="foot-bottom"><small>© 2026 HMS Hospital. All rights reserved.</small><div><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Security</a></div></div>
    </footer>
  )
}

export default function LandingPage() {
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [demo, setDemo] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1550)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    document.body.style.overflow = demo ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [demo])
  useEffect(() => {
    if (!demo) return
    const h = (e) => { if (e.key === 'Escape') setDemo(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [demo])
  const onDemo = useCallback(() => setDemo(true), [])
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing">
        <AnimatePresence>{loading && <motion.div key="pre" exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.55, ease: EASE }}><Preloader /></motion.div>}</AnimatePresence>
        <ScrollProgress />
        <Nav loading={loading} open={open} setOpen={setOpen} onDemo={onDemo} />
        <main>
          <Hero loading={loading} onDemo={onDemo} />
          <Marquee />
          <Stats />
          <Trust />
          <Problem />
          <Showcase onDemo={onDemo} />
          <Journey />
          <Operations />
          <Security />
          <Roles />
          <Compare />
          <Pricing onDemo={onDemo} />
          <Testimonials />
          <FAQ />
          <CTA onDemo={onDemo} />
        </main>
        <Footer />
        <BackToTop />
        <AnimatePresence>{demo && <DemoModal open={demo} onClose={() => setDemo(false)} />}</AnimatePresence>
      </div>
    </MotionConfig>
  )
}