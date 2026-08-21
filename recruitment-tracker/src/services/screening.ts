import { getSupabaseClient } from '../lib/supabase'
import type { ScreeningCriterion, ScreeningRubric } from '../types/screening'

const rubricFields = 'position_id,criteria,shortlist_count,locked_at'

export async function listScreeningRubrics(): Promise<ScreeningRubric[]> {
  const { data, error } = await getSupabaseClient().from('position_screening_rubrics').select(rubricFields)
  if (error) throw error
  return (data ?? []) as ScreeningRubric[]
}

export async function saveScreeningRubric(
  positionId: string,
  criteria: ScreeningCriterion[],
  shortlistCount: number,
): Promise<ScreeningRubric> {
  const { data, error } = await getSupabaseClient().rpc('save_position_screening_rubric', {
    p_position_id: positionId,
    p_criteria: criteria,
    p_shortlist_count: shortlistCount,
  })
  if (error) throw error
  return data as ScreeningRubric
}
