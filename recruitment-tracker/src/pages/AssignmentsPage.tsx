import { useEffect, useState } from 'react'
import { endInterview, listInterviews, startInterview } from '../services/interviews'
import type { Interview } from '../types/interviews'
import { AppLink } from '../components/AppLink'

function display(value: string) { return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value)) }

export function AssignmentsPage() {
  const [rows, setRows] = useState<Interview[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  async function load() { setRows(await listInterviews()) }
  useEffect(() => { void load().catch(() => setMessage('Assignments could not be loaded.')) }, [])
  async function act(id: string, action: 'start' | 'end') {
    setBusy(id); setMessage('')
    try { if (action === 'start') await startInterview(id); else await endInterview(id); await load(); setMessage(action === 'start' ? 'Interview started. The actual start time has been recorded.' : 'Interview ended. The actual end time has been recorded.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The action could not be completed.') }
    finally { setBusy('') }
  }
  return <div className="page-shell"><header className="page-header"><div><span className="eyebrow dark">Interviewer workspace</span><h1>Assigned interviews</h1><p>Your schedule, candidate context and live interview controls.</p></div></header>{message && <div className="candidate-message">{message}</div>}<div className="interview-card-list">{rows.length ? rows.map((row) => { const overtime = row.status === 'in_progress' && Date.now() > new Date(row.scheduled_end).getTime(); const next = rows.find((other) => other.id !== row.id && other.status === 'scheduled' && new Date(other.scheduled_start) > new Date(row.scheduled_start)); const approachingNext = row.status === 'in_progress' && next && Date.now() >= new Date(next.scheduled_start).getTime() - 15 * 60_000; return <article key={row.id} className="interview-card"><div className="interview-card-heading"><div><span>{row.position?.title}</span><h2>{row.candidate?.candidate_name || 'Candidate'}</h2><p>{row.stage?.name}</p></div><b className={`interview-status status-${row.status}`}>{row.status.replaceAll('_', ' ')}</b></div><dl><div><dt>Planned</dt><dd>{display(row.scheduled_start)} – {new Intl.DateTimeFormat('en-LK', { timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(row.scheduled_end))}</dd></div><div><dt>Format</dt><dd>{row.format === 'online' ? <a href={row.meeting_url || '#'} target="_blank" rel="noreferrer">Open meeting link</a> : row.location}</dd></div>{row.actual_start && <div><dt>Actual start</dt><dd>{display(row.actual_start)}</dd></div>}{row.actual_end && <div><dt>Actual end</dt><dd>{display(row.actual_end)}</dd></div>}</dl>{overtime && <p className="overtime-warning">The planned end time has passed. The interview stays active until you click End interview.</p>}{approachingNext && <p className="overtime-warning">Your next interview begins at {display(next.scheduled_start)}. You may continue, but the schedule is now at risk.</p>}<div className="interview-actions"><AppLink to={`/assignments/${row.submission_id}`} className="secondary-button">View candidate and CV</AppLink>{row.status === 'scheduled' && <button className="primary-button" disabled={busy === row.id} onClick={() => void act(row.id, 'start')}>Start interview</button>}{row.status === 'in_progress' && <button className="primary-button" disabled={busy === row.id} onClick={() => void act(row.id, 'end')}>End interview</button>}</div></article> }) : <div className="module-state">No interviews are assigned to you.</div>}</div></div>
}
