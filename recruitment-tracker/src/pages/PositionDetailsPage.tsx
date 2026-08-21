import { useEffect, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PositionStatusBadge } from '../components/PositionStatusBadge'
import { closePosition, getPosition, retryPositionScreening } from '../services/positions'
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
  const screeningStalled = position?.screening_status === 'Processing' && Boolean(position.screening_started_at) && Date.now() - new Date(position.screening_started_at as string).getTime() > 10 * 60 * 1000

  useEffect(() => {
    let mounted = true
    void getPosition(positionId)
      .then((data) => { if (mounted) { setPosition(data); if (!data) setError('This position could not be found.') } })
      .catch(() => { if (mounted) setError('We could not load this position.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [positionId])

  useEffect(() => {
    if (position?.screening_status !== 'Processing') return
    const timer = window.setInterval(() => {
      void getPosition(positionId).then((updated) => { if (updated) setPosition(updated) }).catch(() => undefined)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [position?.screening_status, positionId])

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

  async function retryScreening() {
    setClosing(true)
    setError(null)
    try { setPosition(await retryPositionScreening(positionId)) }
    catch (retryError) { setError(retryError instanceof Error ? retryError.message : 'Screening could not be restarted.') }
    finally { setClosing(false) }
  }

  if (loading) return <div className="page-shell"><div className="module-state"><span className="small-loader" />Loading position…</div></div>
  if (!position) return <div className="page-shell"><AppLink to="/positions" className="back-link">← Back to positions</AppLink><div className="module-state module-error">{error}</div></div>

  return <div className="page-shell position-detail-page">
    <AppLink to="/positions" className="back-link">← Back to positions</AppLink>
    <header className="position-detail-header">
      <div><span className="eyebrow dark">{position.department}</span><h1>{position.title}</h1><div className="position-meta"><PositionStatusBadge status={position.status} /><span>Opened {formatDate(position.opening_date)}</span></div></div>
      {canManage && <div className="position-detail-actions"><AppLink to={`/workflows/${position.id}`} className="primary-button button-link">{position.workflow_configured ? position.rubric_configured ? 'View setup' : 'Complete screening setup' : 'Create workflow'}</AppLink>{position.status === 'Open' && position.workflow_configured && position.rubric_configured ? <button type="button" className="secondary-button close-position-button" onClick={() => setConfirming(true)}>Close and screen</button> : null}</div>}
    </header>
    {error && <div className="auth-error">{error}</div>}
    <section className={`screening-status-card screening-${position.screening_status.toLowerCase().replace(' ', '-')}`}>
      <div><span>AI screening</span><h2>{position.screening_status}</h2><p>{position.screening_status === 'Not started' ? position.rubric_configured ? 'Candidate assessment and ranking will begin after this position is closed.' : 'A locked rubric is required before applications can open.' : position.screening_status === 'Processing' ? 'CVs are being scored against the locked rubric. No decisions are finalized until every active candidate succeeds.' : position.screening_status === 'Completed' ? 'Ranking is complete. Shortlisted candidates moved to the second workflow stage and all remaining candidates were rejected.' : position.screening_error || 'Screening stopped without finalizing any decisions.'}</p></div>
      {position.screening_status === 'Processing' ? <span className="screening-running"><span className="small-loader" />Processing</span> : null}
      {canManage && (position.screening_status === 'Failed' || screeningStalled) ? <button type="button" className="primary-button" disabled={closing} onClick={() => void retryScreening()}>{closing ? 'Restarting…' : screeningStalled ? 'Restart stalled screening' : 'Retry screening'}</button> : null}
      {position.screening_status === 'Completed' ? <AppLink to="/candidates" className="secondary-button button-link">View ranking</AppLink> : null}
    </section>
    <div className="position-detail-grid">
      <div className="detail-main"><DetailSection title="Position description" value={position.description} /><DetailSection title="Requirements" value={position.requirements} /><DetailSection title="Qualifications" value={position.qualifications} /></div>
      <aside className="detail-aside"><span>Position details</span><dl><div><dt>Department</dt><dd>{position.department}</dd></div><div><dt>Hiring manager</dt><dd>{position.hiring_manager || 'Not assigned'}</dd></div><div><dt>Opening date</dt><dd>{formatDate(position.opening_date)}</dd></div><div><dt>Status</dt><dd>{position.status}</dd></div><div><dt>Workflow</dt><dd>{position.workflow_configured ? 'Configured' : 'Required before publication'}</dd></div></dl><p>Position information cannot be edited after creation.</p></aside>
    </div>
    {confirming && <ConfirmDialog title={`Close and screen ${position.title}?`} message="Applications will stop immediately and the position cannot be reopened. Every active, processed CV will be scored against the locked rubric. Only after every score succeeds will the top candidates be shortlisted and the rest automatically rejected." confirmLabel="Close and start screening" busy={closing} onCancel={() => setConfirming(false)} onConfirm={() => void confirmClose()} />}
  </div>
}
