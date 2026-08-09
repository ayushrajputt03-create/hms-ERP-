import { describe, test, expect } from 'vitest'
import {
  generateSlots, toMinutes, to12Hour, bucket, partRangeLabel, isOnLeave,
  CONSULTATION_TYPES,
} from './scheduling'

const IN_CLINIC = CONSULTATION_TYPES.IN_CLINIC
const VIDEO = CONSULTATION_TYPES.VIDEO

// 2026-08-10 is a Monday (day 1).
const MONDAY = '2026-08-10'
const TUESDAY = '2026-08-11'
// Well before any slot on the test date, so nothing is "past" unless a test
// deliberately moves it.
const EARLY = new Date(`${MONDAY}T00:01:00`).getTime()

const rule = (over = {}) => ({
  id: 'r1',
  consultationType: IN_CLINIC,
  locationName: 'ganesh hospital',
  slotMinutes: 30,
  startTime: '09:00',
  endTime: '11:00',
  daysOfWeek: [1],
  isActive: true,
  ...over,
})

const times = (res) => res.slots.map((s) => s.time)

describe('toMinutes', () => {
  test('parses a valid 24-hour time', () => {
    expect(toMinutes('09:30')).toBe(570)
  })

  test('returns null rather than NaN for junk', () => {
    // NaN would compare false against everything and silently empty the grid.
    expect(toMinutes('')).toBeNull()
    expect(toMinutes('25:00')).toBeNull()
    expect(toMinutes('09:70')).toBeNull()
    expect(toMinutes(undefined)).toBeNull()
  })
})

describe('to12Hour', () => {
  test('renders midnight and noon without a zero hour', () => {
    expect(to12Hour('00:00')).toBe('12:00 AM')
    expect(to12Hour('12:00')).toBe('12:00 PM')
    expect(to12Hour('13:05')).toBe('01:05 PM')
  })
})

