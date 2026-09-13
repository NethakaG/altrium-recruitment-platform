import { describe, expect, it } from 'vitest'
import { availableSlots, moveToDate } from './calendar'

const hours = [{ id: 'h', interviewer_id: 'i', weekday: 1, starts_at: '09:00:00', ends_at: '17:00:00', is_working: true }]

describe('calendar availability', () => {
  it('removes meetings and the interview buffer from derived slots', () => {
    const slots = availableSlots({ date: '2026-09-14', durationMinutes: 60, interviewerId: 'i', hours, holidays: [], now: new Date('2026-09-12T00:00:00Z'), events: [{ id: 'e', interviewer_id: 'i', title: 'Meeting', event_type: 'meeting', starts_at: '2026-09-14T10:00:00+05:30', ends_at: '2026-09-14T11:00:00+05:30', notes: null, created_by: null }], interviews: [] })
    expect(slots.map((slot) => new Date(slot).toISOString())).not.toContain(new Date('2026-09-14T09:30:00+05:30').toISOString())
    expect(slots).toContain(new Date('2026-09-14T11:00:00+05:30').toISOString())
  })

  it('blocks holidays and preserves event time when moved', () => {
    expect(availableSlots({ date: '2026-12-25', durationMinutes: 60, interviewerId: 'i', hours: [{ ...hours[0], weekday: 5 }], holidays: [{ holiday_date: '2026-12-25', name: 'Christmas Day', country_code: 'LK' }], events: [], interviews: [] })).toEqual([])
    expect(moveToDate('2026-09-14T10:00:00+05:30', '2026-09-14T11:30:00+05:30', '2026-09-16')).toEqual({ start: new Date('2026-09-16T10:00:00+05:30').toISOString(), end: new Date('2026-09-16T11:30:00+05:30').toISOString() })
  })
})
