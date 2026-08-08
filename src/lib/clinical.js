// Clinical decision support: allergy cross-checks and vitals range flags.
// Advisory only — never blocks the doctor, always surfaces the reason.

// Recorded allergy term -> drug name fragments that share the allergen or its class.
// Cross-reactivity groups follow common Indian OPD prescribing patterns.
const ALLERGY_CROSS_REACTIONS = [
  {
    match: ['penicillin', 'pencillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'augmentin'],
    drugs: ['penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'augmentin', 'clavulan', 'cloxacillin', 'piperacillin', 'mox', 'clavam'],
    note: 'beta-lactam / penicillin class',
  },
  {
    match: ['cephalosporin', 'cefixime', 'ceftriaxone', 'cephalexin'],
    drugs: ['cef', 'ceph', 'taxim', 'monocef'],
    note: 'cephalosporin class',
  },
  {
    match: ['sulfa', 'sulpha', 'sulfonamide', 'cotrimoxazole', 'bactrim', 'septran'],
    drugs: ['sulfa', 'sulpha', 'cotrimoxazole', 'sulfamethoxazole', 'trimethoprim', 'septran', 'bactrim'],
    note: 'sulfonamide class',
  },
  {
    match: ['nsaid', 'aspirin', 'ibuprofen', 'diclofenac', 'brufen', 'combiflam'],
    drugs: ['aspirin', 'ibuprofen', 'diclofenac', 'aceclofenac', 'naproxen', 'ketorolac', 'indomethacin', 'nimesulide', 'brufen', 'combiflam', 'voveran'],
    note: 'NSAID class',
  },
  {
    match: ['quinolone', 'fluoroquinolone', 'ciprofloxacin', 'levofloxacin', 'ofloxacin'],
    drugs: ['floxacin', 'cipro', 'levo', 'oflox', 'norflox', 'moxiflox'],
    note: 'fluoroquinolone class',
  },
  {
    match: ['macrolide', 'erythromycin', 'azithromycin', 'clarithromycin'],
    drugs: ['erythromycin', 'azithromycin', 'clarithromycin', 'azithral', 'azee'],
    note: 'macrolide class',
  },
  {
    match: ['paracetamol', 'acetaminophen', 'crocin', 'dolo'],
    drugs: ['paracetamol', 'acetaminophen', 'crocin', 'dolo', 'calpol', 'pcm'],
    note: 'paracetamol',
  },
  {
    match: ['tetracycline', 'doxycycline'],
    drugs: ['tetracycline', 'doxycycline', 'minocycline'],
    note: 'tetracycline class',
  },
  {
    match: ['metronidazole', 'flagyl'],
    drugs: ['metronidazole', 'tinidazole', 'ornidazole', 'flagyl', 'metrogyl'],
    note: 'nitroimidazole class',
  },
]

const normalize = (s) => String(s || '').toLowerCase().trim()

// Returns [{ allergy, note }] for every recorded allergy the drug name may conflict with.
export function checkDrugAllergy(drugName, allergies = []) {
  const drug = normalize(drugName)
  if (!drug) return []

  const conflicts = []
  for (const allergy of allergies) {
    const allergen = normalize(allergy)
    if (!allergen) continue

    // Direct substring hit either way covers exact-name allergies not in the class table.
    if (drug.includes(allergen) || allergen.includes(drug)) {
      conflicts.push({ allergy, note: 'direct match' })
      continue
    }

    const group = ALLERGY_CROSS_REACTIONS.find((g) => g.match.some((m) => allergen.includes(m)))
    if (group && group.drugs.some((d) => drug.includes(d))) {
      conflicts.push({ allergy, note: group.note })
    }
  }
  return conflicts
}

// Any prescription row that conflicts, for the pre-save summary.
export function checkPrescriptionAllergies(prescription = [], allergies = []) {
  return prescription
    .map((item) => ({ item, conflicts: checkDrugAllergy(item.medicine, allergies) }))
    .filter((r) => r.conflicts.length > 0)
}

// Adult reference ranges. `critical` marks values needing immediate attention.
const VITAL_RULES = {
  temp: { min: 97, max: 99.5, criticalMin: 95, criticalMax: 103, unit: '°F', label: 'Temperature' },
  pulse: { min: 60, max: 100, criticalMin: 40, criticalMax: 130, unit: 'bpm', label: 'Pulse' },
  spo2: { min: 95, max: 100, criticalMin: 90, criticalMax: 100, unit: '%', label: 'SpO2' },
}

const BP_RULES = {
  systolic: { min: 90, max: 130, criticalMin: 80, criticalMax: 180 },
  diastolic: { min: 60, max: 85, criticalMin: 50, criticalMax: 120 },
}

function flagValue(value, rule, label, unit) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return null
  if (n <= rule.criticalMin) return { level: 'critical', text: `${label} critically low (${n}${unit})` }
  if (n >= rule.criticalMax) return { level: 'critical', text: `${label} critically high (${n}${unit})` }
  if (n < rule.min) return { level: 'warning', text: `${label} low (${n}${unit})` }
  if (n > rule.max) return { level: 'warning', text: `${label} high (${n}${unit})` }
  return null
}

// Returns { bp, temp, pulse, spo2 } where each present key is { level, text }.
export function flagVitals(vitals = {}) {
  const flags = {}

  for (const [key, rule] of Object.entries(VITAL_RULES)) {
    const flag = flagValue(vitals[key], rule, rule.label, rule.unit)
    if (flag) flags[key] = flag
  }

  const [sysRaw, diaRaw] = String(vitals.bp || '').split('/')
  const sys = flagValue(sysRaw, BP_RULES.systolic, 'Systolic BP', ' mmHg')
  const dia = flagValue(diaRaw, BP_RULES.diastolic, 'Diastolic BP', ' mmHg')
  const bp = [sys, dia].filter(Boolean)
  if (bp.length) {
    flags.bp = {
      level: bp.some((f) => f.level === 'critical') ? 'critical' : 'warning',
      text: bp.map((f) => f.text).join(', '),
    }
  }

  return flags
}

export function criticalVitals(vitals) {
  return Object.values(flagVitals(vitals)).filter((f) => f.level === 'critical')
}
