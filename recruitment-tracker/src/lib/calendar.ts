import type { CalendarEvent, CalendarHoliday, Interview, WorkingHours } from '../types/interviews'

export const COLOMBO_OFFSET = '+05:30'

export function dateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first); start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day })
}

export function localIso(date: string, minutes: number) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, '0')
  const minute = (minutes % 60).toString().padStart(2, '0')
  return `${date}T${hour}:${minute}:00${COLOMBO_OFFSET}`
}

export function timeMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart
}

export function availableSlots(args: {
  date: string
  durationMinutes: number
  interviewerId: string
  hours: WorkingHours[]
  holidays: CalendarHoliday[]
  events: CalendarEvent[]
  interviews: Interview[]
  now?: Date
}) {
  const { date, durationMinutes, interviewerId, hours, holidays, events, interviews } = args
  const day = new Date(`${date}T12:00:00${COLOMBO_OFFSET}`)
  const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay()
  const work = hours.find((item) => item.interviewer_id === interviewerId && item.weekday === weekday && item.is_working)
  if (!work || holidays.some((holiday) => holiday.holiday_date === date)) return []
  const startMinutes = timeMinutes(work.starts_at)
  const endMinutes = timeMinutes(work.ends_at)
  const now = args.now ?? new Date()
  const busy = [
    ...events.filter((event) => event.interviewer_id === interviewerId && dateKey(event.starts_at) === date).map((event) => [new Date(event.starts_at).getTime(), new Date(event.ends_at).getTime()] as const),
    ...interviews.filter((interview) => interview.interviewer_id === interviewerId && interview.status !== 'cancelled' && dateKey(interview.scheduled_start) === date).map((interview) => [new Date(interview.scheduled_start).getTime(), new Date(interview.scheduled_end).getTime() + 15 * 60_000] as const),
  ]
  const result: string[] = []
  for (let minute = startMinutes; minute + durationMinutes + 15 <= endMinutes; minute += 30) {
    const start = new Date(localIso(date, minute)); const end = new Date(localIso(date, minute + durationMinutes + 15))
    if (start <= now) continue
    if (!busy.some(([busyStart, busyEnd]) => overlaps(start.getTime(), end.getTime(), busyStart, busyEnd))) result.push(start.toISOString())
  }
  return result
}

export function moveToDate(startsAt: string, endsAt: string, newDate: string) {
  const start = new Date(startsAt); const end = new Date(endsAt)
  const startParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start).split(':').map(Number)
  const duration = end.getTime() - start.getTime()
  const movedStart = new Date(localIso(newDate, startParts[0] * 60 + startParts[1]))
  return { start: movedStart.toISOString(), end: new Date(movedStart.getTime() + duration).toISOString() }
}
