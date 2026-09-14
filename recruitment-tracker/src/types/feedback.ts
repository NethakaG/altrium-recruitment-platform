export type FeedbackRecommendation = 'proceed' | 'hold' | 'reject'
export type FeedbackStatus = 'draft' | 'submitted' | 'reviewed'

export const interviewCriteria = [
  { key: 'communication', label: 'Communication', description: 'Clarity, listening and professional communication.' },
  { key: 'role_knowledge', label: 'Role knowledge', description: 'Understanding of the position and its responsibilities.' },
  { key: 'relevant_experience', label: 'Relevant experience', description: 'Evidence of useful experience for this role.' },
  { key: 'problem_solving', label: 'Problem solving', description: 'Reasoning, judgement and practical approach.' },
  { key: 'overall_suitability', label: 'Overall suitability', description: 'Overall readiness and fit for the position.' },
] as const

export type InterviewCriterionKey = (typeof interviewCriteria)[number]['key']
export type InterviewScores = Partial<Record<InterviewCriterionKey, number>>

export interface InterviewFeedback {
  id: string
  interview_id: string
  interviewer_id: string
  scores: InterviewScores
  notes: string
  recommendation: FeedbackRecommendation | null
  feedback_status: FeedbackStatus
  submitted_at: string | null
  review_decision: FeedbackRecommendation | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface InterviewFeedbackHistory {
  id: string
  feedback_id: string
  version: number
  snapshot: InterviewFeedback
  change_reason: string
  changed_by: string
  changed_at: string
}
