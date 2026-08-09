// Doctor availability rules and appointment slot generation.
//
// Slots are NEVER stored. A doctor working 9-5 on 30-minute slots would be
// 16 rows a day, 4000 a year, per doctor, almost all of them never booked —
// and every change to the schedule would need them rewritten. What is stored
// is the rule; the slots are derived from it on demand by generateSlots()
// below, which is pure and therefore testable without a database.

import { supabase } from './supabase'

export const CONSULTATION_TYPES = {
  IN_CLINIC: 'in_clinic',
  VIDEO: 'video',
}

export const CONSULTATION_TYPE_LABELS = {
  in_clinic: 'In-Clinic Consultation',
  video: 'Video / Telemedicine Consultation',
}

// 0 = Sunday, matching JavaScript's Date.getDay(). The alternative (1-7,
// ISO) would need converting at every call site that touches a Date, and
// AppointmentCalendar already works in getDay() terms.
export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const SLOT_DURATIONS = [5, 10, 15, 20, 30, 45, 60]

// Tab boundaries in minutes from midnight.
//
// The night band runs to the end of the day AND absorbs everything before
// 05:00. The four bands as specified leave 00:00-04:59 belonging to no tab,
// which in a hospital is not a theoretical gap — a casualty OPD or a night
// telemedicine shift lives exactly there, and those slots would have been
// generated and then silently dropped at display time.
export const DAY_PARTS = [
  { key: 'morning', label: 'Morning', from: 5 * 60, to: 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', from: 12 * 60, to: 17 * 60 },
  { key: 'evening', label: 'Evening', from: 17 * 60, to: 21 * 60 },
  { key: 'night', label: 'Night', from: 21 * 60, to: 24 * 60, alsoBefore: 5 * 60 },
]

const MINUTES_IN_DAY = 24 * 60

// "09:30" -> 570. Returns null for anything unparseable rather than NaN,
// which would otherwise propagate silently through every comparison.
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function toHHMM(minutes) {
  const m = Math.max(0, Math.min(MINUTES_IN_DAY - 1, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// "09:30" -> "09:30 AM". The grid is read by patients and counter staff, not
// by people who think in 24-hour time.
export function to12Hour(hhmm) {
  const mins = toMinutes(hhmm)
  if (mins == null) return ''
  const h24 = Math.floor(mins / 60)
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${String(h12).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} ${suffix}`
}

export function dayOfWeek(isoDate) {
  // Parsed as local midnight, not UTC. `new Date('2026-08-10')` is UTC
  // midnight, which in IST is already the 10th at 05:30 — harmless here, but
  // west of Greenwich it would resolve to the previous day and shift the whole
  // weekly schedule by one.
  const d = new Date(`${isoDate}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.getDay()
}

export function isOnLeave(leave = [], isoDate) {
  return leave.some((l) => isoDate >= l.startDate && isoDate <= (l.endDate || l.startDate))
}

// Rules that apply to a given date and consultation type.
export function rulesForDate(rules = [], isoDate, consultationType) {
  const dow = dayOfWeek(isoDate)
  if (dow == null) return []
  return rules.filter((r) =>
    r.isActive !== false
    && r.consultationType === consultationType
    && Array.isArray(r.daysOfWeek)
    && r.daysOfWeek.includes(dow))
}

// Slice one rule into chunks. The final chunk is kept even when it is shorter
// than slotMinutes, flagged `remainder` — a 21:00-23:59 block on 30-minute
// slots ends with a 29-minute tail, and dropping it would quietly remove the
// last appointment of the day from the schedule.
function sliceRule(rule) {
  const start = toMinutes(rule.startTime)
  const end = toMinutes(rule.endTime)
  const size = Number(rule.slotMinutes)
  if (start == null || end == null || !Number.isFinite(size) || size <= 0) return []
  // An end at or before the start is a data error, not an overnight block:
  // there is no UI that can produce one, and treating it as a wrap-around
  // would invent slots on the following day.
  if (end <= start) return []

  const out = []
  for (let t = start; t < end; t += size) {
    const slotEnd = Math.min(t + size, end)
    out.push({
      startMinutes: t,
      endMinutes: slotEnd,
      time: toHHMM(t),
      endTime: toHHMM(slotEnd),
      remainder: slotEnd - t < size,
      locationName: rule.locationName || '',
      ruleId: rule.id,
    })
  }
  return out
}

/**
 * Pure. Given a doctor's rules, leave and existing bookings, produce the
 * slot list for one date. No I/O — every input is passed in, so this can be
 * tested exhaustively and reused for any doctor/date/type combination.
 *
 * @param rules   availability rule objects (all types; filtered here)
 * @param leave   [{ startDate, endDate }] inclusive ISO date ranges
 * @param booked  ['09:00', ...] start times already taken on this date
 * @param date    'YYYY-MM-DD'
 * @param nowMs   current time, injected so "past" is testable
 */
export function generateSlots({
  rules = [], leave = [], booked = [], date, consultationType, nowMs = Date.now(),
} = {}) {
  const empty = { onLeave: false, slots: [], parts: emptyParts() }
  if (!date || !consultationType) return empty

  // Leave wins over every recurring rule. Checked before any slicing so a
  // doctor on leave costs nothing to render and cannot show a bookable slot
  // through some later branch.
  if (isOnLeave(leave, date)) {
    return { ...empty, onLeave: true }
  }

  const applicable = rulesForDate(rules, date, consultationType)
  if (applicable.length === 0) return empty

  const all = applicable.flatMap(sliceRule).sort((a, b) => a.startMinutes - b.startMinutes)

  // Merge across rules. Two blocks at one location, or a split morning/evening
  // shift, must not produce a slot that overlaps another — for a single doctor
  // an overlap is a double booking, not extra capacity. Anything starting
  // before the previously accepted slot ends is dropped, which also removes
  // exact duplicates as a special case.
  const merged = []
  for (const slot of all) {
    const prev = merged[merged.length - 1]
    if (prev && slot.startMinutes < prev.endMinutes) continue
    merged.push(slot)
  }

  // A slot is taken if ANY appointment falls inside it, not only one starting
  // exactly on its boundary. Counter registrations are stamped with the moment
  // the clerk saved them — the real data has visits at 11:40, 13:22, 16:16 —
  // so exact-start matching would leave the 11:30 slot bookable while the
  // doctor is already seeing someone, and the double booking would only
  // surface in the waiting room.
  const bookedMinutes = booked.map(toMinutes).filter((m) => m != null)
  const startOfDay = new Date(`${date}T00:00:00`).getTime()

  const slots = merged.map((s) => {
    const isBooked = bookedMinutes.some((m) => m >= s.startMinutes && m < s.endMinutes)
    const isPast = startOfDay + s.startMinutes * 60000 <= nowMs
    return {
      ...s,
      booked: isBooked,
      past: isPast,
      disabled: isBooked || isPast,
      label: to12Hour(s.time),
      // Shown as "10:00 PM - 11:59 PM" so the patient is not told a half-length
      // appointment is a full one.
      rangeLabel: s.remainder ? `${to12Hour(s.time)} - ${to12Hour(s.endTime)}` : to12Hour(s.time),
    }
  })

  return { onLeave: false, slots, parts: bucket(slots) }
}

function emptyParts() {
  return DAY_PARTS.map((p) => ({ ...p, slots: [], available: 0 }))
}

// Group into the display tabs and count only what can still be booked — a tab
// reading "42 Slots Available" while every one of them is greyed out would be
// worse than showing nothing.
export function bucket(slots = []) {
  return DAY_PARTS.map((part) => {
    const inPart = slots.filter((s) =>
      (s.startMinutes >= part.from && s.startMinutes < part.to)
      || (part.alsoBefore != null && s.startMinutes < part.alsoBefore))
    return {
      ...part,
      slots: inPart,
      available: inPart.filter((s) => !s.disabled).length,
    }
  })
}

// "05:00 AM to 12:00 PM" — the range actually covered by the tab's slots,
// not the tab's nominal window. A doctor who only works 09:00-11:00 should
// not have the Morning tab claim it starts at 05:00.
export function partRangeLabel(part) {
  if (!part.slots.length) return ''
  const first = part.slots[0]
  const last = part.slots[part.slots.length - 1]
  return `${to12Hour(first.time)} to ${to12Hour(last.endTime)}`
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

// One call for everything generateSlots needs. Booked times in particular must
// not be computed in the browser: that would mean subscribing to the whole
// opdVisits collection to find the handful of appointments for one doctor on
// one day, which is the pattern countDocuments() and hms_dashboard_stats()
// were introduced to stop.
export async function getSlotInputs({ doctorId, date, consultationType }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('hms_slot_inputs', {
    p_doctor_id: doctorId,
    p_date: date,
    p_consultation_type: consultationType,
  })
  if (error) throw error
  return data || { rules: [], leave: [], booked: [] }
}
