import { useEffect, useRef } from 'react'
import { motion, useSpring, useMotionValue, useInView, useReducedMotion, animate } from 'motion/react'
import { HeartPulse } from 'lucide-react'
import { EASE, VIEWPORT } from './landing-data'

export function Reveal({ children, delay = 0, y = 26, className, ...rest }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT} transition={{ duration: 0.7, delay, ease: EASE }} {...rest}>{children}</motion.div>
  )
}

export function Eyebrow({ children, className = '' }) {
  return <Reveal className={`eyebrow ${className}`} y={14}><HeartPulse size={13} /><span>{children}</span></Reveal>
}

export function SectionHead({ eyebrow, title, sub, delay = 0, center = true }) {
  return (
    <div className={`section-head ${center ? '' : 'left'}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Reveal delay={delay}><h2>{title}</h2></Reveal>
      {sub && <Reveal delay={delay + 0.08}><p className="sub">{sub}</p></Reveal>}
    </div>
  )
}

export function Counter({ to, decimals = 0, suffix = '', prefix = '' }) {
  const ref = useRef(null), inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView) return
    const c = animate(0, to, { duration: 2, ease: EASE, onUpdate: (v) => { if (ref.current) ref.current.textContent = prefix + v.toFixed(decimals) + suffix } })
    return () => c.stop()
  }, [inView, to, decimals, prefix, suffix])
  return <b ref={ref} />
}

export function Magnetic({ children, strength = 0.22, className }) {
  const ref = useRef(null), x = useMotionValue(0), y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 15 }), sy = useSpring(y, { stiffness: 220, damping: 15 })
  const reduce = useReducedMotion()
  function move(e) {
    if (reduce) return
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * strength)
    y.set((e.clientY - (r.top + r.height / 2)) * strength)
  }
  return <motion.div ref={ref} className={className} style={{ x: sx, y: sy }} onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0) }}>{children}</motion.div>
}