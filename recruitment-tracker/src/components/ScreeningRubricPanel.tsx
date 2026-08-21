import { useMemo, useState } from 'react'
import { validateScreeningRubric } from '../lib/screening-validation'
import { saveScreeningRubric } from '../services/screening'
import type { Position } from '../types/positions'
import type { ScreeningCriterion, ScreeningRubric } from '../types/screening'
import { ConfirmDialog } from './ConfirmDialog'

function criterionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function starterCriteria(): ScreeningCriterion[] {
  return [
    { id: criterionId(), name: 'Relevant experience', description: 'Explicit evidence of experience directly relevant to this position.', weight: 40 },
    { id: criterionId(), name: 'Skills match', description: 'Explicit evidence of the role-specific skills and tools required for this position.', weight: 35 },
    { id: criterionId(), name: 'Education and achievements', description: 'Relevant education, training, projects, certifications or measurable achievements.', weight: 25 },
  ]
}

export function ScreeningRubricPanel({
  position,
  rubric,
  canManage,
  onSaved,
}: {
  position: Position
  rubric: ScreeningRubric | null
  canManage: boolean
  onSaved: (rubric: ScreeningRubric) => void
}) {
  const [criteria, setCriteria] = useState<ScreeningCriterion[]>(starterCriteria)
  const [shortlistCount, setShortlistCount] = useState(3)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const totalWeight = useMemo(() => criteria.reduce((sum, criterion) => sum + criterion.weight, 0), [criteria])

  function update(index: number, patch: Partial<ScreeningCriterion>) {
    setCriteria((current) => current.map((criterion, itemIndex) => itemIndex === index ? { ...criterion, ...patch } : criterion))
    setErrors([])
    setMessage('')
  }

  function requestSave() {
    const validationErrors = validateScreeningRubric(criteria, shortlistCount)
    setErrors(validationErrors)
    if (!validationErrors.length) setConfirming(true)
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await saveScreeningRubric(position.id, criteria.map((criterion) => ({
        ...criterion,
        name: criterion.name.trim(),
        description: criterion.description.trim(),
      })), shortlistCount)
      onSaved(saved)
      setConfirming(false)
      setMessage('Rubric locked. The position is now ready to accept applications.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The screening rubric could not be saved.')
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  return <section className="screening-rubric-card">
    <div className="screening-rubric-heading">
      <div><span>Function 4</span><h2>AI screening rubric</h2><p>The AI scores every processed CV against these criteria after the position closes. Ranking is calculated from the weighted totals.</p></div>
      {rubric ? <strong className="rubric-lock-badge">Locked</strong> : <strong className="rubric-draft-badge">Setup required</strong>}
    </div>

    {rubric ? <>
      <div className="rubric-summary"><span>Shortlist size <strong>{rubric.shortlist_count}</strong></span><span>Weights <strong>100%</strong></span><span>Editing <strong>Disabled</strong></span></div>
      <ol className="locked-criteria-list">{rubric.criteria.map((criterion, index) => <li key={criterion.id}><i>{index + 1}</i><div><strong>{criterion.name}</strong><p>{criterion.description}</p></div><em>{criterion.weight}%</em></li>)}</ol>
      <p className="rubric-lock-note">This rubric cannot be edited because candidates must be assessed consistently against the criteria published for this position.</p>
    </> : !position.workflow_configured ? <div className="module-state"><strong>Save the workflow first</strong><span>The screening rubric is the final setup step before applications open.</span></div>
      : position.status !== 'Open' ? <div className="module-state module-error"><strong>No rubric is available</strong><span>A closed position cannot receive a new screening rubric.</span></div>
      : !canManage ? <div className="module-state"><strong>Setup pending</strong><span>IT Admin or HR must configure and lock this position’s screening rubric.</span></div>
      : <>
        <div className="rubric-controls">
          <label><span>Candidates to shortlist</span><select value={shortlistCount} onChange={(event) => setShortlistCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <div className={totalWeight === 100 ? 'weight-total weight-valid' : 'weight-total'}><span>Total weight</span><strong>{totalWeight}%</strong></div>
        </div>
        <ol className="rubric-editor-list">{criteria.map((criterion, index) => <li key={criterion.id}>
          <span className="step-number">{index + 1}</span>
          <div className="rubric-editor-fields">
            <label><span>Criterion name</span><input value={criterion.name} maxLength={80} onChange={(event) => update(index, { name: event.target.value })} /></label>
            <label className="rubric-weight-field"><span>Weight %</span><input type="number" min="5" max="80" step="1" value={criterion.weight} onChange={(event) => update(index, { weight: Number(event.target.value) })} /></label>
            <label className="rubric-description-field"><span>Evidence to assess</span><textarea value={criterion.description} maxLength={500} onChange={(event) => update(index, { description: event.target.value })} /></label>
          </div>
          <button type="button" className="remove-rubric-criterion" disabled={criteria.length <= 3} onClick={() => setCriteria((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </li>)}</ol>
        {errors.length ? <div className="rubric-errors" role="alert">{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
        {message ? <div className={message.startsWith('Rubric locked') ? 'candidate-message' : 'auth-error'}>{message}</div> : null}
        <div className="rubric-actions"><button type="button" className="secondary-button" disabled={criteria.length >= 8} onClick={() => setCriteria((current) => [...current, { id: criterionId(), name: '', description: '', weight: 10 }])}>+ Add criterion</button><button type="button" className="primary-button" onClick={requestSave}>Review and lock rubric</button></div>
      </>}

    {confirming ? <ConfirmDialog title="Lock this screening rubric?" message="After locking, the criteria, weights and shortlist size cannot be changed. Every candidate for this position will be screened against this exact rubric when the position closes." confirmLabel="Lock rubric" busy={saving} onCancel={() => setConfirming(false)} onConfirm={() => void save()} /> : null}
  </section>
}
