import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { InterviewFeedbackPanel } from '../components/InterviewFeedbackPanel'
import { endInterview, listInterviews, startInterview } from '../services/interviews'
import type { Interview, InterviewStatus } from '../types/interviews'

function display(value: string) {
  return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

function dateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

function assignmentPositionKey(row: Interview) {
  return row.candidate?.position_id || row.position?.title || 'Unknown'
}

type AssignmentGroupKey = 'today' | 'upcoming' | 'awaiting' | 'completed' | 'earlier'

const assignmentGroupMeta: Record<AssignmentGroupKey, { title: string; description: string }> = {
  today: { title: 'Today and in progress', description: 'Interviews requiring your attention now.' },
  upcoming: { title: 'Upcoming', description: 'Your future scheduled interviews.' },
  awaiting: { title: 'Awaiting feedback', description: 'Ended interviews that still require a submitted evaluation.' },
  completed: { title: 'Completed and cancelled', description: 'Finished assignment records retained for reference.' },
  earlier: { title: 'Earlier assignments', description: 'Past scheduled records that have not yet been completed.' },
}

function assignmentGroup(row: Interview, now = new Date()): AssignmentGroupKey {
  if (row.status === 'awaiting_feedback') return 'awaiting'
  if (row.status === 'completed' || row.status === 'cancelled') return 'completed'
  if (row.status === 'in_progress' || dateKey(new Date(row.scheduled_start)) === dateKey(now)) return 'today'
  if (new Date(row.scheduled_start).getTime() > now.getTime()) return 'upcoming'
  return 'earlier'
}

export function AssignmentsPage() {
  const [rows, setRows] = useState<Interview[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [search, setSearch] = useState('')
  const [positionId, setPositionId] = useState('All')
  const [status, setStatus] = useState<'All' | InterviewStatus>('All')

  async function load() { setRows(await listInterviews()) }
  useEffect(() => { void load().catch(() => setMessage('Assignments could not be loaded.')) }, [])

  const positions = useMemo(() => Array.from(new Map(rows.map((row) => [assignmentPositionKey(row), {
    id: assignmentPositionKey(row),
    title: row.position?.title || 'Unknown position',
  }])).values()).sort((left, right) => left.title.localeCompare(right.title)), [rows])

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      const matchesSearch = !term || [row.candidate?.candidate_name, row.position?.title, row.stage?.name]
        .some((value) => value?.toLowerCase().includes(term))
      return matchesSearch
        && (positionId === 'All' || assignmentPositionKey(row) === positionId)
        && (status === 'All' || row.status === status)
    }).sort((left, right) => new Date(left.scheduled_start).getTime() - new Date(right.scheduled_start).getTime())

    const order: AssignmentGroupKey[] = ['today', 'upcoming', 'awaiting', 'earlier', 'completed']
    return order.map((key) => ({ key, ...assignmentGroupMeta[key], rows: filtered.filter((row) => assignmentGroup(row) === key) }))
      .filter((group) => group.rows.length)
  }, [positionId, rows, search, status])

  const filteredCount = groups.reduce((total, group) => total + group.rows.length, 0)

  async function act(id: string, action: 'start' | 'end') {
    setBusy(id)
    setMessage('')
    try {
      if (action === 'start') await startInterview(id)
      else await endInterview(id)
      await load()
      setMessage(action === 'start' ? 'Interview started. The actual start time has been recorded.' : 'Interview ended. The actual end time has been recorded.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The action could not be completed.')
    } finally { setBusy('') }
  }

  return <div className="page-shell assignment-page">
    <header className="page-header"><div><span className="eyebrow dark">Interviewer workspace</span><h1>Assigned interviews</h1><p>Your schedule, candidate context, live controls and interview evaluations.</p></div></header>
    {message && <div className="candidate-message">{message}</div>}

    <section className="candidate-filter-card assignment-filter-card" aria-label="Assignment filters">
      <div className="position-toolbar candidate-toolbar">
        <label className="search-field"><span className="sr-only">Search assigned interviews</span><input type="search" value={search} placeholder="Search candidate, position or stage" onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="filter-field"><span>Position</span><select aria-label="Assigned interview position" value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="All">All positions</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select></label>
        <label className="filter-field"><span>Status</span><select aria-label="Assigned interview status" value={status} onChange={(event) => setStatus(event.target.value as 'All' | InterviewStatus)}><option value="All">All statuses</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="awaiting_feedback">Awaiting feedback</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      </div>
      <div className="candidate-filter-result"><strong>{filteredCount}</strong> assigned interview{filteredCount === 1 ? '' : 's'} in <strong>{groups.length}</strong> schedule section{groups.length === 1 ? '' : 's'}</div>
    </section>

    {groups.length ? <div className="assignment-groups">{groups.map((group) => <section className="assignment-group" key={group.key} aria-labelledby={`assignment-${group.key}`}>
      <header><div><span>Schedule</span><h2 id={`assignment-${group.key}`}>{group.title}</h2><p>{group.description}</p></div><strong>{group.rows.length}</strong></header>
      <div className="interview-card-list">{group.rows.map((row) => {
        const overtime = row.status === 'in_progress' && Date.now() > new Date(row.scheduled_end).getTime()
        const next = rows.find((other) => other.id !== row.id && other.status === 'scheduled' && new Date(other.scheduled_start) > new Date(row.scheduled_start))
        const approachingNext = row.status === 'in_progress' && next && Date.now() >= new Date(next.scheduled_start).getTime() - 15 * 60_000
        return <article key={row.id} className="interview-card"><div className="interview-card-heading"><div><span>{row.position?.title}</span><h2>{row.candidate?.candidate_name || 'Candidate'}</h2><p>{row.stage?.name}</p></div><b className={`interview-status status-${row.status}`}>{row.status.replaceAll('_', ' ')}</b></div><dl><div><dt>Planned</dt><dd>{display(row.scheduled_start)} – {new Intl.DateTimeFormat('en-LK', { timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(row.scheduled_end))}</dd></div><div><dt>Format</dt><dd>{row.format === 'online' ? <a href={row.meeting_url || '#'} target="_blank" rel="noreferrer">Open meeting link</a> : row.location}</dd></div>{row.actual_start && <div><dt>Actual start</dt><dd>{display(row.actual_start)}</dd></div>}{row.actual_end && <div><dt>Actual end</dt><dd>{display(row.actual_end)}</dd></div>}</dl>{overtime && <p className="overtime-warning">The planned end time has passed. The interview stays active until you click End interview.</p>}{approachingNext && <p className="overtime-warning">Your next interview begins at {display(next.scheduled_start)}. You may continue, but the schedule is now at risk.</p>}<div className="interview-actions"><AppLink to={`/assignments/${row.submission_id}`} className="secondary-button">View candidate and CV</AppLink>{row.status === 'scheduled' && <button className="primary-button" disabled={busy === row.id} onClick={() => void act(row.id, 'start')}>Start interview</button>}{row.status === 'in_progress' && <button className="primary-button" disabled={busy === row.id} onClick={() => void act(row.id, 'end')}>End interview</button>}</div><InterviewFeedbackPanel interview={row} mode="interviewer" /></article>
      })}</div>
    </section>)}</div> : <div className="module-state"><strong>No assigned interviews found</strong><span>There are no assignments matching these filters.</span></div>}
  </div>
}
