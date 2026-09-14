import { useEffect, useMemo, useState } from 'react'
import { InterviewFeedbackPanel } from '../components/InterviewFeedbackPanel'
import { validateInterviewDraft } from '../lib/interview-validation'
import { cancelInterview, dispatchInterviewEmails, listInterviewerProfiles, listInterviews, rescheduleInterview } from '../services/interviews'
import type { Interview, InterviewFormat, InterviewerProfile, InterviewStatus } from '../types/interviews'

function display(value: string) {
  return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

function toInput(value: string) {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function statusLabel(status: InterviewStatus) {
  return status.replaceAll('_', ' ')
}

function positionKey(row: Interview) {
  return row.candidate?.position_id || `${row.position?.department}-${row.position?.title}`
}

export function InterviewsPage() {
  const [rows, setRows] = useState<Interview[]>([])
  const [profiles, setProfiles] = useState<InterviewerProfile[]>([])
  const [editing, setEditing] = useState<Interview | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [format, setFormat] = useState<InterviewFormat>('online')
  const [destination, setDestination] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [search, setSearch] = useState('')
  const [positionId, setPositionId] = useState('All')
  const [stageId, setStageId] = useState('All')
  const [status, setStatus] = useState<'All' | InterviewStatus>('All')

  async function load() {
    const [interviews, people] = await Promise.all([listInterviews(), listInterviewerProfiles()])
    setRows(interviews)
    setProfiles(people)
  }

  useEffect(() => {
    void load().catch(() => setMessage('Interview records could not be loaded.'))
  }, [])

  const positions = useMemo(() => Array.from(new Map(rows.map((row) => [
    positionKey(row),
    {
      id: positionKey(row),
      title: row.position?.title || 'Unknown position',
      department: row.position?.department || '',
    },
  ])).values()).sort((left, right) => left.title.localeCompare(right.title)), [rows])

  const stages = useMemo(() => {
    const positionRows = positionId === 'All' ? rows : rows.filter((row) => positionKey(row) === positionId)
    return Array.from(new Map(positionRows.map((row) => [row.stage_id, { id: row.stage_id, name: row.stage?.name || 'Unknown stage' }])).values())
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [positionId, rows])

  useEffect(() => {
    if (stageId !== 'All' && !stages.some((stage) => stage.id === stageId)) setStageId('All')
  }, [stageId, stages])

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      const matchesSearch = !term || [row.candidate?.candidate_name, row.candidate?.candidate_email, row.interviewer?.display_name, row.position?.title, row.stage?.name]
        .some((value) => value?.toLowerCase().includes(term))
      return matchesSearch
        && (positionId === 'All' || positionKey(row) === positionId)
        && (stageId === 'All' || row.stage_id === stageId)
        && (status === 'All' || row.status === status)
    })

    return positions
      .filter((position) => positionId === 'All' || position.id === positionId)
      .map((position) => ({
        ...position,
        interviews: filtered
          .filter((row) => positionKey(row) === position.id)
          .sort((left, right) => new Date(left.scheduled_start).getTime() - new Date(right.scheduled_start).getTime()),
      }))
      .filter((group) => group.interviews.length)
  }, [positionId, positions, rows, search, stageId, status])

  const filteredCount = groups.reduce((total, group) => total + group.interviews.length, 0)

  function edit(row: Interview) {
    setEditing(row)
    setStart(toInput(row.scheduled_start))
    setEnd(toInput(row.scheduled_end))
    setFormat(row.format)
    setDestination(row.meeting_url || row.location || '')
    setMessage('')
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    const errors = validateInterviewDraft({
      start, end, format,
      meetingUrl: format === 'online' ? destination : '',
      location: format === 'physical' ? destination : '',
    })
    if (errors.length) { setMessage(errors.join(' ')); return }
    setBusy(editing.id)
    try {
      await rescheduleInterview(editing.id, {
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), format,
        meetingUrl: format === 'online' ? destination : '',
        location: format === 'physical' ? destination : '',
      })
      try { await dispatchInterviewEmails(editing.id) } catch { /* visible queue remains retryable */ }
      await load()
      setEditing(null)
      setMessage('Interview rescheduled. Replacement notifications were queued.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The interview could not be rescheduled.')
    } finally { setBusy('') }
  }

  async function cancel(row: Interview) {
    const reason = window.prompt('Enter the cancellation reason:')
    if (!reason) return
    setBusy(row.id)
    try {
      await cancelInterview(row.id, reason)
      try { await dispatchInterviewEmails(row.id) } catch { /* retry remains available */ }
      await load()
      setMessage('Interview cancelled and notifications queued.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The interview could not be cancelled.')
    } finally { setBusy('') }
  }

  async function retry(row: Interview) {
    setBusy(row.id)
    try {
      const result = await dispatchInterviewEmails(row.id)
      await load()
      setMessage(`${result.sent} email(s) sent; ${result.failed} failed.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Email delivery could not be started.')
    } finally { setBusy('') }
  }

  return <div className="page-shell interview-management-page">
    <header className="page-header"><div><span className="eyebrow dark">Sprint 2 · Feature 1</span><h1>Interviews</h1><p>Schedule from candidate profiles, then manage timing, delivery and cancellations here.</p></div></header>
    {message && <div className="candidate-message">{message}</div>}

    <section className="interviewer-directory"><h2>Interviewer directory</h2><div>{profiles.map((person) => <article key={person.id}><strong>{person.display_name}</strong><span>{person.role_title} · {person.years_experience} years</span><small>{person.is_active ? person.contact_email : 'Awaiting real email and staff login'}</small><div className="skill-list">{person.specializations.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div></article>)}</div></section>

    <section className="candidate-filter-card interview-filter-card" aria-label="Interview filters">
      <div className="position-toolbar candidate-toolbar">
        <label className="search-field"><span className="sr-only">Search interviews</span><input type="search" value={search} placeholder="Search candidate, interviewer or stage" onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="filter-field"><span>Position</span><select aria-label="Interview position" value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="All">All positions</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select></label>
        <label className="filter-field"><span>Stage</span><select aria-label="Interview stage" value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="All">All interview stages</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
        <label className="filter-field"><span>Status</span><select aria-label="Interview status" value={status} onChange={(event) => setStatus(event.target.value as 'All' | InterviewStatus)}><option value="All">All statuses</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="awaiting_feedback">Awaiting feedback</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      </div>
      <div className="candidate-filter-result"><strong>{filteredCount}</strong> interview{filteredCount === 1 ? '' : 's'} across <strong>{groups.length}</strong> position{groups.length === 1 ? '' : 's'}</div>
    </section>

    {groups.length ? <div className="interview-position-groups">{groups.map((group) => <section className="interview-position-card" key={group.id} aria-labelledby={`interview-position-${group.id}`}>
      <header className="candidate-group-header"><div><span>{group.department || 'Department unavailable'}</span><h2 id={`interview-position-${group.id}`}>{group.title}</h2></div><div className="candidate-group-totals"><span><strong>{group.interviews.length}</strong> interviews</span><span><strong>{group.interviews.filter((row) => row.status === 'scheduled').length}</strong> scheduled</span><span><strong>{group.interviews.filter((row) => row.status === 'awaiting_feedback').length}</strong> awaiting feedback</span></div></header>
      <div className="interview-card-list">{group.interviews.map((row) => {
        const failed = row.notifications.filter((notice) => notice.status === 'failed').length
        const pending = row.notifications.filter((notice) => notice.status === 'pending').length
        return <article className="interview-card" key={row.id}><div className="interview-card-heading"><div><span>{row.stage?.name}</span><h2>{row.candidate?.candidate_name || 'Candidate'}</h2><p>{row.interviewer?.display_name}</p></div><b className={`interview-status status-${row.status}`}>{statusLabel(row.status)}</b></div><dl><div><dt>Planned</dt><dd>{display(row.scheduled_start)} – {new Intl.DateTimeFormat('en-LK', { timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(row.scheduled_end))}</dd></div><div><dt>Venue</dt><dd>{row.meeting_url || row.location}</dd></div><div><dt>Email delivery</dt><dd>{failed ? `${failed} failed` : pending ? `${pending} queued` : 'Up to date'}</dd></div></dl><div className="interview-actions">{row.status === 'scheduled' && <><button className="secondary-button" onClick={() => edit(row)}>Reschedule</button><button className="danger-button" disabled={busy === row.id} onClick={() => void cancel(row)}>Cancel</button></>}{(failed > 0 || pending > 0) && <button className="secondary-button" disabled={busy === row.id} onClick={() => void retry(row)}>Send queued emails</button>}</div><InterviewFeedbackPanel interview={row} mode="reviewer" onDecision={load} /></article>
      })}</div>
    </section>)}</div> : <div className="module-state"><strong>No interviews found</strong><span>There are no interview records matching these filters.</span></div>}

    {editing && <div className="dialog-backdrop"><form className="dialog-card interview-dialog" onSubmit={(event) => void save(event)}><span className="eyebrow dark">Reschedule</span><h2>{editing.candidate?.candidate_name}</h2><label>Start<input type="datetime-local" step="1800" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>End<input type="datetime-local" step="1800" value={end} onChange={(event) => setEnd(event.target.value)} /></label><label>Format<select value={format} onChange={(event) => setFormat(event.target.value as InterviewFormat)}><option value="online">Online</option><option value="physical">Physical</option></select></label><label>{format === 'online' ? 'Meeting link' : 'Location'}<input value={destination} onChange={(event) => setDestination(event.target.value)} /></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Back</button><button type="submit" className="primary-button" disabled={busy === editing.id}>Save new time</button></div></form></div>}
  </div>
}
