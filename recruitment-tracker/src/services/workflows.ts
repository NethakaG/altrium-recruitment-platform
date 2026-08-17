import { getSupabaseClient } from '../lib/supabase'
import type { RecruitmentStage, WorkflowDraftStage } from '../types/workflows'

const workflowFields = 'id,position_id,name,stage_order,stage_type'

export async function listWorkflowStages(): Promise<RecruitmentStage[]> {
  const { data, error } = await getSupabaseClient()
    .from('recruitment_stages')
    .select(workflowFields)
    .order('position_id')
    .order('stage_order')

  if (error) throw error
  return (data ?? []) as RecruitmentStage[]
}

export async function saveWorkflow(positionId: string, stages: WorkflowDraftStage[]): Promise<RecruitmentStage[]> {
  const { data, error } = await getSupabaseClient().rpc('save_recruitment_workflow', {
    p_position_id: positionId,
    p_stages: stages.map((stage) => ({ stage_type: stage.stage_type, name: stage.name.trim() })),
  })

  if (error) throw error
  return (data ?? []) as RecruitmentStage[]
}
