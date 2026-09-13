import { dateKey, monthCells } from '../lib/calendar'
import type { CalendarEvent, CalendarHoliday, Interview, WorkingHours } from '../types/interviews'

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarMonth({ month, selectedDate, interviewerId, events, interviews, holidays, hours, privateTitles = false, onSelectDate, onSelectEvent, onMoveEvent }: {
  month: Date
  selectedDate: string
  interviewerId: string
  events: CalendarEvent[]
  interviews: Interview[]
  holidays: CalendarHoliday[]
  hours: WorkingHours[]
  privateTitles?: boolean
  onSelectDate: (date: string) => void
  onSelectEvent?: (event: CalendarEvent) => void
  onMoveEvent?: (event: CalendarEvent, date: string) => void
}) {
  const cells = monthCells(month)
  return <div className="calendar-board">
    <div className="calendar-weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-month-grid">{cells.map((day) => {
      const key = dateKey(day); const weekday = day.getDay() === 0 ? 7 : day.getDay()
      const holiday = holidays.find((item) => item.holiday_date === key)
      const working = hours.some((item) => item.interviewer_id === interviewerId && item.weekday === weekday && item.is_working)
      const dayEvents = events.filter((event) => event.interviewer_id === interviewerId && dateKey(event.starts_at) === key)
      const dayInterviews = interviews.filter((interview) => interview.interviewer_id === interviewerId && interview.status !== 'cancelled' && dateKey(interview.scheduled_start) === key)
      const unavailable = !working || Boolean(holiday)
      return <div role="button" tabIndex={0} key={key} aria-label={`Select ${key}`} className={`calendar-day ${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${selectedDate === key ? 'selected' : ''} ${unavailable ? 'unavailable-day' : 'working-day'}`} onClick={() => onSelectDate(key)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDate(key) } }} onDragOver={(event) => { if (onMoveEvent && !unavailable) event.preventDefault() }} onDrop={(event) => { const id = event.dataTransfer.getData('text/calendar-event'); const item = dayEvents.find((entry) => entry.id === id) || events.find((entry) => entry.id === id); if (item && onMoveEvent) onMoveEvent(item, key) }}>
        <span className="calendar-day-number">{day.getDate()}</span>
        {holiday && <span className="calendar-chip holiday-chip" title={holiday.name}>Holiday · {holiday.name}</span>}
        {!working && !holiday && <span className="calendar-chip weekend-chip">Unavailable</span>}
        {dayInterviews.slice(0, 2).map((interview) => <span key={interview.id} className="calendar-chip interview-chip">{new Intl.DateTimeFormat('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date(interview.scheduled_start))} · Interview</span>)}
        {dayEvents.slice(0, 2).map((item) => <span role={onSelectEvent ? 'button' : undefined} tabIndex={onSelectEvent ? 0 : undefined} draggable={Boolean(onMoveEvent)} onDragStart={(event) => { event.dataTransfer.setData('text/calendar-event', item.id); event.stopPropagation() }} onClick={(event) => { if (onSelectEvent) { event.stopPropagation(); onSelectEvent(item) } }} onKeyDown={(event) => { if (event.key === 'Enter' && onSelectEvent) onSelectEvent(item) }} key={item.id} className={`calendar-chip ${item.event_type}-chip`}>{new Intl.DateTimeFormat('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date(item.starts_at))} · {privateTitles ? item.title : 'Busy'}</span>)}
        {dayEvents.length + dayInterviews.length > 4 && <span className="calendar-more">+{dayEvents.length + dayInterviews.length - 4} more</span>}
        {!unavailable && !dayEvents.length && !dayInterviews.length && <span className="calendar-open-label">Open 9–5</span>}
      </div>
    })}</div>
  </div>
}
