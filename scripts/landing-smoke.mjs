import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
const { JSDOM } = await import(pathToFileURL('C:/Users/AYUSH SINGH/node_modules/jsdom/lib/api.js').href)

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5174/',
  pretendToBeVisual: true,
})

const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.SVGElement = window.SVGElement
globalThis.Element = window.Element
globalThis.Event = window.Event
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
globalThis.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16)
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id)
globalThis.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.matchMedia = globalThis.matchMedia
window.IntersectionObserver = globalThis.IntersectionObserver
window.ResizeObserver = globalThis.ResizeObserver
window.scrollTo = () => {}
window.HTMLElement.prototype.scrollIntoView = () => {}
window.HTMLElement.prototype.attachEvent = function () { return {} }
window.HTMLElement.prototype.detachEvent = function () {}

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'spa', logLevel: 'error' })
try {
  const mod = await server.ssrLoadModule('/src/modules/landing/LandingPage.jsx')
  const LandingPage = mod.default

  const container = document.getElementById('root')
  const root = createRoot(container)

  const errors = []
  window.addEventListener('error', (e) => errors.push(e.message))
  window.addEventListener('unhandledrejection', (e) => errors.push(e.reason?.message || String(e.reason || e)))

  root.render(React.createElement(BrowserRouter, null, React.createElement(LandingPage)))
  await new Promise((r) => setTimeout(r, 900))

  const text = container.textContent || ''

  container.querySelector('.nav-actions .btn.primary')?.click()
  await new Promise((r) => setTimeout(r, 200))

  const modalText = container.textContent || ''
  const checks = {
    rootMounted: !!container.childNodes.length,
    brand: text.includes('HMS Hospital'),
    hero: text.includes('Care, without'),
    sections: text.includes('Everything your hospital needs') && text.includes('One system'),
    trust: text.includes('CityCare Group'),
    pricing: text.includes('₹9,999') && text.includes('Growth'),
    demoModal: modalText.includes('Work email') && modalText.includes('Request demo'),
    renderedChars: text.length,
  }
  console.log(JSON.stringify({ checks, errors }, null, 2))

  root.unmount()
  const pass = checks.rootMounted && checks.brand && checks.hero && checks.sections && checks.trust && checks.pricing && checks.demoModal && errors.length === 0
  console.log(pass ? 'SMOKE_OK' : 'SMOKE_FAIL')
  process.exit(pass ? 0 : 1)
} finally {
  await server.close()
}