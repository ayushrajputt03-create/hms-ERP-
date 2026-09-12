import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useScroll, useTransform, useSpring, useMotionValue, useReducedMotion } from 'motion/react'
import { Activity, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown, ShieldCheck } from 'lucide-react'
import { EASE, SPRING, SPRING_LIGHT, VIEWPORT, modules, stats, problems, journey, wards, security, roles, compare, testimonials, faqs, pricing, pricingNote, trustLogos } from './landing-data'
import { Reveal, Eyebrow, SectionHead, Counter, Magnetic } from './primitives'

const viewport = VIEWPORT

function MockChart() {
  return (
    <svg viewBox="0 0 320 88" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="mgr" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#19c0f0" stopOpacity=".32" /><stop offset="1" stopColor="#19c0f0" stopOpacity="0" /></linearGradient></defs>
      <path d="M0 76 C28 70,44 74,62 60 S102 64,124 46 S156 58,176 38 S210 52,238 26 S286 30,320 10 V88 H0Z" fill="url(#mgr)" />
      <motion.path d="M0 76 C28 70,44 74,62 60 S102 64,124 46 S156 58,176 38 S210 52,238 26 S286 30,320 10" fill="none" stroke="#0ea5e9" strokeWidth="2.5"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2.2, ease: EASE }} />
      <motion.circle cx="238" cy="26" r="3.5" fill="#ff5e7e" initial={{ scale: 0 }} whileInView={{ scale: [0, 1.6, 1] }} viewport={{ once: true }} transition={{ delay: 2, duration: 0.5, ease: EASE }} />
    </svg>
  )
}

function ProductUI({ active }) {
  const m = modules[active]
  const names = ['Aarav', 'Mira', 'Kabir']
  const states = [['Registered', 'In queue', 'In consultation'], ['Checked in', 'Waiting', 'Consulting'], ['Admitted', 'Stable', 'Discharge due'], ['Preparing', 'Ready', 'Dispensed'], ['Sample in lab', 'Processing', 'Report ready'], ['Draft', 'Generated', 'Paid']]
  return (
    <div className="product-ui">
      <aside>
        <div className="ui-brand"><span><Activity size={15} /></span>HMS</div>
        {modules.map((mod, i) => <div className={i === active ? 'side-active' : ''} key={mod.n}>{mod.n}</div>)}
      </aside>
      <main>
        <div className="ui-top"><i className="live-dot" /><b>{m.n}</b><span> Operational workspace</span><div className="ui-search">⌕ Search records</div><Bell size={14} /><em>DEMO</em></div>
        <div className="ui-content">
          <div className="ui-title"><div><small>{m.n.toUpperCase()}</small><h3>{active === 0 ? 'Today at a glance' : `${m.n} workspace`}</h3></div><button>+ New record</button></div>
          <div className="ui-stats">
            <div className="metric"><Counter to={active === 4 ? 48 : 128} /><span>{active === 4 ? 'Samples today' : 'Patients today'}</span><small>+12.5%</small></div>
            <div className="metric"><Counter to={active === 2 ? 34 : 24} /><span>{active === 2 ? 'Occupied beds' : 'Appointments'}</span><small>Live</small></div>
            <div className="metric"><b>92%</b><span>Capacity</span><small>Healthy</small></div>
          </div>
          <div className="ui-grid"><div className="chart"><div className="chart-head"><b>Trend</b><span>This week</span></div><MockChart /></div>
            <div className="activity"><div className="chart-head"><b>Live activity</b><span>{m.n}</span></div>{names.map((n, i) => <div className="activity-row" key={n}><em className={`dot d${i}`} /><span><strong>{n} • UHID-204{i}</strong><small>{states[active][i]}</small></span><time>{['10:42', '11:05', '11:20'][i]}</time></div>)}</div></div>
        </div>
      </main>
    </div>
  )
}

function Tilt({ children }) {
  const ref = useRef(null), rx = useMotionValue(0), ry = useMotionValue(0)
  const srx = useSpring(rx, SPRING_LIGHT), sry = useSpring(ry, SPRING_LIGHT)
  const reduce = useReducedMotion()
  function move(e) {
    if (reduce) return
    const r = ref.current.getBoundingClientRect()
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 7)
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 9)
  }
  return <motion.div ref={ref} className="tilt" style={{ rotateX: srx, rotateY: sry, transformPerspective: 1200 }} onPointerMove={move} onPointerLeave={() => { rx.set(0); ry.set(0) }}>{children}</motion.div>
}

