import { getSupabaseClient } from '../lib/supabase'
import type { Interview, InterviewFormat, InterviewInput, InterviewerProfile } from '../types/interviews'

const interviewFields = `
  id,submission_id,stage_id,interviewer_id,scheduled_start,scheduled_end,format,meeting_url,location,instructions,
  status,actual_start,actual_end,cancellation_reason,
  candidate:cv_submissions!interviews_submission_id_fkey(id,candidate_name,candidate_email,position:positions!cv_submissions_position_id_fkey(title,department)),
  stage:recruitment_stages!interviews_stage_id_fkey(name,stage_type),
  interviewer:interviewer_profiles!interviews_interviewer_id_fkey(*),
  notifications:interview_email_notifications!interview_email_notifications_interview_id_fkey(id,notification_type,recipient_kind,status,scheduled_for,sent_at,last_error)
`

function normalize(row: Record<string, unknown>): Interview {
  const candidate = row.candidate as ({ position?: Interview['position'] } & NonNullable<Interview['candidate']>) | null
  return { ...row, candidate, position: candidate?.position ?? null } as unknown as Interview
}

export async function listInterviewerProfiles(): Promise<InterviewerProfile[]> {
  const { data, error } = await getSupabaseClient().from('interviewer_profiles').select('*').order('is_active', { ascending: false }).order('years_experience', { ascending: false })
  if (error) throw error
  return (data ?? []) as InterviewerProfile[]
}

export async function getMyInterviewerProfile(): Promise<InterviewerProfile | null> {
  const { data: auth } = await getSupabaseClient().auth.getUser()
  if (!auth.user) return null
  const { data, error } = await getSupabaseClient().from('interviewer_profiles').select('*').eq('staff_id', auth.user.id).maybeSingle()
  if (error) throw error
  return data as InterviewerProfile | null
}

export async function listInterviews(): Promise<Interview[]> {
  const { data, error } = await getSupabaseClient().from('interviews').select(interviewFields).order('scheduled_start')
  if (error) throw error
  return (data ?? []).map((row) => normalize(row as Record<string, unknown>))
}

export async function listCandidateInterviews(submissionId: string): Promise<Interview[]> {
  const { data, error } = await getSupabaseClient().from('interviews').select(interviewFields).eq('submission_id', submissionId).order('scheduled_start', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => normalize(row as Record<string, unknown>))
}

export async function createInterview(input: InterviewInput): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('create_interview', {
    p_submission_id: input.submissionId, p_interviewer_id: input.interviewerId,
    p_scheduled_start: input.start, p_scheduled_end: input.end, p_format: input.format,
    p_meeting_url: input.meetingUrl || null, p_location: input.location || null, p_instructions: input.instructions || null,
  })
  if (error) throw error
  return data as string
}

export async function rescheduleInterview(id: string, input: Omit<InterviewInput, 'submissionId' | 'interviewerId'>) {
  const { error } = await getSupabaseClient().rpc('reschedule_interview', {
    p_interview_id: id, p_scheduled_start: input.start, p_scheduled_end: input.end, p_format: input.format,
    p_meeting_url: input.meetingUrl || null, p_location: input.location || null, p_instructions: input.instructions || null,
  })
  if (error) throw error
}

export async function cancelInterview(id: string, reason: string) {
  const { error } = await getSupabaseClient().rpc('cancel_interview', { p_interview_id: id, p_reason: reason })
  if (error) throw error
}

export async function startInterview(id: string) {
  const { error } = await getSupabaseClient().rpc('start_interview', { p_interview_id: id })
  if (error) throw error
}

export async function endInterview(id: string) {
  const { error } = await getSupabaseClient().rpc('end_interview', { p_interview_id: id })
  if (error) throw error
}

export async function dispatchInterviewEmails(interviewId?: string) {
  const { data, error } = await getSupabaseClient().functions.invoke('send-interview-emails', { body: { interviewId } })
  if (error) throw error
  return data as { sent: number; failed: number }
}

export type { InterviewFormat }
