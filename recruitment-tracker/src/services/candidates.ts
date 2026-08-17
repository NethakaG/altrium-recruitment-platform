import { getSupabaseClient } from '../lib/supabase'
import type { ApplicationStatus, Candidate } from '../types/candidates'

const candidateFields = `
  id,position_id,candidate_name,candidate_email,candidate_phone,original_filename,mime_type,file_size,
  processing_status,submitted_at,processed_at,current_stage_id,application_status,extracted_profile,extraction_model,
  position:positions!cv_submissions_position_id_fkey(title,department),
  current_stage:recruitment_stages!cv_submissions_current_stage_id_fkey(id,name,stage_order,stage_type)
`

export async function listCandidates(): Promise<Candidate[]> {
  const { data, error } = await getSupabaseClient().from('cv_submissions').select(candidateFields).order('submitted_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Candidate[]
}

export async function getCandidate(candidateId: string): Promise<Candidate | null> {
  const { data, error } = await getSupabaseClient().from('cv_submissions').select(candidateFields).eq('id', candidateId).maybeSingle()
  if (error) throw error
  return data as unknown as Candidate | null
}

export async function advanceCandidate(candidateId: string) {
  const { data, error } = await getSupabaseClient().rpc('advance_candidate', { p_submission_id: candidateId })
  if (error) throw error
  return data
}

export async function setCandidateStatus(candidateId: string, status: ApplicationStatus) {
  const { data, error } = await getSupabaseClient().rpc('set_candidate_status', { p_submission_id: candidateId, p_status: status })
  if (error) throw error
  return data
}

export async function requestCvDownload(candidateId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().functions.invoke<{ url?: string }>('get-cv-download', { body: { submissionId: candidateId } })
  if (error || !data?.url) throw error ?? new Error('The CV download could not be prepared.')
  return data.url
}

export async function retryCvExtraction(candidateId: string) {
  const { data, error } = await getSupabaseClient().functions.invoke<{ success?: boolean }>('process-cv', { body: { submissionId: candidateId } })
  if (error || !data?.success) throw error ?? new Error('The CV could not be processed.')
}

export async function listCandidatePositionIds(): Promise<Set<string>> {
  const { data, error } = await getSupabaseClient().from('cv_submissions').select('position_id')
  if (error) throw error
  return new Set((data ?? []).map((row) => row.position_id as string))
}