function EcgLine() {
  return <svg viewBox="0 0 1400 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40h120l24 0 14-22 16 44 12-22h120l20 0 16-30 14 48 12-18h132l22 0 16-24 14 42 12-18h138l18 0 15-28 13 46 12-18h144l20 0 16-26 13 40 12-14h130l14 0 14-20 13 38 11-18h140" className="ecg-trace" /></svg>
}

export function Hero({ loading, onDemo }) {
  const ref = useRef(null), { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const yOrbs = useTransform(scrollYProgress, [0, 1], [0, 160])
  const yCopy = useTransform(scrollYProgress, [0, 1], [0, 90])
  const yMock = useTransform(scrollYProgress, [0, 1], [0, -60])
  return (
    <section className="hero" id="services" ref={ref}>
      <motion.div className="orb o1" style={{ y: yOrbs }} />
      <motion.div className="orb o2" style={{ y: yOrbs }} />
      <motion.div className="orb o3" style={{ y: yOrbs }} />
      <div className="grid-bg" />
      <div className="ecg-bg"><EcgLine /></div>
      <div className="hero-grid">
        <motion.div className="hero-copy" style={{ y: yCopy }}>
          <Eyebrow><span className="pulse-dot" />Next-generation hospital management</Eyebrow>
          <h1>
            <motion.span className="line" animate={loading ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.9, ease: EASE }}>Care, without</motion.span>
            <motion.span className="line grad" animate={loading ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }} transition={{ delay: 0.26, duration: 0.9, ease: EASE }}>the chaos.</motion.span>
            <motion.span className="line" animate={loading ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }} transition={{ delay: 0.37, duration: 0.9, ease: EASE }}>Every patient. Every department.</motion.span>
          </h1>
          <motion.p animate={loading ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: EASE }}>HMS brings your entire hospital — patients, OPD & IPD, pharmacy, laboratory and billing — into one calm, connected platform built for modern care.</motion.p>
          <motion.div className="hero-buttons" animate={loading ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }} transition={{ delay: 0.62, duration: 0.8, ease: EASE }}>
            <Magnetic className="mag-b"><a className="btn primary big" href="#cta" onClick={(e) => { e.preventDefault(); onDemo() }}>Book a demo <ArrowRight size={17} /></a></Magnetic>
            <Magnetic className="mag-b"><a className="btn ghost big" href="#platform">Explore the platform</a></Magnetic>
          </motion.div>
          <motion.div className="proof" animate={loading ? { opacity: 0 } : { opacity: 1 }} transition={{ delay: 0.78, duration: 0.8 }}>
            {['Cloud ready', 'Role-based access', 'Real-time operations'].map((t) => <span key={t}><Check size={14} />{t}</span>)}
          </motion.div>
        </motion.div>
        <motion.div className="hero-visual" style={{ y: yMock }} animate={loading ? { opacity: 0, y: 40, scale: 0.95 } : { opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.45, duration: 1, ease: EASE }}>
          <div className="vis-rings" />
          <Tilt><ProductUI active={0} /></Tilt>
          <motion.div className="float-card f1" animate={{ y: [0, -12, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: EASE }}><b><Counter to={128} /></b><span>Patients today</span></motion.div>
          <motion.div className="float-card f2" animate={{ y: [0, -14, 0] }} transition={{ duration: 6.2, repeat: Infinity, ease: EASE, delay: 0.8 }}><i>Bed occupancy</i><b><Counter to={92} suffix="%" /></b></motion.div>
          <motion.div className="float-card f3" animate={{ y: [0, -10, 0] }} transition={{ duration: 5, repeat: Infinity, ease: EASE, delay: 1.4 }}><i>Collections today</i><b>₹4.6L</b></motion.div>
        </motion.div>
      </div>
      <motion.a className="scroll-hint" href="#stats" initial={{ opacity: 0 }} animate={loading ? {} : { opacity: 1 }} transition={{ delay: 1.2 }}><span>Scroll to explore</span><i><ChevronDown size={16} /></i></motion.a>
    </section>
  )
}

