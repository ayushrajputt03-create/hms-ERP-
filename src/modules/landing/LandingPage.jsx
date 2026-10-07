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
import { Hero, Marquee, Stats, Trust, Problem, Showcase, CommandCenter, Journey, Operations, Security, Roles, Compare, Pricing, Testimonials, FAQ, CTA } from './sections'
import './landing.css'

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })
  return <motion.div className="progress" style={{ scaleX }} />
}

function Preloader() {
  const [p, setP] = useState(0)
  useEffect(() => {
    const c = animate(0, 100, { duration: 0.72, ease: EASE, onUpdate: (v) => setP(Math.round(v)) })
    return () => c.stop()
  }, [])
  return (
    <div className="preload" aria-hidden="true">
      <motion.div className="preload-logo" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...SPRING_LIGHT }}>
        <span className="tile"><motion.span animate={{ rotate: [0, -12, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: EASE }}><Activity size={22} /></motion.span></span>
        <b>HMS ERP</b>
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
        <Link className="brand" to="/"><span><Activity size={18} /></span><b>HMS <em>ERP</em></b></Link>
        <nav>{navLinks.map((l, i) => <motion.a key={l.label} href={l.href} className={active === l.href ? 'active' : ''} initial={{ opacity: 0, y: -10 }} animate={loading ? {} : { opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.5, ease: EASE }}>{l.label}{active === l.href && <motion.i className="nav-ink" layoutId="nav-ink" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}</motion.a>)}</nav>
        <div className="nav-actions">
          <Link className="sign" to="/login">Sign in</Link>
          <Magnetic className="mag-b"><a className="btn primary" href="#cta" onClick={(e) => { e.preventDefault(); onDemo() }}>Book a demo <ArrowRight size={15} /></a></Magnetic>
        </div>
        <button className="hamb" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}><motion.span animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -4 }} /><motion.span animate={open ? { rotate: -45, y: 0 } : { rotate: 0, y: 4 }} /></button>
      </motion.header>
      <AnimatePresence>
        {open && (
          <motion.div className="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35, ease: EASE }}>
            {navLinks.map((l, i) => <motion.a key={l.label} href={l.href} onClick={() => setOpen(false)} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>{l.label}</motion.a>)}
            <Link to="/login" onClick={() => setOpen(false)}>Sign in</Link>
            <a className="btn primary" href="#cta" onClick={() => { setOpen(false); onDemo() }}>Book a demo <ArrowRight size={16} /></a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function BackToTop({ hidden }) {
  const { scrollY } = useScroll(), [show, setShow] = useState(false)
  useMotionValueEvent(scrollY, 'change', (v) => setShow(v > 640))
  return (
    <AnimatePresence>
      {show && !hidden && <motion.button className="to-top" aria-label="Back to top" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.3, ease: EASE }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={18} /></motion.button>}
    </AnimatePresence>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="foot-brand"><Link className="brand" to="/"><span><Activity size={18} /></span><b>HMS <em>ERP</em></b></Link><p>The operating system for modern healthcare.</p><div className="foot-pills">{['Cloud-ready', 'Role-based access', 'Audit logs'].map((x) => <span key={x}>{x}</span>)}</div></div>
      {footerCols.map(([head, links]) => <div className="foot-col" key={head}><b>{head}</b>{links.map(([label, href]) => href.startsWith('/') ? <Link to={href} key={label}>{label}</Link> : <a href={href} key={label}>{label}</a>)}</div>)}
      <div className="foot-col"><b>Get in touch</b><button className="footer-demo" onClick={() => window.dispatchEvent(new Event('hms:open-demo'))}>Book a product walkthrough</button><span className="foot-note">Our team responds after reviewing your request.</span></div>
      <div className="foot-bottom"><small>© 2026 HMS ERP. All rights reserved.</small><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/security">Security</Link></div></div>
    </footer>
  )
}

export default function LandingPage() {
  const [loading, setLoading] = useState(() => !sessionStorage.getItem('hms-landing-seen') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [open, setOpen] = useState(false)
  const [demo, setDemo] = useState(false)
  useEffect(() => {
    if (!loading) return undefined
    const t = setTimeout(() => { setLoading(false); sessionStorage.setItem('hms-landing-seen', '1') }, 800)
    return () => clearTimeout(t)
  }, [loading])
  useEffect(() => {
    document.body.style.overflow = demo || open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [demo, open])
  useEffect(() => {
    if (!demo && !open) return undefined
    const h = (e) => { if (e.key === 'Escape') { setDemo(false); setOpen(false) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [demo, open])
  const onDemo = useCallback(() => setDemo(true), [])
  useEffect(() => { window.addEventListener('hms:open-demo', onDemo); return () => window.removeEventListener('hms:open-demo', onDemo) }, [onDemo])
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing">
        <a className="skip-link" href="#main">Skip to content</a>
        <AnimatePresence>{loading && <motion.div key="pre" exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.55, ease: EASE }}><Preloader /></motion.div>}</AnimatePresence>
        <ScrollProgress />
        <Nav loading={loading} open={open} setOpen={setOpen} onDemo={onDemo} />
        <main id="main" tabIndex={-1}>
          <Hero loading={loading} onDemo={onDemo} />
          <Marquee />
          <Stats />
          <Trust />
          <Problem />
          <Showcase onDemo={onDemo} />
          <CommandCenter onDemo={onDemo} />
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
        <BackToTop hidden={open || demo} />
        <AnimatePresence>{demo && <DemoModal open={demo} onClose={() => setDemo(false)} />}</AnimatePresence>
      </div>
    </MotionConfig>
  )
}
