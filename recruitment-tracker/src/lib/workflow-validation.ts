import { createWorkflowKey, emptyWorkflow, stageLabels, stageTypes, type RecruitmentStage, type StageType, type WorkflowDraftStage, type WorkflowErrors } from '../types/workflows'

export function workflowToDraft(stages: RecruitmentStage[]): WorkflowDraftStage[] {
  if (!stages.length) return emptyWorkflow()
  return [...stages]
    .sort((a, b) => a.stage_order - b.stage_order)
    .map((stage) => ({ key: stage.id || createWorkflowKey(), stage_type: stage.stage_type, name: stage.name }))
}

export function validateWorkflow(stages: WorkflowDraftStage[]): WorkflowErrors {
  const errors: WorkflowErrors = {}
  if (stages.length < 2) return { 0: 'A workflow requires CV Review and Final Decision.' }
  if (stages[0]?.stage_type !== 'cv_review') errors[0] = 'CV Review must be Step 1.'
  if (stages.at(-1)?.stage_type !== 'final_decision') errors[stages.length - 1] = 'Final Decision must be the last step.'

  const seen = new Map<string, number>()
  stages.forEach((stage, index) => {
    if (!stageTypes.includes(stage.stage_type)) errors[index] = 'Select a valid stage.'
    if (stage.stage_type === 'custom' && !stage.name.trim()) errors[index] = 'Enter a name for this custom step.'
    const key = stage.stage_type === 'custom' ? `custom:${stage.name.trim().toLowerCase()}` : stage.stage_type
    if (seen.has(key)) {
      errors[index] = 'The same stage cannot be used twice.'
      const firstIndex = seen.get(key)
      if (firstIndex !== undefined) errors[firstIndex] = 'The same stage cannot be used twice.'
    } else seen.set(key, index)
  })
  return errors
}

export function addWorkflowStage(stages: WorkflowDraftStage[]): WorkflowDraftStage[] {
  const used = new Set(stages.map((stage) => stage.stage_type))
  const nextType = (stageTypes.find((type) => !used.has(type) && !['cv_review', 'final_decision'].includes(type)) ?? 'custom') as StageType
  const next = { key: createWorkflowKey(), stage_type: nextType, name: nextType === 'custom' ? '' : stageLabels[nextType] }
  return [...stages.slice(0, -1), next, stages.at(-1)!]
}

export function moveWorkflowStage(stages: WorkflowDraftStage[], index: number, direction: -1 | 1): WorkflowDraftStage[] {
  const target = index + direction
  if (index <= 0 || index >= stages.length - 1 || target <= 0 || target >= stages.length - 1) return stages
  const next = [...stages]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function removeWorkflowStage(stages: WorkflowDraftStage[], index: number): WorkflowDraftStage[] {
  if (index <= 0 || index >= stages.length - 1) return stages
  return stages.filter((_, stageIndex) => stageIndex !== index)
}
