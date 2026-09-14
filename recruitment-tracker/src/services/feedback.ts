import { getSupabaseClient } from '../lib/supabase'
import type { FeedbackRecommendation, InterviewFeedback, InterviewFeedbackHistory, InterviewScores } from '../types/feedback'

export async function getInterviewFeedback(interviewId: string): Promise<InterviewFeedback | null> {
  const { data, error } = await getSupabaseClient()
    .from('interview_feedback')
    .select('*')
    .eq('interview_id', interviewId)
    .maybeSingle()
  if (error) throw error
  return data as InterviewFeedback | null
}

export async function listFeedbackHistory(feedbackId: string): Promise<InterviewFeedbackHistory[]> {
  const { data, error } = await getSupabaseClient()
    .from('interview_feedback_history')
    .select('*')
    .eq('feedback_id', feedbackId)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as InterviewFeedbackHistory[]
}

export async function saveInterviewFeedback(
  interviewId: string,
  scores: InterviewScores,
  notes: string,
  recommendation: FeedbackRecommendation | null,
) {
  const { data, error } = await getSupabaseClient().rpc('save_interview_feedback', {
    p_interview_id: interviewId,
    p_scores: scores,
    p_notes: notes,
    p_recommendation: recommendation,
  })
  if (error) throw error
  return data as string
}

export async function submitInterviewFeedback(interviewId: string) {
  const { data, error } = await getSupabaseClient().rpc('submit_interview_feedback', { p_interview_id: interviewId })
  if (error) throw error
  return data as string
}

export async function reviewInterviewFeedback(
  interviewId: string,
  decision: FeedbackRecommendation,
  note: string,
) {
  const { data, error } = await getSupabaseClient().rpc('review_interview_feedback', {
    p_interview_id: interviewId,
    p_decision: decision,
    p_review_note: note || null,
  })
  if (error) throw error
  return data
}
