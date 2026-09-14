import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { feedbackTotal } from '../lib/feedback-validation'
import { validateFinalDecisionInput } from '../lib/final-decision-validation'
import { listCandidates } from '../services/candidates'
import {
  listFinalDecisionHistory,
  listFinalHiringDecisions,
  listFinalInterviewEvidence,
  reviewFinalHiringRecommendation,
  submitFinalHiringRecommendation,
} from '../services/final-decisions'
import type { StaffRole } from '../types/auth'
import type { Candidate } from '../types/candidates'
import type {
  FinalHiringDecision,
  FinalHiringDecisionHistory,
  FinalInterviewEvidence,
  FinalRecommendation,
} from '../types/final-decisions'

function display(value: string) {
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}
function recommendationCopy(value: FinalRecommendation) {
  return value === 'hire' ? 'Recommend hire' : 'Recommend reject'
}

function statusCopy(decision: FinalHiringDecision | undefined) {
  if (!decision) return 'Awaiting recommendation'
  if (decision.decision_status === 'pending_approval') return 'Awaiting Executive'
  if (decision.decision_status === 'returned') return 'Returned for reconsideration'
  return decision.final_outcome || 'Approved'
}

interface CandidateDecisionCardProps {
  candidate: Candidate
  decision?: FinalHiringDecision
  evidence: FinalInterviewEvidence[]
  history: FinalHiringDecisionHistory[]
  role: StaffRole
  basePath: string
  busy: string
  onRecommend: (candidateId: string, recommendation: FinalRecommendation, note: string) => Promise<void>
  onReview: (decisionId: string, action: 'approve' | 'return', note: string) => Promise<void>
}

