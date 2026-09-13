import { useEffect, useMemo, useState } from 'react'
import { CalendarMonth } from '../components/CalendarMonth'
import { dateKey, moveToDate } from '../lib/calendar'
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, listCalendarHolidays, listWorkingHours, updateCalendarEvent } from '../services/calendar'
import { getMyInterviewerProfile, listInterviews } from '../services/interviews'
import type { CalendarEvent, CalendarEventType, CalendarHoliday, Interview, InterviewerProfile, WorkingHours } from '../types/interviews'

function monthTitle(month: Date) { return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month) }
function time(value: string) { return new Intl.DateTimeFormat('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date(value)) }
function localInput(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
function colomboIso(value: string) { return new Date(`${value}:00+05:30`).toISOString() }

export function AvailabilityPage() {
  const [profile, setProfile] = useState<InterviewerProfile | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [hours, setHours] = useState<WorkingHours[]>([])
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([])
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null)
  const [title, setTitle] = useState(''); const [eventType, setEventType] = useState<CalendarEventType>('meeting')
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [notes, setNotes] = useState('')
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)

  async function load() {
    const person = await getMyInterviewerProfile(); setProfile(person)
    if (!person) return
    const [calendarEvents, interviewRows, workHours, holidayRows] = await Promise.all([listCalendarEvents(person.id), listInterviews(), listWorkingHours(person.id), listCalendarHolidays(2026)])
    setEvents(calendarEvents); setInterviews(interviewRows); setHours(workHours); setHolidays(holidayRows)
  }
  useEffect(() => { void load().catch(() => setMessage('Your calendar could not be loaded.')) }, [])

  const dayItems = useMemo(() => ({ events: events.filter((item) => dateKey(item.starts_at) === selectedDate), interviews: interviews.filter((item) => item.status !== 'cancelled' && dateKey(item.scheduled_start) === selectedDate), holiday: holidays.find((item) => item.holiday_date === selectedDate) }), [events, interviews, holidays, selectedDate])
  function openNew() { setEditing('new'); setTitle(''); setEventType('meeting'); setStart(`${selectedDate}T09:00`); setEnd(`${selectedDate}T10:00`); setNotes(''); setMessage('') }
  function openEdit(item: CalendarEvent) { setEditing(item); setTitle(item.title); setEventType(item.event_type); setStart(localInput(item.starts_at)); setEnd(localInput(item.ends_at)); setNotes(item.notes ?? ''); setMessage('') }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setMessage('')
    if (title.trim().length < 2 || !start || !end || new Date(colomboIso(end)) <= new Date(colomboIso(start))) { setMessage('Enter a title and a valid start and end time.'); return }
    if (new Date(start).getMinutes() % 30 || new Date(end).getMinutes() % 30) { setMessage('Calendar events use 30-minute increments.'); return }
    setBusy(true)
    try {
      const input = { title: title.trim(), eventType, start: colomboIso(start), end: colomboIso(end), notes }
      if (editing === 'new') await createCalendarEvent(input); else if (editing) await updateCalendarEvent(editing.id, input)
      await load(); setEditing(null); setMessage(editing === 'new' ? 'Calendar event added.' : 'Calendar event updated.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The calendar event could not be saved.') }
    finally { setBusy(false) }
  }
  async function remove(item: CalendarEvent) { if (!window.confirm(`Delete “${item.title}”?`)) return; try { await deleteCalendarEvent(item.id); await load(); setEditing(null); setMessage('Calendar event deleted.') } catch (error) { setMessage(error instanceof Error ? error.message : 'The calendar event could not be deleted.') } }
  async function move(item: CalendarEvent, destination: string) { const moved = moveToDate(item.starts_at, item.ends_at, destination); try { await updateCalendarEvent(item.id, { title: item.title, eventType: item.event_type, start: moved.start, end: moved.end, notes: item.notes ?? '' }); await load(); setSelectedDate(destination); setMessage('Calendar event moved.') } catch (error) { setMessage(error instanceof Error ? error.message : 'That event cannot be moved to this date.') } }
  function changeMonth(offset: number) { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)) }

  if (!profile) return <div className="page-shell"><div className="module-state">Your interviewer profile is not active yet.</div></div>
  return <div className="page-shell calendar-page">
    <header className="page-header"><div><span className="eyebrow dark">Interviewer workspace</span><h1>Calendar</h1><p>Manage meetings and blocked periods. Assigned interviews appear automatically.</p></div><button type="button" className="primary-button" onClick={openNew}>Add event</button></header>
    {message && <div className="candidate-message">{message}</div>}
    <div className="calendar-toolbar"><button type="button" onClick={() => changeMonth(-1)}>←</button><h2>{monthTitle(month)}</h2><button type="button" onClick={() => changeMonth(1)}>→</button><button type="button" className="calendar-today" onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(dateKey(today)) }}>Today</button><span className="calendar-timezone">Sri Lanka · 9:00 AM–5:00 PM</span></div>
    <CalendarMonth month={month} selectedDate={selectedDate} interviewerId={profile.id} events={events} interviews={interviews} holidays={holidays} hours={hours} privateTitles onSelectDate={setSelectedDate} onSelectEvent={openEdit} onMoveEvent={(item, day) => void move(item, day)} />
    <section className="calendar-agenda"><div className="calendar-agenda-heading"><div><span>Selected date</span><h2>{new Intl.DateTimeFormat('en-LK', { dateStyle: 'full' }).format(new Date(`${selectedDate}T12:00:00+05:30`))}</h2></div><button type="button" className="secondary-button" onClick={openNew}>Add event here</button></div>{dayItems.holiday && <article className="agenda-item holiday"><b>Public holiday</b><strong>{dayItems.holiday.name}</strong><span>Scheduling is blocked for the full day.</span></article>}{dayItems.interviews.map((item) => <article className="agenda-item interview" key={item.id}><b>Candidate interview</b><strong>{time(item.scheduled_start)}–{time(item.scheduled_end)} · {item.candidate?.candidate_name}</strong><span>{item.position?.title} · {item.stage?.name}</span></article>)}{dayItems.events.map((item) => <button type="button" className={`agenda-item ${item.event_type}`} key={item.id} onClick={() => openEdit(item)}><b>{item.event_type}</b><strong>{time(item.starts_at)}–{time(item.ends_at)} · {item.title}</strong><span>{item.notes || 'No notes'}</span></button>)}{!dayItems.holiday && !dayItems.events.length && !dayItems.interviews.length && <p className="calendar-empty-day">No events. Normal working hours are available.</p>}</section>
    <div className="calendar-legend"><span><i className="legend-available" />Available</span><span><i className="legend-meeting" />Meeting</span><span><i className="legend-unavailable" />Unavailable</span><span><i className="legend-interview" />Interview</span><span><i className="legend-holiday" />Holiday</span></div>
    {editing && <div className="dialog-backdrop"><form className="dialog-card calendar-event-dialog" onSubmit={(event) => void save(event)}><span className="eyebrow dark">{editing === 'new' ? 'New calendar event' : 'Edit calendar event'}</span><h2>{editing === 'new' ? 'Block some time' : editing.title}</h2><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Type<select value={eventType} onChange={(event) => setEventType(event.target.value as CalendarEventType)}><option value="meeting">Meeting</option><option value="unavailable">Unavailable period</option></select></label><div className="calendar-dialog-times"><label>Starts<input type="datetime-local" step="1800" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Ends<input type="datetime-local" step="1800" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{message && <p className="field-error">{message}</p>}<div className="dialog-actions">{editing !== 'new' && <button type="button" className="danger-button" onClick={() => void remove(editing)}>Delete</button>}<button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save event'}</button></div></form></div>}
  </div>
}
