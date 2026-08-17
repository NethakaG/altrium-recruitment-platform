import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { PositionStatusBadge } from '../components/PositionStatusBadge'
import { filterPositions } from '../lib/position-validation'
import { listPositions } from '../services/positions'
import type { Position, PositionStatus } from '../types/positions'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

export function PositionsPage({ canManage }: { canManage: boolean }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'All' | PositionStatus>('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void listPositions()
      .then((data) => { if (mounted) setPositions(data) })
      .catch(() => { if (mounted) setError('We could not load the positions. Please try again.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const visiblePositions = useMemo(() => filterPositions(positions, search, status), [positions, search, status])
  const openCount = positions.filter((position) => position.status === 'Open').length

  return <div className="page-shell positions-page">
    <header className="page-header positions-header">
      <div><span className="eyebrow dark">Function 1</span><h1>Job positions</h1><p>View current vacancies and closed recruitment records.</p></div>
      {canManage && <AppLink to="/positions/new" className="primary-button button-link">Create position</AppLink>}
    </header>

    <section className="position-summary" aria-label="Position totals">
      <div><span>All positions</span><strong>{positions.length}</strong></div>
      <div><span>Open</span><strong>{openCount}</strong></div>
      <div><span>Closed</span><strong>{positions.length - openCount}</strong></div>
    </section>

    <section className="position-list-card">
      <div className="position-toolbar">
        <label className="search-field"><span className="sr-only">Search positions</span><input type="search" value={search} placeholder="Search title, department or manager" onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="filter-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as 'All' | PositionStatus)}><option>All</option><option>Open</option><option>Closed</option></select></label>
      </div>

      {loading && <div className="module-state"><span className="small-loader" />Loading positions…</div>}
      {error && <div className="module-state module-error">{error}</div>}
      {!loading && !error && visiblePositions.length === 0 && <div className="module-state"><strong>No matching positions</strong><span>Change the search or status filter and try again.</span></div>}
      {!loading && !error && visiblePositions.length > 0 && <div className="position-table-wrap"><table className="position-table">
        <thead><tr><th>Position</th><th>Department</th><th>Opening date</th><th>Status</th><th>Workflow</th><th><span className="sr-only">Open details</span></th></tr></thead>
        <tbody>{visiblePositions.map((position) => <tr key={position.id}>
          <td><AppLink to={`/positions/${position.id}`} className="position-title-link">{position.title}</AppLink><span>{position.hiring_manager || 'Manager not assigned'}</span></td>
          <td>{position.department}</td>
          <td>{formatDate(position.opening_date)}</td>
          <td><PositionStatusBadge status={position.status} /></td>
          <td><span className={`workflow-state-badge ${position.workflow_configured ? 'configured' : ''}`}>{position.workflow_configured ? 'Configured' : 'Needed'}</span></td>
          <td><AppLink to={`/positions/${position.id}`} className="row-action" aria-label={`View ${position.title}`}>View <span aria-hidden="true">→</span></AppLink></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>
}