function CandidateDecisionCard({
  candidate, decision, evidence, history, role, basePath, busy, onRecommend, onReview,
}: CandidateDecisionCardProps) {
  const [recommendation, setRecommendation] = useState<FinalRecommendation | ''>(decision?.recommendation ?? '')
  const [recommendationNote, setRecommendationNote] = useState(decision?.decision_status === 'returned' ? decision.recommendation_note : '')
  const [executiveNote, setExecutiveNote] = useState('')
  const [message, setMessage] = useState('')
  const managerCanEdit = role === 'hiring_manager' && (!decision || decision.decision_status === 'returned')
  const executiveCanReview = role === 'management_user' && decision?.decision_status === 'pending_approval'

  async function recommend(event: React.FormEvent) {
    event.preventDefault()
    const errors = validateFinalDecisionInput(recommendation, recommendationNote)
    if (errors.length) { setMessage(errors.join(' ')); return }
    setMessage('')
    await onRecommend(candidate.id, recommendation as FinalRecommendation, recommendationNote)
  }

  async function review(action: 'approve' | 'return') {
    const errors = validateFinalDecisionInput('hire', executiveNote)
    if (errors.length) { setMessage(errors.filter((item) => !item.includes('recommendation')).join(' ')); return }
    setMessage('')
    await onReview(decision!.id, action, executiveNote)
  }

  return <article className="final-candidate-card">
    <header className="final-candidate-heading">
      <div><span>Rank {candidate.screening?.rank ? `#${candidate.screening.rank}` : 'not available'}</span><h3>{candidate.candidate_name || 'Candidate'}</h3><p>{candidate.candidate_email || 'Contact details unavailable'}</p></div>
      <div className="final-candidate-summary"><b>{candidate.screening ? Number(candidate.screening.total_score).toFixed(1) : '—'}<small>AI score</small></b><span className={`final-status final-status-${decision?.decision_status ?? 'waiting'}`}>{statusCopy(decision)}</span></div>
    </header>

    <div className="final-card-links"><AppLink to={`${basePath}/${candidate.id}`} className="secondary-button">Open CV and full profile</AppLink></div>

    <section className="final-evidence">
      <div className="final-section-title"><span>Evidence trail</span><strong>{evidence.length} interview evaluation{evidence.length === 1 ? '' : 's'}</strong></div>
      {evidence.length ? <div className="final-evidence-list">{evidence.map((item) => {
        const total = item.feedback ? feedbackTotal(item.feedback.scores) : null
        return <details key={item.id}>
          <summary><span><strong>{item.stage?.name || 'Interview'}</strong><small>{item.interviewer?.display_name || 'Interviewer'} · {display(item.scheduled_start)}</small></span><b>{total ?? '—'} / 25</b></summary>
          {item.feedback?.feedback_status === 'draft' || !item.feedback ? <p>Final feedback was not submitted for this interview.</p> : <div className="final-feedback-detail"><p>{item.feedback.notes}</p><span>Interviewer: <strong>{item.feedback.recommendation || 'Not selected'}</strong></span><span>HR decision: <strong>{item.feedback.review_decision || 'Pending'}</strong></span>{item.feedback.review_note && <small>{item.feedback.review_note}</small>}</div>}
        </details>
      })}</div> : <p className="final-empty-evidence">No interview evaluations are available for this candidate.</p>}
    </section>

    {decision && <section className="final-current-decision">
      <div><span>Hiring Manager recommendation</span><strong>{recommendationCopy(decision.recommendation)}</strong><p>{decision.recommendation_note}</p><small>{display(decision.recommended_at)}</small></div>
      {decision.executive_note && <div><span>Executive response</span><strong>{decision.decision_status === 'returned' ? 'Returned' : `Approved · ${decision.final_outcome}`}</strong><p>{decision.executive_note}</p>{decision.decided_at && <small>{display(decision.decided_at)}</small>}</div>}
    </section>}

    {managerCanEdit && <form className="final-decision-form" onSubmit={(event) => void recommend(event)}>
      <label><span>Recommendation</span><select aria-label={`Recommendation for ${candidate.candidate_name || 'candidate'}`} value={recommendation} onChange={(event) => setRecommendation(event.target.value as FinalRecommendation | '')}><option value="">Choose</option><option value="hire">Recommend hire</option><option value="reject">Recommend reject</option></select></label>
      <label><span>Decision justification</span><textarea aria-label={`Recommendation reason for ${candidate.candidate_name || 'candidate'}`} maxLength={5000} value={recommendationNote} onChange={(event) => setRecommendationNote(event.target.value)} placeholder="Explain how the CV, screening result and interview feedback support this recommendation…" /><small>{recommendationNote.length}/5000 · Minimum 20 characters</small></label>
      {message && <div className="feedback-message">{message}</div>}
      <button type="submit" className="primary-button" disabled={Boolean(busy)}>{busy === candidate.id ? 'Submitting…' : decision ? 'Resubmit to Executive' : 'Submit to Executive'}</button>
    </form>}

    {executiveCanReview && <section className="final-decision-form">
      <label><span>Executive decision reason</span><textarea aria-label={`Executive reason for ${candidate.candidate_name || 'candidate'}`} maxLength={5000} value={executiveNote} onChange={(event) => setExecutiveNote(event.target.value)} placeholder="Record why this recommendation is approved or needs reconsideration…" /><small>{executiveNote.length}/5000 · Minimum 20 characters</small></label>
      {message && <div className="feedback-message">{message}</div>}
      <div className="feedback-actions"><button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => void review('approve')}>{busy === decision.id ? 'Saving…' : 'Approve recommendation'}</button><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void review('return')}>Return for reconsideration</button></div>
    </section>}

    {role !== 'hiring_manager' && role !== 'management_user' && <p className="final-readonly-note">Read-only monitoring. Hiring Managers recommend; Executives approve or return the decision.</p>}

    {history.length > 0 && <details className="feedback-history final-history"><summary>{history.length} previous decision version{history.length === 1 ? '' : 's'}</summary>{history.map((item) => <div key={item.id}><strong>Version {item.version}</strong><span>{item.change_reason}</span><small>{display(item.changed_at)}</small></div>)}</details>}
  </article>
}

