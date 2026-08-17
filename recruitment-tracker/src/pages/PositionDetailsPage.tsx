import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PositionStatusBadge } from '../components/PositionStatusBadge'
import { closePosition, getPosition } from '../services/positions'
import type { Position } from '../types/positions'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function DetailSection({ title, value }: { title: string; value: string | null }) {
  return <section className="detail-section"><h2>{title}</h2><p>{value || 'Not provided.'}</p></section>
}

export function PositionDetailsPage({ positionId, canManage }: { positionId: string; canManage: boolean }) {
  const [position, setPosition] = useState<Position | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    let mounted = true
    void getPosition(positionId)
      .then((data) => { if (mounted) { setPosition(data); if (!data) setError('This position could not be found.') } })
      .catch(() => { if (mounted) setError('We could not load this position.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [positionId])

  async function confirmClose() {
    setClosing(true)
    setError(null)
    try {
      const updated = await closePosition(positionId)
      setPosition(updated)
      setConfirming(false)
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'The position could not be closed.')
    } finally {
      setClosing(false)
    }
  }

  if (loading) return <div className="page-shell"><div className="module-state"><span className="small-loader" />Loading position…</div></div>
  if (!position) return <div className="page-shell"><AppLink to="/positions" className="back-link">← Back to positions</AppLink><div className="module-state module-error">{error}</div></div>

  return <div className="page-shell position-detail-page">
    <AppLink to="/positions" className="back-link">← Back to positions</AppLink>
    <header className="position-detail-header">
      <div><span className="eyebrow dark">{position.department}</span><h1>{position.title}</h1><div className="position-meta"><PositionStatusBadge status={position.status} /><span>Opened {formatDate(position.opening_date)}</span></div></div>
      {canManage && position.status === 'Open' && <div className="position-detail-actions"><AppLink to={`/workflows/${position.id}`} className="primary-button button-link">{position.workflow_configured ? 'View workflow' : 'Create workflow'}</AppLink><button type="button" className="secondary-button close-position-button" onClick={() => setConfirming(true)}>Close position</button></div>}
    </header>
    {error && <div className="auth-error">{error}</div>}
    <div className="position-detail-grid">
      <div className="detail-main"><DetailSection title="Position description" value={position.description} /><DetailSection title="Requirements" value={position.requirements} /><DetailSection title="Qualifications" value={position.qualifications} /></div>
      <aside className="detail-aside"><span>Position details</span><dl><div><dt>Department</dt><dd>{position.department}</dd></div><div><dt>Hiring manager</dt><dd>{position.hiring_manager || 'Not assigned'}</dd></div><div><dt>Opening date</dt><dd>{formatDate(position.opening_date)}</dd></div><div><dt>Status</dt><dd>{position.status}</dd></div><div><dt>Workflow</dt><dd>{position.workflow_configured ? 'Configured' : 'Required before publication'}</dd></div></dl><p>Position information cannot be edited after creation.</p></aside>
    </div>
    {confirming && <ConfirmDialog title={`Close ${position.title}?`} message="The position will stop accepting new applications and cannot be reopened. Existing candidate records will remain available." confirmLabel="Close position" busy={closing} onCancel={() => setConfirming(false)} onConfirm={() => void confirmClose()} />}
  </div>
}
