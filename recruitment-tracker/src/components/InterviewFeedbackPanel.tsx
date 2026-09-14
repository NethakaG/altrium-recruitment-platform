import { useEffect, useMemo, useState } from 'react'
import { feedbackTotal, validateFeedbackDraft, validateFeedbackSubmission } from '../lib/feedback-validation'
import { getInterviewFeedback, listFeedbackHistory, reviewInterviewFeedback, saveInterviewFeedback, submitInterviewFeedback } from '../services/feedback'
import { interviewCriteria, type FeedbackRecommendation, type InterviewFeedback, type InterviewFeedbackHistory, type InterviewScores } from '../types/feedback'
import type { Interview } from '../types/interviews'

function display(value: string) {
  return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

const decisionCopy: Record<FeedbackRecommendation, string> = {
  proceed: 'Proceed', hold: 'Hold', reject: 'Reject',
}

export function InterviewFeedbackPanel({ interview, mode, onDecision }: {
  interview: Interview
  mode: 'interviewer' | 'reviewer'
  onDecision?: () => Promise<void> | void
}) {
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null)
  const [history, setHistory] = useState<InterviewFeedbackHistory[]>([])
  const [scores, setScores] = useState<InterviewScores>({})
  const [notes, setNotes] = useState('')
  const [recommendation, setRecommendation] = useState<FeedbackRecommendation | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    const row = await getInterviewFeedback(interview.id)
    setFeedback(row)
    setScores(row?.scores ?? {})
    setNotes(row?.notes ?? '')
    setRecommendation(row?.recommendation ?? null)
    setReviewNote(row?.review_note ?? '')
    setHistory(row ? await listFeedbackHistory(row.id) : [])
  }

  useEffect(() => {
    let mounted = true
    void getInterviewFeedback(interview.id).then(async (row) => {
      const revisions = row ? await listFeedbackHistory(row.id) : []
      if (!mounted) return
      setFeedback(row); setScores(row?.scores ?? {}); setNotes(row?.notes ?? '')
      setRecommendation(row?.recommendation ?? null); setReviewNote(row?.review_note ?? '')
      setHistory(revisions)
    }).catch(() => { if (mounted) setMessage('Feedback could not be loaded.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [interview.id])

  const total = useMemo(() => feedbackTotal(scores), [scores])
  const editable = mode === 'interviewer'
    && Boolean(interview.actual_start)
    && ['in_progress', 'awaiting_feedback'].includes(interview.status)
    && !feedback?.review_decision

  async function save(submit: boolean) {
    const draft = { scores, notes, recommendation }
    const errors = submit ? validateFeedbackSubmission(draft) : validateFeedbackDraft(draft)
    if (errors.length) { setMessage(errors.join(' ')); return }
    setBusy(submit ? 'submit' : 'save'); setMessage('')
    try {
      await saveInterviewFeedback(interview.id, scores, notes, recommendation)
      if (submit) await submitInterviewFeedback(interview.id)
      await load()
      setMessage(submit ? 'Feedback submitted for HR review.' : feedback?.feedback_status === 'submitted' ? 'Submitted feedback updated and the previous version was recorded.' : 'Draft saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Feedback could not be saved.')
    } finally { setBusy('') }
  }

  async function review(decision: FeedbackRecommendation) {
    if (feedback && decision !== feedback.recommendation && reviewNote.trim().length < 10) {
      setMessage('Explain in at least 10 characters why your decision differs from the recommendation.')
      return
    }
    setBusy(decision); setMessage('')
    try {
      await reviewInterviewFeedback(interview.id, decision, reviewNote)
      await load()
      await onDecision?.()
      setMessage(decision === 'proceed' ? 'Candidate progressed to the next stage.' : decision === 'hold' ? 'Candidate placed on hold at this stage.' : 'Candidate rejected and their workflow ended.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The feedback decision could not be applied.')
    } finally { setBusy('') }
  }

  if (loading) return <section className="feedback-panel"><span className="small-loader" /> Loading feedback…</section>

  if (mode === 'interviewer' && !interview.actual_start) {
    return <section className="feedback-panel feedback-locked"><strong>Feedback unlocks when the interview starts</strong><span>You can review the candidate now, but scoring and notes remain locked until Start interview is selected.</span></section>
  }

  if (mode === 'reviewer' && (!feedback || feedback.feedback_status === 'draft')) {
    return <section className="feedback-panel feedback-locked"><strong>Awaiting interviewer feedback</strong><span>{feedback ? 'The interviewer has saved a draft but has not submitted it.' : 'No feedback has been submitted for this interview.'}</span></section>
  }

  return <section className="feedback-panel">
    <div className="feedback-heading">
      <div><span>Sprint 2 · Feature 2</span><h3>Interview evaluation</h3></div>
      <div className="feedback-score-total"><strong>{total ?? '—'}</strong><span>/ 25</span></div>
    </div>

    <div className="feedback-criteria">
      {interviewCriteria.map((criterion) => <label key={criterion.key}>
        <span><strong>{criterion.label}</strong><small>{criterion.description}</small></span>
        <select aria-label={`${criterion.label} score`} value={scores[criterion.key] ?? ''} disabled={!editable} onChange={(event) => setScores((current) => {
          const next = { ...current }
          if (event.target.value) next[criterion.key] = Number(event.target.value)
          else delete next[criterion.key]
          return next
        })}>
          <option value="">Score</option>
          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
        </select>
      </label>)}
    </div>

    <label className="feedback-notes"><span>Interview notes</span><textarea value={notes} disabled={!editable} maxLength={5000} placeholder="Record evidence, strengths, concerns and relevant answers…" onChange={(event) => setNotes(event.target.value)} /><small>{notes.length}/5000 characters · Minimum 20 to submit</small></label>

    <label className="feedback-recommendation"><span>Interviewer recommendation</span><select value={recommendation ?? ''} disabled={!editable} onChange={(event) => setRecommendation((event.target.value || null) as FeedbackRecommendation | null)}><option value="">Choose a recommendation</option><option value="proceed">Proceed</option><option value="hold">Hold</option><option value="reject">Reject</option></select></label>

    {message && <div className="feedback-message">{message}</div>}

    {mode === 'interviewer' && editable && <div className="feedback-actions">
      <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void save(false)}>{busy === 'save' ? 'Saving…' : feedback?.feedback_status === 'submitted' ? 'Save changes' : 'Save draft'}</button>
      {interview.status === 'awaiting_feedback' && feedback?.feedback_status !== 'submitted' && <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => void save(true)}>{busy === 'submit' ? 'Submitting…' : 'Submit feedback'}</button>}
    </div>}

    {mode === 'interviewer' && interview.status === 'in_progress' && <p className="feedback-guidance">Save notes and scores during the interview. End the interview before submitting the final evaluation.</p>}
    {mode === 'interviewer' && feedback?.feedback_status === 'submitted' && !feedback.review_decision && <p className="feedback-guidance">Submitted to HR. You can still save corrections until HR records a decision.</p>}

    {mode === 'reviewer' && feedback && <div className="feedback-review">
      <div className="recommendation-banner"><span>Interviewer recommends</span><strong>{feedback.recommendation ? decisionCopy[feedback.recommendation] : 'Not selected'}</strong></div>
      {feedback.review_decision && <div className={`review-decision review-${feedback.review_decision}`}><span>HR decision</span><strong>{decisionCopy[feedback.review_decision]}</strong>{feedback.reviewed_at && <small>{display(feedback.reviewed_at)}</small>}</div>}
      {(!feedback.review_decision || feedback.review_decision === 'hold') && <>
        <label className="feedback-notes"><span>HR decision note</span><textarea value={reviewNote} maxLength={2000} placeholder="Required when your decision differs from the interviewer recommendation…" onChange={(event) => setReviewNote(event.target.value)} /></label>
        <div className="feedback-actions"><button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => void review('proceed')}>Proceed</button><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void review('hold')}>Hold</button><button type="button" className="danger-button" disabled={Boolean(busy)} onClick={() => void review('reject')}>Reject</button></div>
      </>}
    </div>}

    {history.length > 0 && <details className="feedback-history"><summary>{history.length} previous version{history.length === 1 ? '' : 's'} recorded</summary>{history.map((item) => <div key={item.id}><strong>Version {item.version}</strong><span>{item.change_reason}</span><small>{display(item.changed_at)}</small></div>)}</details>}
  </section>
}
