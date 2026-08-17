export const stageTypes = [
  'cv_review',
  'hr_screening',
  'hr_interview',
  'technical_assessment',
  'technical_interview',
  'hiring_manager_interview',
  'engineering_manager_interview',
  'executive_interview',
  'final_decision',
  'custom',
] as const

export type StageType = (typeof stageTypes)[number]

export const stageLabels: Record<StageType, string> = {
  cv_review: 'CV Review',
  hr_screening: 'HR Screening',
  hr_interview: 'HR Interview',
  technical_assessment: 'Technical Assessment',
  technical_interview: 'Technical Interview',
  hiring_manager_interview: 'Hiring Manager Interview',
  engineering_manager_interview: 'Engineering Manager Interview',
  executive_interview: 'Executive Interview',
  final_decision: 'Final Decision',
  custom: 'Custom Step',
}

export interface RecruitmentStage {
  id: string
  position_id: string
  name: string
  stage_order: number
  stage_type: StageType
}

export interface WorkflowDraftStage {
  key: string
  stage_type: StageType
  name: string
}

export type WorkflowErrors = Record<number, string>

export function createWorkflowKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export function emptyWorkflow(): WorkflowDraftStage[] {
  return [
    { key: createWorkflowKey(), stage_type: 'cv_review', name: stageLabels.cv_review },
    { key: createWorkflowKey(), stage_type: 'final_decision', name: stageLabels.final_decision },
  ]
}
