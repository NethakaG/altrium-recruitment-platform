import { interviewCriteria, type FeedbackRecommendation, type InterviewScores } from '../types/feedback'

export interface FeedbackDraft {
  scores: InterviewScores
  notes: string
  recommendation: FeedbackRecommendation | null
}

export function validateFeedbackDraft(input: FeedbackDraft): string[] {
  const errors: string[] = []
  for (const criterion of interviewCriteria) {
    const value = input.scores[criterion.key]
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 5)) {
      errors.push(`${criterion.label} must be scored from 1 to 5.`)
    }
  }
  if (input.notes.length > 5000) errors.push('Interview notes cannot exceed 5000 characters.')
  return errors
}

export function validateFeedbackSubmission(input: FeedbackDraft): string[] {
  const errors = validateFeedbackDraft(input)
  if (interviewCriteria.some((criterion) => input.scores[criterion.key] === undefined)) {
    errors.push('Score all five evaluation criteria.')
  }
  if (input.notes.trim().length < 20) errors.push('Add at least 20 characters of interview feedback.')
  if (!input.recommendation) errors.push('Choose Proceed, Hold or Reject.')
  return errors
}

export function feedbackTotal(scores: InterviewScores): number | null {
  const values = interviewCriteria.map((criterion) => scores[criterion.key])
  if (values.some((value) => value === undefined)) return null
  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}
