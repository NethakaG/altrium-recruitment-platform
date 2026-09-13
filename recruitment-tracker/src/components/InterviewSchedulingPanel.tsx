import { useEffect, useMemo, useState } from 'react'
import { CalendarMonth } from './CalendarMonth'
import { availableSlots, dateKey } from '../lib/calendar'
import { validateInterviewDraft } from '../lib/interview-validation'
import { listCalendarEvents, listCalendarHolidays, listWorkingHours } from '../services/calendar'
import { createInterview, dispatchInterviewEmails, listCandidateInterviews, listInterviewerProfiles, listInterviews } from '../services/interviews'
import type { Candidate } from '../types/candidates'
import type { CalendarEvent, CalendarHoliday, Interview, InterviewFormat, InterviewerProfile, WorkingHours } from '../types/interviews'

const interviewStages = ['hr_interview', 'technical_interview', 'hiring_manager_interview', 'engineering_manager_interview', 'executive_interview']
function display(value: string) { return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value)) }
function monthTitle(value: Date) { return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(value) }

export function InterviewSchedulingPanel({ candidate }: { candidate: Candidate }) {
  const [profiles, setProfiles] = useState<InterviewerProfile[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [hours, setHours] = useState<WorkingHours[]>([])
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([])
  const [allInterviews, setAllInterviews] = useState<Interview[]>([])
  const [candidateInterviews, setCandidateInterviews] = useState<Interview[]>([])
  const [interviewerId, setInterviewerId] = useState('')
  const [duration, setDuration] = useState(60)
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [selectedStart, setSelectedStart] = useState('')
  const [format, setFormat] = useState<InterviewFormat>('online')
  const [meetingUrl, setMeetingUrl] = useState(''); const [location, setLocation] = useState(''); const [instructions, setInstructions] = useState('')
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const stageType = candidate.current_stage?.stage_type ?? ''
  const eligible = useMemo(() => profiles.filter((profile) => profile.is_active && profile.eligible_stage_types.includes(stageType)), [profiles, stageType])

  async function load() {
    const [people, calendarEvents, workHours, holidayRows, interviewRows, ownRows] = await Promise.all([listInterviewerProfiles(), listCalendarEvents(), listWorkingHours(), listCalendarHolidays(2026), listInterviews(), listCandidateInterviews(candidate.id)])
    setProfiles(people); setEvents(calendarEvents); setHours(workHours); setHolidays(holidayRows); setAllInterviews(interviewRows); setCandidateInterviews(ownRows)
    const first = people.find((profile) => profile.is_active && profile.eligible_stage_types.includes(stageType)); if (first) setInterviewerId((current) => current || first.id)
  }
  useEffect(() => { void load().catch(() => setMessage('Interview calendar information could not be loaded.')) }, [candidate.id, stageType])

  if (!interviewStages.includes(stageType) || candidate.application_status !== 'Active') return null
  const current = candidateInterviews.find((interview) => interview.stage_id === candidate.current_stage_id && interview.status !== 'cancelled')
  const selectedInterviewer = profiles.find((profile) => profile.id === interviewerId)
  const slots = interviewerId ? availableSlots({ date: selectedDate, durationMinutes: duration, interviewerId, hours, holidays, events, interviews: allInterviews }) : []
  const selectedEnd = selectedStart ? new Date(new Date(selectedStart).getTime() + duration * 60_000).toISOString() : ''

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage('')
    const errors = validateInterviewDraft({ start: selectedStart, end: selectedEnd, format, meetingUrl, location })
    if (!interviewerId) errors.unshift('Choose an interviewer.'); if (!selectedStart) errors.unshift('Choose an available time from the calendar.')
    if (errors.length) { setMessage([...new Set(errors)].join(' ')); return }
    setBusy(true)
    try {
      const interviewId = await createInterview({ submissionId: candidate.id, interviewerId, start: selectedStart, end: selectedEnd, format, meetingUrl, location, instructions })
      let notice = 'Interview scheduled. Email notifications are queued.'
      try { const result = await dispatchInterviewEmails(interviewId); notice = result.failed ? `Interview scheduled. ${result.sent} email(s) sent and ${result.failed} require retry.` : `Interview scheduled and ${result.sent} email(s) sent.` } catch { notice = 'Interview scheduled, but email delivery could not be started. Retry it from Interviews.' }
      await load(); setMessage(notice)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The interview could not be scheduled.') }
    finally { setBusy(false) }
  }

  return <section className="detail-section interview-scheduling-panel"><span className="eyebrow dark">Interview scheduling</span><h2>{candidate.current_stage?.name}</h2>
    {current ? <div className="scheduled-summary"><strong>{display(current.scheduled_start)}</strong><span>{current.interviewer?.display_name} · {current.format === 'online' ? current.meeting_url : current.location}</span><small>Status: {current.status.replaceAll('_', ' ')}</small></div> : <form onSubmit={(event) => void submit(event)}>
      <div className="scheduling-controls"><label>1. Interviewer<select value={interviewerId} onChange={(event) => { setInterviewerId(event.target.value); setSelectedStart('') }}><option value="">Select interviewer</option>{eligible.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name} · {profile.years_experience} years</option>)}</select></label><label>2. Duration<select value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setSelectedStart('') }}><option value={30}>30 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label></div>
      {selectedInterviewer && <div className="scheduler-profile"><div><strong>{selectedInterviewer.display_name}</strong><span>{selectedInterviewer.role_title} · {selectedInterviewer.years_experience} years</span></div><div className="skill-list">{selectedInterviewer.specializations.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div></div>}
      {interviewerId && <><div className="calendar-toolbar compact"><button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>←</button><h3>{monthTitle(month)}</h3><button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>→</button><span className="calendar-timezone">3. Select an available date</span></div><CalendarMonth month={month} selectedDate={selectedDate} interviewerId={interviewerId} events={events} interviews={allInterviews} holidays={holidays} hours={hours} onSelectDate={(date) => { setSelectedDate(date); setSelectedStart('') }} /></>}
      {interviewerId && <div className="slot-picker"><div><span>4. Available times</span><strong>{new Intl.DateTimeFormat('en-LK', { dateStyle: 'full' }).format(new Date(`${selectedDate}T12:00:00+05:30`))}</strong></div><div className="slot-grid">{slots.length ? slots.map((slot) => <button type="button" className={selectedStart === slot ? 'selected' : ''} key={slot} onClick={() => setSelectedStart(slot)}>{new Intl.DateTimeFormat('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date(slot))}</button>) : <p>No {duration}-minute times are available on this date.</p>}</div>{selectedStart && <p className="selected-slot">Selected: {display(selectedStart)}–{new Intl.DateTimeFormat('en-LK', { timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(selectedEnd))}, followed by a 15-minute buffer.</p>}</div>}
      <div className="interview-form-grid"><label>5. Format<select value={format} onChange={(event) => setFormat(event.target.value as InterviewFormat)}><option value="online">Online</option><option value="physical">Physical</option></select></label>{format === 'online' ? <label>Meeting link<input type="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="https://meet.google.com/..." /></label> : <label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Meeting room or office address" /></label>}<label className="wide">Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional preparation notes" /></label></div>
      <button className="primary-button" disabled={busy || !selectedStart} type="submit">{busy ? 'Scheduling…' : 'Confirm interview'}</button>
    </form>}{message && <p className="candidate-message">{message}</p>}
  </section>
}
