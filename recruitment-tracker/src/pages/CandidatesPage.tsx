import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { listCandidates } from '../services/candidates'
import type { Candidate } from '../types/candidates'
import { roleDefinitions, type StaffRole } from '../types/auth'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function pageCopy(role: StaffRole) {
  if (role === 'interviewer') return ['Assigned candidates', 'Candidates currently at an interview stage.']
  if (role === 'hiring_manager') return ['Candidate review', 'Candidates who have reached the management review stages.']
  if (role === 'management_user') return ['Recruitment overview', 'Candidates who have reached executive or final review.']
  return ['Candidates', 'Review submitted CVs and move active candidates through their position workflow.']
}

export function CandidatesPage({ role, basePath }: { role: StaffRole; basePath: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')

  useEffect(() => {
    let mounted = true
    void listCandidates().then((rows) => { if (mounted) setCandidates(rows) })
      .catch(() => { if (mounted) setError('We could not load the candidates available to your role.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return candidates.filter((candidate) => {
      const matchesSearch = !term || [candidate.candidate_name, candidate.candidate_email, candidate.position?.title, candidate.current_stage?.name]
        .some((value) => value?.toLowerCase().includes(term))
      return matchesSearch && (status === 'All' || candidate.application_status === status)
    })
  }, [candidates, search, status])

  const [title, description] = pageCopy(role)
  if (loading) return <div className="page-shell"><div className="module-state"><span className="small-loader" />Loading candidates…</div></div>
  if (error) return <div className="page-shell"><div className="module-state module-error">{error}</div></div>

  return <div className="page-shell candidate-page">
    <header className="page-header candidates-header"><div><span className="eyebrow dark">Function 3 · {roleDefinitions[role].shortLabel}</span><h1>{title}</h1><p>{description}</p></div><span className="status-pill"><span />{candidates.length} visible</span></header>

    <section className="candidate-summary">
      <div><span>Active</span><strong>{candidates.filter((candidate) => candidate.application_status === 'Active').length}</strong></div>
      <div><span>CVs processed</span><strong>{candidates.filter((candidate) => candidate.processing_status === 'Processed').length}</strong></div>
      <div><span>Shortlisted</span><strong>{candidates.filter((candidate) => candidate.screening?.decision === 'Shortlisted').length}</strong></div>
    </section>

    <section className="candidate-list-card">
      <div className="position-toolbar">
        <label className="search-field"><span className="sr-only">Search candidates</span><input type="search" value={search} placeholder="Search candidate, role or stage" onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="filter-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Active</option><option>Rejected</option><option>Hired</option><option>Withdrawn</option></select></label>
      </div>
      {filtered.length ? <div className="position-table-wrap"><table className="position-table candidate-table">
        <thead><tr><th>Candidate</th><th>Position</th><th>Current stage</th><th>Status</th><th>Screening</th><th>Rank</th><th>Submitted</th><th><span className="sr-only">Open</span></th></tr></thead>
        <tbody>{filtered.map((candidate) => <tr key={candidate.id}>
          <td><AppLink to={`${basePath}/${candidate.id}`} className="position-title-link">{candidate.candidate_name || 'Legacy submission'}</AppLink><span>{candidate.candidate_email || 'Contact details unavailable'}</span></td>
          <td>{candidate.position?.title || 'Unknown position'}<span>{candidate.position?.department}</span></td>
          <td><span className="candidate-stage">{candidate.current_stage?.name || 'Stage unavailable'}</span></td>
          <td><span className={`application-badge application-${candidate.application_status.toLowerCase()}`}>{candidate.application_status}</span></td>
          <td>{candidate.screening?.decision ? <span className={`screening-decision screening-decision-${candidate.screening.decision.toLowerCase()}`}>{candidate.screening.decision} · {Number(candidate.screening.total_score).toFixed(1)}</span> : <span className={`processing-badge processing-${candidate.processing_status.toLowerCase()}`}>{candidate.processing_status === 'Processed' ? 'Awaiting close' : candidate.processing_status}</span>}</td>
          <td>{candidate.screening?.rank ? <strong className="candidate-rank">#{candidate.screening.rank}</strong> : '—'}</td>
          <td>{formatDate(candidate.submitted_at)}</td>
          <td><AppLink to={`${basePath}/${candidate.id}`} className="row-action">Review →</AppLink></td>
        </tr>)}</tbody>
      </table></div> : <div className="module-state"><strong>No candidates found</strong><span>There are no candidate records matching this view.</span></div>}
    </section>
  </div>
}
