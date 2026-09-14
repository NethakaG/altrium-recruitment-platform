import type { FeedbackRecommendation, FeedbackStatus, InterviewScores } from './feedback'

export type FinalRecommendation = 'hire' | 'reject'
export type FinalDecisionStatus = 'pending_approval' | 'returned' | 'approved'
export type FinalOutcome = 'Hired' | 'Rejected'

export interface FinalHiringDecision {
  id: string
  submission_id: string
  position_id: string
  hiring_manager_id: string
  recommendation: FinalRecommendation
  recommendation_note: string
  decision_status: FinalDecisionStatus
  recommended_at: string
  executive_id: string | null
  executive_note: string | null
  decided_at: string | null
  final_outcome: FinalOutcome | null
  version: number
  created_at: string
  updated_at: string
}
export interface FinalHiringDecisionHistory {
  id: string
  decision_id: string
  version: number
  snapshot: FinalHiringDecision
  change_reason: string
  changed_by: string
  changed_at: string
}

export interface FinalInterviewEvidence {
  id: string
  submission_id: string
  scheduled_start: string
  actual_end: string | null
  stage: { name: string; stage_type: string } | null
  interviewer: { display_name: string; role_title: string } | null
  feedback: {
    scores: InterviewScores
    notes: string
    recommendation: FeedbackRecommendation | null
    feedback_status: FeedbackStatus
    review_decision: FeedbackRecommendation | null
    review_note: string | null
    reviewed_at: string | null
  } | null
}
