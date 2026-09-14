import { getSupabaseClient } from '../lib/supabase'
import type {
  FinalHiringDecision,
  FinalHiringDecisionHistory,
  FinalInterviewEvidence,
  FinalRecommendation,
} from '../types/final-decisions'

const evidenceFields = `
  id,submission_id,scheduled_start,actual_end,
  stage:recruitment_stages!interviews_stage_id_fkey(name,stage_type),
  interviewer:interviewer_profiles!interviews_interviewer_id_fkey(display_name,role_title),
  feedback:interview_feedback!interview_feedback_interview_id_fkey(
    scores,notes,recommendation,feedback_status,review_decision,review_note,reviewed_at
  )
`

export async function listFinalHiringDecisions(): Promise<FinalHiringDecision[]> {
  const { data, error } = await getSupabaseClient()
    .from('final_hiring_decisions')
    .select('*')
    .order('recommended_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FinalHiringDecision[]
}
export async function listFinalDecisionHistory(decisionId: string): Promise<FinalHiringDecisionHistory[]> {
  const { data, error } = await getSupabaseClient()
    .from('final_hiring_decision_history')
    .select('*')
    .eq('decision_id', decisionId)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as FinalHiringDecisionHistory[]
}

export async function listFinalInterviewEvidence(submissionIds: string[]): Promise<FinalInterviewEvidence[]> {
  if (!submissionIds.length) return []
  const { data, error } = await getSupabaseClient()
    .from('interviews')
    .select(evidenceFields)
    .in('submission_id', submissionIds)
    .order('scheduled_start', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as FinalInterviewEvidence[]
}

export async function submitFinalHiringRecommendation(
  submissionId: string,
  recommendation: FinalRecommendation,
  note: string,
): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('submit_final_hiring_recommendation', {
    p_submission_id: submissionId,
    p_recommendation: recommendation,
    p_note: note,
  })
  if (error) throw error
  return data as string
}

export async function reviewFinalHiringRecommendation(
  decisionId: string,
  action: 'approve' | 'return',
  note: string,
) {
  const { data, error } = await getSupabaseClient().rpc('review_final_hiring_recommendation', {
    p_decision_id: decisionId,
    p_action: action,
    p_note: note,
  })
  if (error) throw error
  return data
}
