import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import {
  Activity, Stethoscope, BedDouble, Pill, FlaskConical, Receipt,
  ShieldCheck, Clock, CheckCircle2, ChevronDown, ChevronRight,
  TrendingUp, Users, ArrowRight, Star, Sparkles, Building2,
  FileText, Award, Smartphone, Check, HelpCircle, Layers, Zap, X, Search
} from 'lucide-react'
import './landing.css'

export default function LandingPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [billingCycle, setBillingCycle] = useState('monthly') // 'monthly' | 'annual'
  const [activePreviewTab, setActivePreviewTab] = useState('opd')
  const [openFaq, setOpenFaq] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Interactive ROI Calculator State
  const [patientsPerDay, setPatientsPerDay] = useState(60)
  const [bedCapacity, setBedCapacity] = useState(25)

  // Computed ROI
  const hoursSavedPerDay = (patientsPerDay * 0.08 + bedCapacity * 0.15).toFixed(1)
  const monthlyRevenueSaved = Math.round(patientsPerDay * 320 + bedCapacity * 1250)

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  const handleCta = () => {
    if (isAuthenticated) {
      navigate('/')
    } else {
      navigate('/register')
    }
  }

  // Sample OPD Data filtered by search query
  const sampleOpdData = [
    { token: 'T-16', name: 'Rajesh Kumar', doctor: 'Dr. A. K. Sharma (Cardiology)', status: 'In Consultation', badgeClass: 'badge-success', action: 'View Rx' },
    { token: 'T-17', name: 'Pooja Verma', doctor: 'Dr. Neha Gupta (Gen. Medicine)', status: 'Waiting in Queue', badgeClass: 'badge-warning', action: 'Call Token' },
    { token: 'T-18', name: 'Amit Patel', doctor: 'Dr. A. K. Sharma (Cardiology)', status: 'Registered (QR)', badgeClass: 'badge-info', action: 'Start Visit' },
    { token: 'T-19', name: 'Sunita Devi', doctor: 'Dr. R. S. Verma (Orthopedics)', status: 'Vitals Recorded', badgeClass: 'badge-purple', action: 'Assign Room' }
  ].filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.doctor.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.token.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="landing-container">
      {/* Glow Backdrop */}
      <div className="landing-glow-bg"></div>

      {/* Top Announcement Bar */}
      <div className="announcement-bar">
        <span>✨ HMS ERP v2.4 Released — Real-time ABDM-ready OPD Queues, Lab Diagnostics & Accounts</span>
        <button onClick={handleCta} className="announcement-link">
          Explore Features <ArrowRight size={14} />
        </button>
      </div>

      {/* Header Navigation */}
      <nav className="landing-nav">
        <div className="nav-brand" onClick={() => navigate('/')}>
          <div className="nav-logo-icon">
            <Activity size={24} />
          </div>
          <div className="nav-brand-title">
            <span className="nav-brand-name">HMS ERP</span>
            <span className="nav-brand-badge">CLOUD OS</span>
          </div>
        </div>

        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#showcase">Product Tour</a>
          <a href="#comparison">Why Us</a>
          <a href="#calculator">ROI Estimator</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>

        <div className="nav-actions">
          {isAuthenticated ? (
            <button className="landing-btn landing-btn-primary" onClick={() => navigate('/')}>
              Go to Dashboard <ArrowRight size={16} />
            </button>
          ) : (
            <>
              <Link to="/login" className="landing-btn landing-btn-ghost">
                Sign In
              </Link>
              <Link to="/register" className="landing-btn landing-btn-primary">
                Get Started Free
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">
          <span className="pulse-dot"></span>
          <span>Engineered for Indian Hospitals, OPD Clinics & Labs</span>
        </div>

        <h1 className="hero-title">
          The Intelligent Hospital Operating System
        </h1>

        <p className="hero-subtitle">
          Streamline OPD patient queues, IPD bed management, pharmacy inventory, diagnostics, and GST billing — all in one unified, ultra-fast cloud system.
        </p>

        <div className="hero-cta-group">
          <button className="landing-btn landing-btn-lg landing-btn-primary glow-button" onClick={handleCta}>
            <Sparkles size={18} /> Start 30-Day Free Trial
          </button>
          <a href="#showcase" className="landing-btn landing-btn-lg landing-btn-outline">
            Watch Product Tour <ChevronRight size={18} />
          </a>
        </div>

        {/* Quick Highlights */}
        <div className="hero-highlights">
          <div className="highlight-item">
            <CheckCircle2 size={16} className="text-success" />
            <span>Instant Setup (&lt; 5 mins)</span>
          </div>
          <div className="highlight-item">
            <CheckCircle2 size={16} className="text-success" />
            <span>No Credit Card Required</span>
          </div>
          <div className="highlight-item">
            <CheckCircle2 size={16} className="text-success" />
            <span>A4 Printable Invoices & Pathology Reports</span>
          </div>
          <div className="highlight-item">
            <CheckCircle2 size={16} className="text-success" />
            <span>GST & ABDM Compliant</span>
          </div>
        </div>

        {/* Live Interactive App Preview Box */}
        <div className="preview-window-container" id="showcase">
          {/* Floating Pill Badges */}
          <div className="floating-badge badge-top-right">
            <Activity size={14} className="text-primary" />
            <span>Token #18 Active • OPD Room 102</span>
          </div>
          <div className="floating-badge badge-bottom-left">
            <ShieldCheck size={14} className="text-success" />
            <span>₹86,400 Today's Collection • 0 Audit Errors</span>
          </div>

          <div className="preview-window">
            <div className="preview-header">
              <div className="window-dots">
                <span className="dot dot-red"></span>
                <span className="dot dot-yellow"></span>
                <span className="dot dot-green"></span>
              </div>
              <div className="preview-url-bar">
                <ShieldCheck size={13} className="text-success" />
                <span>https://hms-erp.app/dashboard</span>
              </div>
              <div className="preview-status">
                <span className="status-indicator"></span> Realtime Live
              </div>
            </div>

            <div className="preview-nav-tabs">
              <button
                className={`preview-tab ${activePreviewTab === 'opd' ? 'active' : ''}`}
                onClick={() => setActivePreviewTab('opd')}
              >
                <Stethoscope size={16} /> OPD & Queue
              </button>
              <button
                className={`preview-tab ${activePreviewTab === 'ipd' ? 'active' : ''}`}
                onClick={() => setActivePreviewTab('ipd')}
              >
                <BedDouble size={16} /> IPD Bed Board
              </button>
              <button
                className={`preview-tab ${activePreviewTab === 'pharmacy' ? 'active' : ''}`}
                onClick={() => setActivePreviewTab('pharmacy')}
              >
                <Pill size={16} /> Pharmacy & Stock
              </button>
              <button
                className={`preview-tab ${activePreviewTab === 'lab' ? 'active' : ''}`}
                onClick={() => setActivePreviewTab('lab')}
              >
                <FlaskConical size={16} /> Lab & Pathology
              </button>
              <button
                className={`preview-tab ${activePreviewTab === 'billing' ? 'active' : ''}`}
                onClick={() => setActivePreviewTab('billing')}
              >
                <Receipt size={16} /> Billing & Accounts
              </button>
            </div>

            {/* Interactive Screen Content Mockup */}
            <div className="preview-body">
              {activePreviewTab === 'opd' && (
                <div className="preview-screen">
                  <div className="preview-stats-row">
                    <div className="preview-stat-card">
                      <span className="stat-label">Today's OPD Visits</span>
                      <span className="stat-value">48 Patients</span>
                      <span className="stat-sub text-success">↑ 14% vs yesterday</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Token Series</span>
                      <span className="stat-value">Token #18 Active</span>
                      <span className="stat-sub">Dr. Sharma (OPD 102)</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Avg Wait Time</span>
                      <span className="stat-value">12 Mins</span>
                      <span className="stat-sub text-success">⚡ 60% faster queue</span>
                    </div>
                  </div>

                  {/* Interactive Search Bar Filter */}
                  <div className="preview-search-bar">
                    <Search size={14} className="text-muted" />
                    <input
                      type="text"
                      placeholder="Search patient, doctor, or token (e.g. Sharma, Rajesh, T-17)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="preview-mock-table">
                    <div className="mock-table-head">
                      <span>Token</span>
                      <span>Patient Name</span>
                      <span>Doctor / Dept</span>
                      <span>Status</span>
                      <span>Action</span>
                    </div>

                    {sampleOpdData.length > 0 ? (
                      sampleOpdData.map((row, idx) => (
                        <div key={idx} className="mock-table-row">
                          <span className="token-pill">{row.token}</span>
                          <strong>{row.name}</strong>
                          <span>{row.doctor}</span>
                          <span className={`badge ${row.badgeClass}`}>{row.status}</span>
                          <button className="mock-btn">{row.action}</button>
                        </div>
                      ))
                    ) : (
                      <div className="mock-empty-state">
                        No matching OPD patients found for "{searchQuery}"
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activePreviewTab === 'ipd' && (
                <div className="preview-screen">
                  <div className="preview-stats-row">
                    <div className="preview-stat-card">
                      <span className="stat-label">Bed Occupancy</span>
                      <span className="stat-value">38 / 45 Beds</span>
                      <span className="stat-sub text-warning">84% Occupied</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Active Admissions</span>
                      <span className="stat-value">38 Patients</span>
                      <span className="stat-sub">General & ICU Wards</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Pending Discharge</span>
                      <span className="stat-value">4 Clearances</span>
                      <span className="stat-sub text-success">Bills Reconciled</span>
                    </div>
                  </div>

                  <div className="preview-grid-cards">
                    <div className="ward-card">
                      <h4>ICU Ward (Bed 101 - 108)</h4>
                      <div className="bed-badges">
                        <span className="bed-item occupied">B-101 (Occupied)</span>
                        <span className="bed-item occupied">B-102 (Occupied)</span>
                        <span className="bed-item available">B-103 (Available)</span>
                        <span className="bed-item occupied">B-104 (Occupied)</span>
                      </div>
                    </div>
                    <div className="ward-card">
                      <h4>Female General Ward (Bed 201 - 215)</h4>
                      <div className="bed-badges">
                        <span className="bed-item occupied">B-201 (Occupied)</span>
                        <span className="bed-item available">B-202 (Available)</span>
                        <span className="bed-item available">B-203 (Available)</span>
                        <span className="bed-item cleaning">B-204 (Cleaning)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePreviewTab === 'pharmacy' && (
                <div className="preview-screen">
                  <div className="preview-stats-row">
                    <div className="preview-stat-card">
                      <span className="stat-label">Today's Dispensed</span>
                      <span className="stat-value">₹24,500</span>
                      <span className="stat-sub">112 Prescriptions</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Low Stock Alert</span>
                      <span className="stat-value text-danger">3 Medicines</span>
                      <span className="stat-sub">Below Reorder Level</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Expiring Soon</span>
                      <span className="stat-value text-warning">2 Batches</span>
                      <span className="stat-sub">Within 30 Days</span>
                    </div>
                  </div>

                  <div className="preview-mock-table">
                    <div className="mock-table-head">
                      <span>Medicine Name</span>
                      <span>Batch No.</span>
                      <span>Expiry</span>
                      <span>Stock Qty</span>
                      <span>Status</span>
                    </div>
                    <div className="mock-table-row">
                      <strong>Paracetamol 650mg</strong>
                      <span className="font-mono">BATCH-9821</span>
                      <span>10/2027</span>
                      <span>450 Strips</span>
                      <span className="badge badge-success">In Stock</span>
                    </div>
                    <div className="mock-table-row">
                      <strong>Amoxicillin 500mg</strong>
                      <span className="font-mono">BATCH-4410</span>
                      <span>12/2026</span>
                      <span>12 Strips</span>
                      <span className="badge badge-danger">Low Stock</span>
                    </div>
                  </div>
                </div>
              )}

              {activePreviewTab === 'lab' && (
                <div className="preview-screen">
                  <div className="preview-stats-row">
                    <div className="preview-stat-card">
                      <span className="stat-label">Pending Lab Orders</span>
                      <span className="stat-value">6 Tests</span>
                      <span className="stat-sub">In Processing</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Reports Verified</span>
                      <span className="stat-value text-success">32 Today</span>
                      <span className="stat-sub">Pathologist Approved</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">A4 Pathology PDF</span>
                      <span className="stat-value">Single-Click</span>
                      <span className="stat-sub">Print / Download</span>
                    </div>
                  </div>

                  <div className="preview-mock-table">
                    <div className="mock-table-head">
                      <span>Order ID</span>
                      <span>Patient Name</span>
                      <span>Test Category</span>
                      <span>Status</span>
                      <span>PDF Report</span>
                    </div>
                    <div className="mock-table-row">
                      <span className="font-mono">LAB-1092</span>
                      <strong>Suresh Sharma</strong>
                      <span>Complete Blood Count (CBC)</span>
                      <span className="badge badge-success">Result Ready</span>
                      <button className="mock-btn">Print Report</button>
                    </div>
                    <div className="mock-table-row">
                      <span className="font-mono">LAB-1093</span>
                      <strong>Ananya Roy</strong>
                      <span>Thyroid Profile (T3, T4, TSH)</span>
                      <span className="badge badge-warning">Sample Collected</span>
                      <button className="mock-btn">Enter Values</button>
                    </div>
                  </div>
                </div>
              )}

              {activePreviewTab === 'billing' && (
                <div className="preview-screen">
                  <div className="preview-stats-row">
                    <div className="preview-stat-card">
                      <span className="stat-label">Today's Collection</span>
                      <span className="stat-value text-success">₹86,400</span>
                      <span className="stat-sub">Multi-Mode Ledger</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">UPI / Card Share</span>
                      <span className="stat-value">68% Digital</span>
                      <span className="stat-sub">Instant QR Receipt</span>
                    </div>
                    <div className="preview-stat-card">
                      <span className="stat-label">Outstanding Balance</span>
                      <span className="stat-value text-warning">₹12,200</span>
                      <span className="stat-sub">4 Invoices</span>
                    </div>
                  </div>

                  <div className="preview-mock-table">
                    <div className="mock-table-head">
                      <span>Invoice #</span>
                      <span>Patient</span>
                      <span>Mode</span>
                      <span>Total</span>
                      <span>Payment Status</span>
                    </div>
                    <div className="mock-table-row">
                      <span className="font-mono">INV-2026-084</span>
                      <strong>Sunita Devi</strong>
                      <span>UPI (GPay)</span>
                      <span>₹1,850</span>
                      <span className="badge badge-success">Paid</span>
                    </div>
                    <div className="mock-table-row">
                      <span className="font-mono">INV-2026-085</span>
                      <strong>Vikas Malhotra</strong>
                      <span>Cash</span>
                      <span>₹3,500</span>
                      <span className="badge badge-warning">Partially Paid</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid / Key Modules */}
      <section className="features-section" id="features">
        <div className="section-header">
          <span className="section-badge">Built for Real Hospital Operations</span>
          <h2>Everything You Need to Run Your Healthcare Facility</h2>
          <p>No bloated software. No complex setups. Every module is tailored for Indian clinical workflows.</p>
        </div>

        <div className="bento-grid">
          {/* Main Large Bento Hero Card */}
          <div className="bento-card bento-hero">
            <div className="feature-icon icon-blue">
              <Stethoscope size={28} />
            </div>
            <h3>Smart OPD & QR Queueing</h3>
            <p>Patients scan QR posters on their phone or get instant token slips at reception. Live queue board keeps OPD uncrowded.</p>
            <ul className="feature-list">
              <li><Check size={14} /> Unique daily doctor token series</li>
              <li><Check size={14} /> Chief complaint & vital sign logging</li>
              <li><Check size={14} /> Quick digital prescription templates</li>
            </ul>
          </div>

          <div className="bento-card">
            <div className="feature-icon icon-amber">
              <BedDouble size={24} />
            </div>
            <h3>IPD Admissions & Bed Board</h3>
            <p>Visual ward bed board with live color-coded statuses (Occupied, Available, Cleaning). Complete admission-to-discharge flow.</p>
            <ul className="feature-list">
              <li><Check size={14} /> Bed transfer & nursing chart history</li>
              <li><Check size={14} /> Printable Consent & MLC Forms</li>
              <li><Check size={14} /> Auto itemization to final IPD invoice</li>
            </ul>
          </div>

          <div className="bento-card">
            <div className="feature-icon icon-emerald">
              <Pill size={24} />
            </div>
            <h3>Pharmacy & Batch Stock</h3>
            <p>FEFO (First Expired First Out) stock management with low-stock alerts, GST rates presets, and instant counter dispensing.</p>
            <ul className="feature-list">
              <li><Check size={14} /> Batch & expiry date tracking</li>
              <li><Check size={14} /> One-click bill generation</li>
              <li><Check size={14} /> Supplier purchase ledger</li>
            </ul>
          </div>

          <div className="bento-card">
            <div className="feature-icon icon-purple">
              <FlaskConical size={24} />
            </div>
            <h3>Lab & Pathology Workflow</h3>
            <p>From test booking to sample barcode tracking, result entry, and single-click A4 pathology PDF report generation.</p>
            <ul className="feature-list">
              <li><Check size={14} /> Normal range reference values</li>
              <li><Check size={14} /> Attachment upload for scanned labs</li>
              <li><Check size={14} /> Direct link to billing queue</li>
            </ul>
          </div>

          <div className="bento-card">
            <div className="feature-icon icon-indigo">
              <Receipt size={24} />
            </div>
            <h3>GST Billing & TPA Insurance</h3>
            <p>Multi-mode payments (Cash, UPI, Card, NetBanking), credit notes, refunds, and TPA insurance claim tracking with approved limits.</p>
            <ul className="feature-list">
              <li><Check size={14} /> A4 GST Tax Invoices</li>
              <li><Check size={14} /> Discount approvals with admin audit</li>
              <li><Check size={14} /> WhatsApp invoice link sharing</li>
            </ul>
          </div>

          <div className="bento-card">
            <div className="feature-icon icon-teal">
              <TrendingUp size={24} />
            </div>
            <h3>Double-Entry Accounts & Payroll</h3>
            <p>Full General Ledger with Trial Balance, cash position, expense vouchers, and automated staff monthly payroll registers.</p>
            <ul className="feature-list">
              <li><Check size={14} /> Automatic voucher posting from billing</li>
              <li><Check size={14} /> Doctor revenue-share accruals</li>
              <li><Check size={14} /> Audit log of every financial action</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Comparison Section: Legacy Systems vs HMS ERP */}
      <section className="comparison-section" id="comparison">
        <div className="section-header">
          <span className="section-badge">Why Healthcare Providers Choose Us</span>
          <h2>Traditional Paper / Legacy Software vs. HMS ERP Cloud OS</h2>
          <p>See why modern clinics and hospitals switch to our unified operating system.</p>
        </div>

        <div className="comparison-grid">
          <div className="comparison-card legacy-card">
            <div className="comparison-header">
              <h3>❌ Legacy / Paper Systems</h3>
              <span>Traditional Desktop Tools</span>
            </div>
            <ul className="comparison-list">
              <li><X size={16} className="text-danger" /> Crowded OPD waiting rooms with unorganized queues</li>
              <li><X size={16} className="text-danger" /> Slow paper billing & manual GST calculation errors</li>
              <li><X size={16} className="text-danger" /> Expired pharmacy stock loss due to manual tracking</li>
              <li><X size={16} className="text-danger" /> High setup cost & complicated software installations</li>
              <li><X size={16} className="text-danger" /> Restricted to a single desktop computer in clinic</li>
            </ul>
          </div>

          <div className="comparison-card modern-card">
            <div className="comparison-header">
              <h3>⚡ HMS ERP Cloud OS</h3>
              <span className="pill-badge">Next-Gen SaaS</span>
            </div>
            <ul className="comparison-list">
              <li><CheckCircle2 size={16} className="text-success" /> Live QR self-booking & digital token series</li>
              <li><CheckCircle2 size={16} className="text-success" /> 1-Click A4 GST invoices with UPI QR codes</li>
              <li><CheckCircle2 size={16} className="text-success" /> Automated FEFO batch stock & expiry alerts</li>
              <li><CheckCircle2 size={16} className="text-success" /> 100% Instant Cloud Setup (&lt; 5 minutes)</li>
              <li><CheckCircle2 size={16} className="text-success" /> Accessible securely on Laptop, Tablet, or Smartphone</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Interactive ROI & Time Savings Estimator */}
      <section className="calculator-section" id="calculator">
        <div className="calculator-box">
          <div className="calculator-header">
            <span className="section-badge">Interactive Estimator</span>
            <h2>Calculate Your Facility's Monthly Time & Revenue Savings</h2>
            <p>See how much time and money HMS ERP saves your administrative and clinical staff every single month.</p>
          </div>

          <div className="calculator-grid">
            <div className="calculator-inputs">
              <div className="slider-group">
                <div className="slider-header">
                  <label>Average OPD Patients Per Day</label>
                  <span className="slider-value">{patientsPerDay} Patients</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="5"
                  value={patientsPerDay}
                  onChange={(e) => setPatientsPerDay(Number(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <div className="slider-header">
                  <label>Active IPD Beds Capacity</label>
                  <span className="slider-value">{bedCapacity} Beds</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="2"
                  value={bedCapacity}
                  onChange={(e) => setBedCapacity(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="calculator-results">
              <div className="result-card">
                <Clock size={24} className="text-primary" />
                <div>
                  <span className="result-number">{hoursSavedPerDay} Hrs</span>
                  <span className="result-label">Saved Every Day in OPD/IPD Queues</span>
                </div>
              </div>

              <div className="result-card">
                <TrendingUp size={24} className="text-success" />
                <div>
                  <span className="result-number">₹{monthlyRevenueSaved.toLocaleString('en-IN')}</span>
                  <span className="result-label">Est. Monthly Leakage Prevented</span>
                </div>
              </div>

              <div className="result-card">
                <Zap size={24} className="text-amber" />
                <div>
                  <span className="result-number">100% Paperless</span>
                  <span className="result-label">Instant Digital A4 Reports & Invoices</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pricing-section" id="pricing">
        <div className="section-header">
          <span className="section-badge">Simple, Transparent Pricing</span>
          <h2>Choose the Right Plan for Your Facility</h2>
          <p>No hidden charges. No per-user penalties. Full access to features with 30-day free trial.</p>

          {/* Monthly / Annual Toggle */}
          <div className="pricing-toggle">
            <button
              className={`toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly Billing
            </button>
            <button
              className={`toggle-btn ${billingCycle === 'annual' ? 'active' : ''}`}
              onClick={() => setBillingCycle('annual')}
            >
              Annual Billing <span className="discount-pill">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="pricing-grid">
          {/* Plan 1 */}
          <div className="pricing-card">
            <div className="plan-name">Solo Clinic</div>
            <div className="plan-desc">Perfect for individual doctors & small OPD clinics</div>
            <div className="plan-price">
              <span className="currency">₹</span>
              <span className="amount">{billingCycle === 'annual' ? '799' : '999'}</span>
              <span className="period">/ month</span>
            </div>

            <ul className="plan-features">
              <li><CheckCircle2 size={16} className="text-success" /> OPD Queue & Token System</li>
              <li><CheckCircle2 size={16} className="text-success" /> Patient Profile & Consultation Rx</li>
              <li><CheckCircle2 size={16} className="text-success" /> OPD Billing & Invoicing</li>
              <li><CheckCircle2 size={16} className="text-success" /> QR Code Self-Booking Page</li>
              <li><CheckCircle2 size={16} className="text-success" /> Up to 3 Doctor / Staff Accounts</li>
            </ul>

            <button className="landing-btn landing-btn-outline landing-btn-block" onClick={handleCta}>
              Start 30-Day Free Trial
            </button>
          </div>

          {/* Plan 2 - Popular */}
          <div className="pricing-card popular">
            <div className="popular-tag">MOST POPULAR</div>
            <div className="plan-name">Nursing Home</div>
            <div className="plan-desc">For nursing homes & hospitals up to 30 beds</div>
            <div className="plan-price">
              <span className="currency">₹</span>
              <span className="amount">{billingCycle === 'annual' ? '1,999' : '2,499'}</span>
              <span className="period">/ month</span>
            </div>

            <ul className="plan-features">
              <li><CheckCircle2 size={16} className="text-success" /> All Solo Clinic Features</li>
              <li><CheckCircle2 size={16} className="text-success" /> Live IPD Ward Bed Management</li>
              <li><CheckCircle2 size={16} className="text-success" /> In-house Pharmacy & Batch Stock</li>
              <li><CheckCircle2 size={16} className="text-success" /> Accounts & Staff Monthly Payroll</li>
              <li><CheckCircle2 size={16} className="text-success" /> Up to 15 Staff Accounts</li>
            </ul>

            <button className="landing-btn landing-btn-primary landing-btn-block" onClick={handleCta}>
              Start 30-Day Free Trial
            </button>
          </div>

          {/* Plan 3 */}
          <div className="pricing-card">
            <div className="plan-name">Multi-Specialty</div>
            <div className="plan-desc">Full suite for multi-specialty hospitals & diagnostic centers</div>
            <div className="plan-price">
              <span className="currency">₹</span>
              <span className="amount">{billingCycle === 'annual' ? '3,999' : '4,999'}</span>
              <span className="period">/ month</span>
            </div>

            <ul className="plan-features">
              <li><CheckCircle2 size={16} className="text-success" /> Everything in Nursing Home Plan</li>
              <li><CheckCircle2 size={16} className="text-success" /> Full Lab & Pathology Workflow</li>
              <li><CheckCircle2 size={16} className="text-success" /> TPA Insurance Claims & Discounts</li>
              <li><CheckCircle2 size={16} className="text-success" /> Double-Entry General Ledger</li>
              <li><CheckCircle2 size={16} className="text-success" /> Unlimited Doctor & Staff Accounts</li>
            </ul>

            <button className="landing-btn landing-btn-outline landing-btn-block" onClick={handleCta}>
              Start 30-Day Free Trial
            </button>
          </div>

          {/* Plan 4 */}
          <div className="pricing-card">
            <div className="plan-name">Diagnostic Lab</div>
            <div className="plan-desc">Tailored for standalone pathology & radiology labs</div>
            <div className="plan-price">
              <span className="currency">₹</span>
              <span className="amount">{billingCycle === 'annual' ? '1,199' : '1,499'}</span>
              <span className="period">/ month</span>
            </div>

            <ul className="plan-features">
              <li><CheckCircle2 size={16} className="text-success" /> Diagnostic Test Master & Tariff</li>
              <li><CheckCircle2 size={16} className="text-success" /> Sample Barcode & Order Tracking</li>
              <li><CheckCircle2 size={16} className="text-success" /> A4 PDF Pathology Report Release</li>
              <li><CheckCircle2 size={16} className="text-success" /> Lab Billing & Daily Collection</li>
              <li><CheckCircle2 size={16} className="text-success" /> Up to 8 Lab Tech Accounts</li>
            </ul>

            <button className="landing-btn landing-btn-outline landing-btn-block" onClick={handleCta}>
              Start 30-Day Free Trial
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials-section">
        <div className="section-header">
          <span className="section-badge">Trusted by Doctors & Administrators</span>
          <h2>What Healthcare Leaders Say</h2>
        </div>

        <div className="testimonials-grid">
          <div className="testimonial-card">
            <div className="stars">
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
            </div>
            <p className="quote">"HMS ERP cut our morning OPD queue wait time from 40 minutes to under 10 minutes. The QR self-booking is a game changer for our clinic."</p>
            <div className="author">
              <strong>Dr. Rajesh Malhotra</strong>
              <span>Senior Cardiologist, City Health Clinic (Delhi)</span>
            </div>
          </div>

          <div className="testimonial-card">
            <div className="stars">
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
            </div>
            <p className="quote">"The IPD bed board and pharmacy batch FEFO stock tracking prevented thousands of rupees in medicine expiration. Extremely easy for our nursing staff to use."</p>
            <div className="author">
              <strong>Dr. Sunita Rao</strong>
              <span>Medical Director, Apex Nursing Home (Lucknow)</span>
            </div>
          </div>

          <div className="testimonial-card">
            <div className="stars">
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
              <Star size={16} fill="#eab308" color="#eab308" />
            </div>
            <p className="quote">"Generating A4 GST billing and instant pathology reports used to require 3 different software tools. HMS ERP combined everything in one place seamlessly."</p>
            <div className="author">
              <strong>Vikas Gupta</strong>
              <span>Operations Manager, Sanjeevani Hospital (Noida)</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section" id="faq">
        <div className="section-header">
          <span className="section-badge">Got Questions?</span>
          <h2>Frequently Asked Questions</h2>
        </div>

        <div className="faq-container">
          {[
            {
              q: "How fast can we setup HMS ERP for our hospital or clinic?",
              a: "Setup takes under 5 minutes. Select your facility type (Solo Clinic, Nursing Home, Multi-Specialty, or Lab), enter your facility name, and your environment is immediately provisioned with default module configurations."
            },
            {
              q: "Can doctors access prescriptions and OPD queue on mobile or tablet?",
              a: "Yes! HMS ERP is built as a fully responsive Web App. Doctors and staff can view patient histories, issue digital Rx, and check live queues on tablets, laptops, or smartphones."
            },
            {
              q: "Is GST supported for pharmacy, consultation, and IPD billing?",
              a: "Absolutely. HMS ERP includes built-in GST rate presets (18% for services, 12% for pharmacy goods, exempt rates) and generates A4 GST Tax Invoices with breakdown of CGST/SGST/IGST."
            },
            {
              q: "How does role-based security work?",
              a: "HMS ERP enforces strict Role-Based Access Control (RBAC). Doctors see only clinical patient data; Billing Staff see revenue & invoice ledgers; Lab Techs handle test orders; Admins maintain full facility visibility."
            },
            {
              q: "Can we export our daily collections and accounting ledgers?",
              a: "Yes, every report in HMS ERP (Daily Collections, Audit Logs, Patient Lists, Pharmacy Stock) includes a single-click 'Export CSV' option compatible with Excel and Tally."
            }
          ].map((item, idx) => (
            <div key={idx} className={`faq-item ${openFaq === idx ? 'open' : ''}`} onClick={() => toggleFaq(idx)}>
              <div className="faq-question">
                <span>{item.q}</span>
                <ChevronDown size={18} className="faq-icon" />
              </div>
              {openFaq === idx && (
                <div className="faq-answer">
                  <p>{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA Banner */}
      <section className="cta-banner">
        <div className="cta-banner-content">
          <h2>Transform Your Hospital Operations Today</h2>
          <p>Join hundreds of healthcare facilities managing OPDs, Beds, Pharmacy, Labs, and Accounts effortlessly.</p>
          <button className="landing-btn landing-btn-lg landing-btn-light" onClick={handleCta}>
            Start Your 30-Day Free Trial <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-col brand-col">
            <div className="nav-brand">
              <div className="nav-logo-icon">
                <Activity size={20} />
              </div>
              <span className="nav-brand-name">HMS ERP</span>
            </div>
            <p className="footer-desc">
              Next-generation hospital and clinic management system built for speed, security, and effortless healthcare delivery.
            </p>
            <span className="copyright">© {new Date().getFullYear()} HMS ERP Systems. All rights reserved.</span>
          </div>

          <div className="footer-col">
            <h4>Modules</h4>
            <a href="#features">OPD & Queue</a>
            <a href="#features">IPD & Beds</a>
            <a href="#features">Pharmacy & Stock</a>
            <a href="#features">Lab & Diagnostics</a>
            <a href="#features">GST Billing</a>
          </div>

          <div className="footer-col">
            <h4>Solutions</h4>
            <a href="#pricing">Solo Clinic</a>
            <a href="#pricing">Nursing Homes</a>
            <a href="#pricing">Multi-Specialty</a>
            <a href="#pricing">Pathology Labs</a>
          </div>

          <div className="footer-col">
            <h4>Account</h4>
            <Link to="/login">Sign In</Link>
            <Link to="/register">Register Facility</Link>
            <Link to="/forgot-password">Reset Password</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