export function FinalDecisionsPage({ role, basePath }: { role: StaffRole; basePath: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [decisions, setDecisions] = useState<FinalHiringDecision[]>([])
  const [evidence, setEvidence] = useState<FinalInterviewEvidence[]>([])
  const [history, setHistory] = useState<Record<string, FinalHiringDecisionHistory[]>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    const allCandidates = await listCandidates()
    const finalists = allCandidates.filter((candidate) => candidate.current_stage?.stage_type === 'final_decision')
    const [allDecisions, allEvidence] = await Promise.all([
      listFinalHiringDecisions(),
      listFinalInterviewEvidence(finalists.map((candidate) => candidate.id)),
    ])
    const histories = await Promise.all(allDecisions.map(async (decision) => [decision.id, await listFinalDecisionHistory(decision.id)] as const))
    setCandidates(finalists)
    setDecisions(allDecisions)
    setEvidence(allEvidence)
    setHistory(Object.fromEntries(histories))
  }

  useEffect(() => {
    let mounted = true
    void load().catch(() => { if (mounted) setMessage('Final hiring decisions could not be loaded.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const groups = useMemo(() => {
    const grouped = new Map<string, { title: string; department: string; candidates: Candidate[] }>()
    candidates.forEach((candidate) => {
      const current = grouped.get(candidate.position_id) ?? { title: candidate.position.title, department: candidate.position.department, candidates: [] }
      current.candidates.push(candidate)
      grouped.set(candidate.position_id, current)
    })
    return [...grouped.entries()].map(([positionId, group]) => ({
      positionId, ...group,
      candidates: group.candidates.sort((a, b) => (a.screening?.rank ?? Number.MAX_SAFE_INTEGER) - (b.screening?.rank ?? Number.MAX_SAFE_INTEGER)),
    }))
  }, [candidates])

  async function recommend(candidateId: string, recommendation: FinalRecommendation, note: string) {
    setBusy(candidateId); setMessage('')
    try { await submitFinalHiringRecommendation(candidateId, recommendation, note); await load(); setMessage('Recommendation submitted to the Executive.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The recommendation could not be submitted.') }
    finally { setBusy('') }
  }

  async function review(decisionId: string, action: 'approve' | 'return', note: string) {
    setBusy(decisionId); setMessage('')
    try { await reviewFinalHiringRecommendation(decisionId, action, note); await load(); setMessage(action === 'approve' ? 'The recommendation was approved and the final candidate outcome was recorded.' : 'The recommendation was returned to the Hiring Manager.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The Executive decision could not be recorded.') }
    finally { setBusy('') }
  }

  return <div className="page-shell final-decisions-page">
    <header className="page-header"><div><span className="eyebrow dark">Sprint 2 · Feature 3</span><h1>Final hiring decisions</h1><p>Compare finalists, review their full evidence trail and complete the two-step hiring approval.</p></div></header>
    <div className="final-flow-note"><strong>Controlled approval</strong><span>Hiring Managers recommend. Executives approve or return. Approving one hire never silently rejects the remaining finalists.</span></div>
    {message && <div className="candidate-message">{message}</div>}
    {loading ? <div className="module-state"><span className="small-loader" />Loading final decisions…</div> : groups.length ? <div className="final-position-groups">{groups.map((group) => <section className="final-position-section" key={group.positionId}>
      <header><div><span>{group.department || 'Department unavailable'}</span><h2>{group.title}</h2></div><strong>{group.candidates.length} finalist{group.candidates.length === 1 ? '' : 's'}</strong></header>
      <div className="final-candidate-grid">{group.candidates.map((candidate) => {
        const decision = decisions.find((item) => item.submission_id === candidate.id)
        return <CandidateDecisionCard key={candidate.id} candidate={candidate} decision={decision} evidence={evidence.filter((item) => item.submission_id === candidate.id)} history={decision ? history[decision.id] ?? [] : []} role={role} basePath={basePath} busy={busy} onRecommend={recommend} onReview={review} />
      })}</div>
    </section>)}</div> : <div className="module-state"><strong>No candidates are at Final Decision</strong><span>Finalists will appear here after completing their preceding workflow stages.</span></div>}
  </div>
}