export function Marquee() {
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {[...['Outpatient', 'Inpatient', 'Pharmacy', 'Laboratory', 'Emergency', 'Diagnostics', 'Ward Management', 'Billing', 'Telemedicine', 'Ambulance'], ...['Outpatient', 'Inpatient', 'Pharmacy', 'Laboratory', 'Emergency', 'Diagnostics', 'Ward Management', 'Billing', 'Telemedicine', 'Ambulance'], ...['Outpatient', 'Inpatient', 'Pharmacy', 'Laboratory', 'Emergency', 'Diagnostics', 'Ward Management', 'Billing', 'Telemedicine', 'Ambulance']].map((t, i) => <span key={i}>{t}<i>+</i></span>)}
      </div>
    </div>
  )
}

export function Stats() {
  return (
    <section className="stats" id="stats">
      {stats.map((s, i) => (
        <Reveal key={s.label} delay={i * 0.08} className={i === 2 ? 'stat center' : 'stat'}>
          <Counter to={s.v} decimals={s.decimals || 0} suffix={s.suffix} />
          <span>{s.label}</span>
          <small>{s.note}</small>
        </Reveal>
      ))}
    </section>
  )
}

export function Trust() {
  return (
    <section className="trust">
      <Reveal className="trust-label" y={12}>Trusted by modern care teams across the region</Reveal>
      <div className="trust-row">
        {trustLogos.map((t, i) => (
          <Reveal key={t.n} delay={i * 0.05} className="trust-logo"><t.Icon size={20} /><span>{t.n}</span></Reveal>
        ))}
      </div>
    </section>
  )
}

