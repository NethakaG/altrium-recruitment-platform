import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { listCandidates } from '../services/candidates'
import type { Candidate } from '../types/candidates'
import { roleDefinitions, type StaffRole } from '../types/auth'

type CandidateSort = 'rank-high' | 'rank-low' | 'newest' | 'oldest'

interface CandidateGroup {
  positionId: string
  title: string
  department: string
  candidates: Candidate[]
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function pageCopy(role: StaffRole) {
  if (role === 'interviewer') return ['Assigned candidates', 'Candidates currently at an interview stage.']
  if (role === 'hiring_manager') return ['Candidate review', 'Candidates who have reached the management review stages.']
  if (role === 'management_user') return ['Recruitment overview', 'Candidates who have reached executive or final review.']
  return ['Candidates', 'Review submitted CVs and move active candidates through their position workflow.']
}

function sortCandidates(candidates: Candidate[], sort: CandidateSort) {
  return [...candidates].sort((left, right) => {
    if (sort === 'newest' || sort === 'oldest') {
      const difference = new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime()
      return sort === 'newest' ? difference : -difference
    }

    const leftRank = left.screening?.rank ?? null
    const rightRank = right.screening?.rank ?? null
    if (leftRank === null && rightRank === null) return new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime()
    if (leftRank === null) return 1
    if (rightRank === null) return -1
    return sort === 'rank-high' ? leftRank - rightRank : rightRank - leftRank
  })
}

export function CandidatesPage({ role, basePath }: { role: StaffRole; basePath: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [positionId, setPositionId] = useState('All')
  const [stageId, setStageId] = useState('All')
  const [status, setStatus] = useState('All')
  const [sort, setSort] = useState<CandidateSort>('rank-high')

  useEffect(() => {
    let mounted = true
    void listCandidates().then((rows) => { if (mounted) setCandidates(rows) })
      .catch(() => { if (mounted) setError('We could not load the candidates available to your role.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const positions = useMemo(() => Array.from(new Map(candidates.map((candidate) => [candidate.position_id, {
    id: candidate.position_id,
    title: candidate.position?.title || 'Unknown position',
    department: candidate.position?.department || '',
  }])).values()).sort((left, right) => left.title.localeCompare(right.title)), [candidates])

  const stages = useMemo(() => {
    const positionCandidates = positionId === 'All' ? candidates : candidates.filter((candidate) => candidate.position_id === positionId)
    return Array.from(new Map(positionCandidates.filter((candidate) => candidate.current_stage).map((candidate) => [candidate.current_stage!.id, candidate.current_stage!])).values())
      .sort((left, right) => left.stage_order - right.stage_order || left.name.localeCompare(right.name))
  }, [candidates, positionId])

  useEffect(() => {
    if (stageId !== 'All' && !stages.some((stage) => stage.id === stageId)) setStageId('All')
  }, [stageId, stages])

  const groups = useMemo<CandidateGroup[]>(() => {
    const term = search.trim().toLowerCase()
    const filtered = candidates.filter((candidate) => {
      const matchesSearch = !term || [candidate.candidate_name, candidate.candidate_email, candidate.position?.title, candidate.current_stage?.name]
        .some((value) => value?.toLowerCase().includes(term))
      return matchesSearch
        && (positionId === 'All' || candidate.position_id === positionId)
        && (stageId === 'All' || candidate.current_stage_id === stageId)
        && (status === 'All' || candidate.application_status === status)
    })

    return positions
      .filter((position) => positionId === 'All' || position.id === positionId)
      .map((position) => ({
        positionId: position.id,
        title: position.title,
        department: position.department,
        candidates: sortCandidates(filtered.filter((candidate) => candidate.position_id === position.id), sort),
      }))
      .filter((group) => group.candidates.length > 0)
  }, [candidates, positionId, positions, search, sort, stageId, status])

  const filteredCount = groups.reduce((total, group) => total + group.candidates.length, 0)
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

    <section className="candidate-filter-card" aria-label="Candidate filters">
      <div className="position-toolbar candidate-toolbar">
        <label className="search-field"><span className="sr-only">Search candidates</span><input type="search" value={search} placeholder="Search candidate, role or stage" onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="filter-field"><span>Position</span><select aria-label="Job position" value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="All">All positions</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select></label>
        <label className="filter-field"><span>Stage</span><select aria-label="Workflow stage" value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="All">All stages</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
        <label className="filter-field"><span>Status</span><select aria-label="Application status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Active</option><option>Rejected</option><option>Hired</option><option>Withdrawn</option></select></label>
        <label className="filter-field"><span>Order</span><select aria-label="Candidate order" value={sort} onChange={(event) => setSort(event.target.value as CandidateSort)}><option value="rank-high">Rank: highest first</option><option value="rank-low">Rank: lowest first</option><option value="newest">Newest submission</option><option value="oldest">Oldest submission</option></select></label>
      </div>
      <div className="candidate-filter-result"><strong>{filteredCount}</strong> candidate{filteredCount === 1 ? '' : 's'} across <strong>{groups.length}</strong> position{groups.length === 1 ? '' : 's'}</div>
    </section>

    {groups.length ? <div className="candidate-position-groups">{groups.map((group) => {
      const active = group.candidates.filter((candidate) => candidate.application_status === 'Active').length
      const shortlisted = group.candidates.filter((candidate) => candidate.screening?.decision === 'Shortlisted').length
      const rejected = group.candidates.filter((candidate) => candidate.application_status === 'Rejected').length
      return <section className="candidate-list-card" key={group.positionId} aria-labelledby={`position-${group.positionId}`}>
        <header className="candidate-group-header"><div><span>{group.department || 'Department unavailable'}</span><h2 id={`position-${group.positionId}`}>{group.title}</h2></div><div className="candidate-group-totals"><span><strong>{group.candidates.length}</strong> candidates</span><span><strong>{active}</strong> active</span><span><strong>{shortlisted}</strong> shortlisted</span><span><strong>{rejected}</strong> rejected</span></div></header>
        <div className="position-table-wrap"><table className="position-table candidate-table">
          <thead><tr><th>Candidate</th><th>Current stage</th><th>Status</th><th>Screening</th><th>Rank</th><th>Submitted</th><th><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{group.candidates.map((candidate) => <tr key={candidate.id}>
            <td><AppLink to={`${basePath}/${candidate.id}`} className="position-title-link">{candidate.candidate_name || 'Legacy submission'}</AppLink><span>{candidate.candidate_email || 'Contact details unavailable'}</span></td>
            <td><span className="candidate-stage">{candidate.current_stage?.name || 'Stage unavailable'}</span></td>
            <td><span className={`application-badge application-${candidate.application_status.toLowerCase()}`}>{candidate.application_status}</span></td>
            <td>{candidate.screening?.decision ? <span className={`screening-decision screening-decision-${candidate.screening.decision.toLowerCase()}`}>{candidate.screening.decision} · {Number(candidate.screening.total_score).toFixed(1)}</span> : <span className={`processing-badge processing-${candidate.processing_status.toLowerCase()}`}>{candidate.processing_status === 'Processed' ? 'Awaiting close' : candidate.processing_status}</span>}</td>
            <td>{candidate.screening?.rank ? <strong className="candidate-rank">#{candidate.screening.rank}</strong> : '—'}</td>
            <td>{formatDate(candidate.submitted_at)}</td>
            <td><AppLink to={`${basePath}/${candidate.id}`} className="row-action">Review →</AppLink></td>
          </tr>)}</tbody>
        </table></div>
      </section>
    })}</div> : <section className="candidate-list-card"><div className="module-state"><strong>No candidates found</strong><span>There are no candidate records matching these filters.</span></div></section>}
  </div>
}
