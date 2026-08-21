import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { ScreeningRubricPanel } from '../components/ScreeningRubricPanel'
import { addWorkflowStage, moveWorkflowStage, removeWorkflowStage, validateWorkflow, workflowToDraft } from '../lib/workflow-validation'
import { listPositions } from '../services/positions'
import { listWorkflowStages, saveWorkflow } from '../services/workflows'
import { listCandidatePositionIds } from '../services/candidates'
import { listScreeningRubrics } from '../services/screening'
import type { Position } from '../types/positions'
import type { ScreeningRubric } from '../types/screening'
import { stageLabels, stageTypes, type RecruitmentStage, type StageType, type WorkflowDraftStage, type WorkflowErrors } from '../types/workflows'

function draftSignature(stages: WorkflowDraftStage[]) {
  return JSON.stringify(stages.map(({ stage_type, name }) => ({ stage_type, name: name.trim() })))
}

export function WorkflowPage({ selectedPositionId, canManage }: { selectedPositionId?: string; canManage: boolean }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [allStages, setAllStages] = useState<RecruitmentStage[]>([])
  const [candidatePositionIds, setCandidatePositionIds] = useState<Set<string>>(new Set())
  const [rubrics, setRubrics] = useState<ScreeningRubric[]>([])
  const [draft, setDraft] = useState<WorkflowDraftStage[]>([])
  const [savedSignature, setSavedSignature] = useState('')
  const [errors, setErrors] = useState<WorkflowErrors>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void Promise.all([listPositions(), listWorkflowStages(), listCandidatePositionIds(), listScreeningRubrics()])
      .then(([positionRows, stageRows, positionIds, rubricRows]) => {
        if (!mounted) return
        setPositions(positionRows)
        setAllStages(stageRows)
        setCandidatePositionIds(positionIds)
        setRubrics(rubricRows)
      })
      .catch(() => { if (mounted) setLoadError('We could not load the recruitment workflows.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const selectedPosition = useMemo(() => {
    if (!positions.length) return null
    return positions.find((position) => position.id === selectedPositionId) ?? positions[0]
  }, [positions, selectedPositionId])

  useEffect(() => {
    if (!selectedPosition) return
    const next = workflowToDraft(allStages.filter((stage) => stage.position_id === selectedPosition.id))
    setDraft(next)
    setSavedSignature(draftSignature(next))
    setErrors({})
    setMessage(null)
  }, [allStages, selectedPosition])

  function setStageType(index: number, stageType: StageType) {
    setDraft((current) => current.map((stage, stageIndex) => stageIndex === index
      ? { ...stage, stage_type: stageType, name: stageType === 'custom' ? '' : stageLabels[stageType] }
      : stage))
    setErrors({})
    setMessage(null)
  }

  function setCustomName(index: number, name: string) {
    setDraft((current) => current.map((stage, stageIndex) => stageIndex === index ? { ...stage, name } : stage))
    setErrors((current) => ({ ...current, [index]: '' }))
    setMessage(null)
  }

  async function handleSave() {
    if (!selectedPosition) return
    const nextErrors = validateWorkflow(draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSaving(true)
    setMessage(null)
    try {
      const saved = await saveWorkflow(selectedPosition.id, draft)
      setAllStages((current) => [...current.filter((stage) => stage.position_id !== selectedPosition.id), ...saved])
      setPositions((current) => current.map((position) => position.id === selectedPosition.id ? { ...position, workflow_configured: true } : position))
      const nextDraft = workflowToDraft(saved)
      setDraft(nextDraft)
      setSavedSignature(draftSignature(nextDraft))
      setMessage('Workflow saved. Lock the screening rubric below to open applications.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The workflow could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-shell"><div className="module-state"><span className="small-loader" />Loading workflows…</div></div>
  if (loadError || !selectedPosition) return <div className="page-shell"><div className="module-state module-error">{loadError || 'No positions are available.'}</div></div>

  const dirty = draftSignature(draft) !== savedSignature
  const usedTypes = new Set(draft.map((stage) => stage.stage_type))
  const workflowLocked = candidatePositionIds.has(selectedPosition.id)
  const editable = canManage && selectedPosition.status === 'Open' && !workflowLocked
  const selectedRubric = rubrics.find((rubric) => rubric.position_id === selectedPosition.id) ?? null

  return <div className="page-shell workflow-page">
    <header className="page-header workflow-header"><div><span className="eyebrow dark">Function 2</span><h1>Recruitment workflows</h1><p>Build the ordered process each candidate follows for a specific position.</p></div><span className="status-pill"><span />{positions.filter((position) => position.workflow_configured).length} configured</span></header>

    <div className="workflow-layout">
      <aside className="workflow-position-list">
        <span className="workflow-aside-title">Positions</span>
        {positions.map((position) => <AppLink key={position.id} to={`/workflows/${position.id}`} current={position.id === selectedPosition.id} className="workflow-position-link">
          <strong>{position.title}</strong><span>{position.department}</span><em className={position.workflow_configured && position.rubric_configured ? 'configured' : ''}>{position.workflow_configured ? position.rubric_configured ? 'Ready' : 'Rubric needed' : 'Workflow needed'}</em>
        </AppLink>)}
      </aside>

      <section className="workflow-builder-card">
        <div className="workflow-builder-heading">
          <div><span>{selectedPosition.department}</span><h2>{selectedPosition.title}</h2><p>{workflowLocked ? 'This workflow is locked because candidates have already applied.' : editable ? 'Add, remove or reorder the stages between the two required steps.' : 'This workflow is available as a read-only process for your role.'}</p></div>
          <AppLink to={`/positions/${selectedPosition.id}`} className="secondary-button button-link">View position</AppLink>
        </div>

        <div className="workflow-rules"><strong>Required structure</strong><span>CV Review is always first</span><span>Final Decision is always last</span><span>No duplicate stages</span></div>

        <ol className="workflow-steps" aria-label={`${selectedPosition.title} recruitment workflow`}>
          {draft.map((stage, index) => {
            const locked = index === 0 || index === draft.length - 1
            return <li key={stage.key} className={errors[index] ? 'workflow-step-invalid' : ''}>
              <span className="step-number">{index + 1}</span>
              <div className="workflow-step-inputs">
                <label><span>Step {index + 1}</span><select value={stage.stage_type} disabled={!editable || locked} onChange={(event) => setStageType(index, event.target.value as StageType)}>
                  {stageTypes.map((type) => <option key={type} value={type} disabled={type !== stage.stage_type && type !== 'custom' && usedTypes.has(type)}>{stageLabels[type]}</option>)}
                </select></label>
                {stage.stage_type === 'custom' && <label className="custom-stage-name"><span>Custom step name</span><input value={stage.name} disabled={!editable} placeholder="Enter the stage name" onChange={(event) => setCustomName(index, event.target.value)} /></label>}
                {errors[index] && <small className="field-error">{errors[index]}</small>}
              </div>
              <div className="workflow-step-actions">
                {locked ? <span className="locked-step">Locked</span> : <>
                  <button type="button" disabled={!editable || index === 1} aria-label={`Move Step ${index + 1} up`} onClick={() => setDraft((current) => moveWorkflowStage(current, index, -1))}>↑</button>
                  <button type="button" disabled={!editable || index === draft.length - 2} aria-label={`Move Step ${index + 1} down`} onClick={() => setDraft((current) => moveWorkflowStage(current, index, 1))}>↓</button>
                  <button type="button" className="remove-step" disabled={!editable} aria-label={`Remove Step ${index + 1}`} onClick={() => setDraft((current) => removeWorkflowStage(current, index))}>Remove</button>
                </>}
              </div>
            </li>
          })}
        </ol>

        {editable && <div className="workflow-builder-footer">
          <button type="button" className="secondary-button" onClick={() => { setDraft((current) => addWorkflowStage(current)); setMessage(null) }}>+ Add step</button>
          <div>{message && <span className={message.startsWith('Workflow saved') ? 'save-message success' : 'save-message'}>{message}</span>}<button type="button" className="primary-button" disabled={saving || !dirty} onClick={() => void handleSave()}>{saving ? 'Saving…' : 'Save workflow'}</button></div>
        </div>}
      </section>
    </div>
    <ScreeningRubricPanel key={selectedPosition.id} position={selectedPosition} rubric={selectedRubric} canManage={canManage} onSaved={(saved) => {
      setRubrics((current) => [...current.filter((rubric) => rubric.position_id !== saved.position_id), saved])
      setPositions((current) => current.map((position) => position.id === saved.position_id ? { ...position, rubric_configured: true } : position))
    }} />
  </div>
}