export function Problem() {
  return (
    <section className="problem" id="why">
      <div className="problem-copy">
        <Eyebrow>The old way stops here</Eyebrow>
        <Reveal delay={0.06}><h2>Healthcare is complicated.<br /><span className="grad">Your software shouldn’t be.</span></h2></Reveal>
        <Reveal delay={0.12}><p className="sub">Manual registers, disconnected departments and blind spots slow care down. HMS replaces the friction with one connected system.</p></Reveal>
      </div>
      <div className="problem-list">
        {problems.map(([n, x], i) => (
          <Reveal key={x} delay={i * 0.06}>
            <div className="problem-item"><em>{n}</em><span>{x}</span><ArrowUpRight size={18} /></div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export function Showcase({ onDemo }) {
  const [active, setActive] = useState(0)
  return (
    <section className="showcase" id="platform">
      <SectionHead eyebrow="One connected system" title="Everything your hospital needs." sub="Every critical workflow, designed to work together without the handoffs and blind spots." />
      <div className="module-showcase">
        <div className="module-tabs">
          {modules.map((m, i) => (
            <button key={m.n} className={active === i ? 'selected' : ''} onClick={() => setActive(i)}>
              {active === i && <motion.span className="tab-ind" layoutId="tab-ind" transition={SPRING} />}
              <span className="tab-icon"><m.Icon size={17} /></span>
              <span><b>{m.n}</b><small>{m.copy}</small></span>
              <ArrowRight size={15} />
            </button>
          ))}
          <Reveal delay={0.15}><button className="tab cta-tab" onClick={onDemo}>See HMS live for your hospital <ArrowRight size={15} /></button></Reveal>
        </div>
        <Reveal className="module-preview" delay={0.1}><div className="preview-glow" /><AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.4, ease: EASE }}><ProductUI active={active} /></motion.div>
        </AnimatePresence></Reveal>
      </div>
    </section>
  )
}

export function Journey() {
  return (
    <section className="journey">
      <div className="section-head narrow"><Eyebrow>Patient journey, connected</Eyebrow><Reveal delay={0.06}><h2>From appointment to follow-up,<br /><span className="grad">effortlessly.</span></h2></Reveal></div>
      <div className="steps">
        <div className="steps-line"><motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 2.4, ease: EASE }} /></div>
        {journey.map((s, i) => (
          <Reveal key={s.step} delay={i * 0.1} className="step">
            <div className="step-node"><s.Icon size={18} /><em>0{i + 1}</em></div>
            <b>{s.step}</b>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.2} className="workflow-card">
        <div className="wf-head"><span className="pulse-dot" /><b>Live consultation queue</b><button className="btn ghost small" onClick={() => document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth' })}>Open patient workflow <ArrowRight size={14} /></button></div>
        <div className="wf-row"><em>12</em><p>Patients waiting across OPD right now — doctors, diagnostics, pharmacy and billing stay in sync around every patient.</p></div>
      </Reveal>
    </section>
  )
}

export function Operations() {
  return (
    <section className="operations" id="operations">
      <div className="op-copy">
        <Eyebrow>Live operations</Eyebrow>
        <Reveal delay={0.06}><h2>Know every bed.<br /><span className="grad">Every ward. Every admission.</span></h2></Reveal>
        <Reveal delay={0.12}><p className="sub">See the live state of your facility at a glance — from admission to discharge.</p></Reveal>
        <Reveal delay={0.18} className="op-legend"><span><i className="av" />Available</span><span><i className="oc" />Occupied</span><span><i className="rs" />Reserved</span></Reveal>
      </div>
      <div className="bedboard">
        <Reveal className="bed-head" delay={0.1}><span>Central bed board</span><small><i />Live · demo data</small></Reveal>
        {wards.map((w, i) => (
          <Reveal key={w.name} delay={i * 0.09} className="ward">
            <div className="ward-name"><b>{w.name}</b><span>{w.total} beds</span></div>
            <div className="beds">{Array.from({ length: w.total }).map((_, n) => {
              const cls = n % w.pattern[0] === w.pattern[1] ? 'av' : n % 4 === 3 ? 'rs' : 'oc'
              return <i key={n} className={`bed ${cls}`} />
            })}</div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export function Security() {
  return (
    <section className="security">
      <Reveal className="shield-wrap">
        <div className="shield-ring r1" /><div className="shield-ring r2" /><div className="shield"><ShieldCheck size={120} /><motion.div className="shield-pulse" animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 3, repeat: Infinity, ease: EASE }} /></div>
      </Reveal>
      <div>
        <Eyebrow>Controlled by design</Eyebrow>
        <Reveal delay={0.06}><h2>Secure, without slowing care.</h2></Reveal>
        <Reveal delay={0.12}><p className="sub">Each team member gets access to the workflows they need — with records of every meaningful action.</p></Reveal>
        <div className="security-grid">
          {security.map((s, i) => <Reveal key={s.t} delay={i * 0.08}><div className="sc-item"><span><s.Icon size={18} /></span><b>{s.t}</b><small>{s.d}</small></div></Reveal>)}
        </div>
      </div>
    </section>
  )
}

export function Roles() {
  return (
    <section className="roles">
      <div className="roles-copy">
        <Eyebrow>Permission-aware workspaces</Eyebrow>
        <Reveal delay={0.06}><h2>One system.<br /><span className="grad">The right view for every role.</span></h2></Reveal>
        <Reveal delay={0.12}><p className="sub">Workspaces follow the roles already used in HMS, so every team sees the workflows relevant to their day.</p></Reveal>
      </div>
      <div className="role-list">
        {roles.map(([role, scope], i) => (
          <Reveal key={role} delay={i * 0.06}><div className="role-row"><small>ROLE {String(i + 1).padStart(2, '0')}</small><b>{role}</b><span>{scope}</span><ArrowUpRight size={16} /></div></Reveal>
        ))}
      </div>
    </section>
  )
}

export function Compare() {
  return (
    <section className="compare">
      <SectionHead eyebrow="A better operating model" title="Less administration. More healthcare." />
      <div className="compare-grid">
        <Reveal className="panel"><div className="panel-tag">TRADITIONAL</div><h3>Disconnected by default.</h3>{compare.traditional.map((x) => <p key={x}><i>—</i>{x}</p>)}</Reveal>
        <Reveal delay={0.12} className="panel better"><div className="panel-tag">HMS HOSPITAL</div><h3>Connected by design.</h3>{compare.hms.map((x) => <p key={x}><Check size={15} />{x}</p>)}</Reveal>
      </div>
    </section>
  )
}

const priceIcons = { 0: 'cross', 1: 'rocket', 2: 'shield' }

export function Pricing({ onDemo }) {
  return (
    <section className="pricing" id="pricing">
      <SectionHead eyebrow="Simple, honest pricing" title="Plans that grow with your hospital." sub={pricingNote} />
      <div className="price-grid">
        {pricing.map((p, i) => (
          <Reveal key={p.name} delay={i * 0.1} className={p.featured ? 'price-card featured' : 'price-card'}>
            {p.badge && <span className="price-badge">{p.badge}</span>}
            <div className="price-icon"><em className={`pi-${priceIcons[i]}`} /></div>
            <h3>{p.name}</h3>
            <p className="price-tag">{p.tagline}</p>
            <div className="price-amt"><b>{p.price}</b>{p.unit && <span>{p.unit}</span>}</div>
            <ul>{p.features.map((f) => <li key={f}><Check size={15} />{f}</li>)}</ul>
            <Magnetic className="mag-b"><a className={`btn ${p.featured ? 'primary big' : 'ghost'}`} href="#cta" onClick={(e) => { e.preventDefault(); onDemo() }}>Get started <ArrowRight size={16} /></a></Magnetic>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.2} className="price-note"><ShieldCheck size={15} />Free onboarding · No setup fees · Cancel anytime</Reveal>
    </section>
  )
}

export function Testimonials() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % testimonials.length), 5000)
    return () => clearInterval(t)
  }, [])
  const t = testimonials[i]
  return (
    <section className="testimonials" id="stories">
      <SectionHead eyebrow="Built for real operations" title="Designed for the people who keep care moving." />
      <Reveal className="t-card" delay={0.1}>
        <AnimatePresence mode="wait">
          <motion.blockquote key={i} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.5, ease: EASE }}>
            <span className="qmark">“</span>
            <p>{t.q}</p>
            <footer>{t.role}, <em>{t.org}</em></footer>
          </motion.blockquote>
        </AnimatePresence>
        <div className="t-dots">{testimonials.map((_, d) => <button key={d} className={d === i ? 'on' : ''} onClick={() => setI(d)}><span /></button>)}</div>
      </Reveal>
    </section>
  )
}

export function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <section className="faq" id="faq">
      <div className="section-head"><Eyebrow>FAQ</Eyebrow><Reveal delay={0.06}><h2>Questions, answered.</h2></Reveal></div>
      <div className="faq-list">
        {faqs.map((f, i) => (
          <Reveal key={f.q} delay={i * 0.05}>
            <div className={`faq-item ${open === i ? 'open' : ''}`} role="button" tabIndex={0} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} onKeyDown={(e) => e.key === 'Enter' && setOpen(open === i ? null : i)}>
              <span><b>{String(i + 1).padStart(2, '0')}</b>{f.q}<ChevronDown size={17} /></span>
              <AnimatePresence initial={false}>{open === i && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>{f.a}</motion.p>}</AnimatePresence>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export function CTA({ onDemo }) {
  return (
    <section className="cta-sec" id="cta">
      <motion.div className="cta-orb c1" animate={{ y: [0, 22, 0], x: [0, 14, 0] }} transition={{ duration: 9, repeat: Infinity, ease: EASE }} />
      <motion.div className="cta-orb c2" animate={{ y: [0, -20, 0], x: [0, -12, 0] }} transition={{ duration: 10, repeat: Infinity, ease: EASE, delay: 1.5 }} />
      <div className="ecg-bg dark"><EcgLine /></div>
      <Reveal className="cta-inner">
        <Eyebrow>The operating system for modern healthcare</Eyebrow>
        <h2>One platform. Every department.<br /><span className="grad-light">Complete visibility.</span></h2>
        <p>Modernize your hospital operations with HMS. See it live on your own setup — free, no commitment.</p>
        <div className="cta-buttons">
          <Magnetic className="mag-b"><a className="btn primary big" href="#cta" onClick={(e) => { e.preventDefault(); onDemo() }}>Book a demo <ArrowRight size={17} /></a></Magnetic>
          <Magnetic className="mag-b"><a className="btn ghost-light" href="#platform">Explore the platform</a></Magnetic>
        </div>
      </Reveal>
    </section>
  )
}