describe('generateSlots', () => {
  test('slices a rule into fixed-duration slots', () => {
    const res = generateSlots({
      rules: [rule()], date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(times(res)).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })

  test('excludes the end time itself', () => {
    // An 11:00 slot on a block ending at 11:00 would run past the doctor's day.
    const res = generateSlots({
      rules: [rule()], date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(times(res)).not.toContain('11:00')
  })

  test('returns an empty list when no rule covers that weekday', () => {
    const res = generateSlots({
      rules: [rule({ daysOfWeek: [1] })],
      date: TUESDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.slots).toEqual([])
    expect(res.onLeave).toBe(false)
  })

  test('returns an empty list rather than throwing when the doctor has no rules', () => {
    const res = generateSlots({
      rules: [], date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.slots).toEqual([])
    expect(res.parts).toHaveLength(4)
  })

  test('ignores inactive rules', () => {
    const res = generateSlots({
      rules: [rule({ isActive: false })],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.slots).toEqual([])
  })

  test('keeps in-clinic and video availability separate', () => {
    const rules = [
      rule({ id: 'clinic', startTime: '09:00', endTime: '10:00' }),
      rule({ id: 'video', consultationType: VIDEO, startTime: '15:00', endTime: '16:00' }),
    ]
    expect(times(generateSlots({
      rules, date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    }))).toEqual(['09:00', '09:30'])
    expect(times(generateSlots({
      rules, date: MONDAY, consultationType: VIDEO, nowMs: EARLY,
    }))).toEqual(['15:00', '15:30'])
  })

  test('merges a split morning and evening shift chronologically', () => {
    const rules = [
      rule({ id: 'evening', startTime: '17:00', endTime: '18:00' }),
      rule({ id: 'morning', startTime: '09:00', endTime: '10:00' }),
    ]
    const res = generateSlots({
      rules, date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(times(res)).toEqual(['09:00', '09:30', '17:00', '17:30'])
  })

  test('drops duplicate slots produced by two identical blocks', () => {
    const rules = [rule({ id: 'a' }), rule({ id: 'b' })]
    const res = generateSlots({
      rules, date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(times(res)).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })

  test('drops overlapping slots from blocks that are offset', () => {
    // One doctor cannot see two patients at once, so 09:15 is a double
    // booking against the 09:00-09:30 slot, not extra capacity.
    const rules = [
      rule({ id: 'a', startTime: '09:00', endTime: '10:00' }),
      rule({ id: 'b', startTime: '09:15', endTime: '10:15' }),
    ]
    const res = generateSlots({
      rules, date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    // B contributes 09:15 and 09:45; both start inside a slot already taken
    // from A, so both are dropped and A's grid survives intact.
    expect(times(res)).toEqual(['09:00', '09:30'])
  })

  test('keeps a short final slot and flags it as a remainder', () => {
    const res = generateSlots({
      rules: [rule({ startTime: '21:00', endTime: '23:59', slotMinutes: 60 })],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    const last = res.slots[res.slots.length - 1]
    expect(last.time).toBe('23:00')
    expect(last.endTime).toBe('23:59')
    expect(last.remainder).toBe(true)
    expect(last.rangeLabel).toBe('11:00 PM - 11:59 PM')
    expect(res.slots.filter((s) => s.remainder)).toHaveLength(1)
  })

  test('suppresses every slot when the date falls inside a leave range', () => {
    const res = generateSlots({
      rules: [rule()],
      leave: [{ startDate: '2026-08-09', endDate: '2026-08-12' }],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.onLeave).toBe(true)
    expect(res.slots).toEqual([])
  })

  test('leave on a single day uses that day as its own end', () => {
    const res = generateSlots({
      rules: [rule()],
      leave: [{ startDate: MONDAY }],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.onLeave).toBe(true)
  })

  test('leave outside the date leaves the schedule alone', () => {
    const res = generateSlots({
      rules: [rule()],
      leave: [{ startDate: '2026-08-01', endDate: '2026-08-05' }],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.onLeave).toBe(false)
    expect(res.slots).toHaveLength(4)
  })

  test('marks a slot booked when an appointment already holds its start time', () => {
    const res = generateSlots({
      rules: [rule()], booked: ['09:30'],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    const slot = res.slots.find((s) => s.time === '09:30')
    expect(slot.booked).toBe(true)
    expect(slot.disabled).toBe(true)
    expect(res.slots.find((s) => s.time === '09:00').disabled).toBe(false)
  })

  test('marks a slot booked when a walk-in falls part-way through it', () => {
    // Counter registrations carry the moment they were saved, not a slot
    // boundary — real data has visits at 11:40 and 13:22. Matching only on
    // exact start times would leave this slot open while the doctor is busy.
    const res = generateSlots({
      rules: [rule({ startTime: '11:00', endTime: '12:00', slotMinutes: 30 })],
      booked: ['11:40'],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.slots.find((s) => s.time === '11:30').booked).toBe(true)
    expect(res.slots.find((s) => s.time === '11:00').booked).toBe(false)
  })

  test('a booking exactly on a slot boundary belongs to the later slot', () => {
    const res = generateSlots({
      rules: [rule({ startTime: '11:00', endTime: '12:00', slotMinutes: 30 })],
      booked: ['11:30'],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.slots.find((s) => s.time === '11:00').booked).toBe(false)
    expect(res.slots.find((s) => s.time === '11:30').booked).toBe(true)
  })

  test('ignores booked times outside any generated slot', () => {
    const res = generateSlots({
      rules: [rule()], booked: ['18:00'],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.slots.every((s) => !s.booked)).toBe(true)
  })

  test('marks slots that have already started as past', () => {
    const res = generateSlots({
      rules: [rule()],
      date: MONDAY, consultationType: IN_CLINIC,
      nowMs: new Date(`${MONDAY}T09:45:00`).getTime(),
    })
    expect(res.slots.find((s) => s.time === '09:30').past).toBe(true)
    expect(res.slots.find((s) => s.time === '10:00').past).toBe(false)
  })

  test('ignores a block whose end is not after its start', () => {
    const res = generateSlots({
      rules: [rule({ startTime: '11:00', endTime: '09:00' })],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    expect(res.slots).toEqual([])
  })

  test('ignores a block with a nonsensical slot length', () => {
    expect(generateSlots({
      rules: [rule({ slotMinutes: 0 })],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    }).slots).toEqual([])
  })
})

describe('bucket', () => {
  const slotsFor = (start, end, size = 60) => generateSlots({
    rules: [rule({ startTime: start, endTime: end, slotMinutes: size })],
    date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
  }).slots

  test('splits slots across the day-part boundaries', () => {
    const parts = bucket(slotsFor('11:00', '18:00'))
    const byKey = Object.fromEntries(parts.map((p) => [p.key, p.slots.map((s) => s.time)]))
    expect(byKey.morning).toEqual(['11:00'])
    expect(byKey.afternoon).toEqual(['12:00', '13:00', '14:00', '15:00', '16:00'])
    expect(byKey.evening).toEqual(['17:00'])
    expect(byKey.night).toEqual([])
  })

  test('puts pre-dawn slots in Night instead of losing them', () => {
    // A casualty or night telemedicine shift lives here. The four nominal
    // bands start at 05:00, so without this these slots belong to no tab.
    const parts = bucket(slotsFor('01:00', '04:00'))
    const night = parts.find((p) => p.key === 'night')
    expect(night.slots.map((s) => s.time)).toEqual(['01:00', '02:00', '03:00'])
  })

  test('counts only bookable slots as available', () => {
    const res = generateSlots({
      rules: [rule()], booked: ['09:00', '09:30'],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    const morning = res.parts.find((p) => p.key === 'morning')
    expect(morning.slots).toHaveLength(4)
    expect(morning.available).toBe(2)
  })
})

describe('partRangeLabel', () => {
  test('reports the range the slots actually cover, not the tab window', () => {
    const res = generateSlots({
      rules: [rule({ startTime: '09:00', endTime: '11:00' })],
      date: MONDAY, consultationType: IN_CLINIC, nowMs: EARLY,
    })
    const morning = res.parts.find((p) => p.key === 'morning')
    expect(partRangeLabel(morning)).toBe('09:00 AM to 11:00 AM')
  })

  test('is empty when the tab has no slots', () => {
    expect(partRangeLabel({ slots: [] })).toBe('')
  })
})

describe('isOnLeave', () => {
  test('treats both ends of the range as inclusive', () => {
    const leave = [{ startDate: '2026-08-10', endDate: '2026-08-12' }]
    expect(isOnLeave(leave, '2026-08-10')).toBe(true)
    expect(isOnLeave(leave, '2026-08-12')).toBe(true)
    expect(isOnLeave(leave, '2026-08-13')).toBe(false)
  })
})
