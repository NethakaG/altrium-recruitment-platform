import { describe, expect, it } from 'vitest'
import { feedbackTotal, validateFeedbackDraft, validateFeedbackSubmission } from './feedback-validation'

const complete = {
  communication: 4,
  role_knowledge: 5,
  relevant_experience: 3,
  problem_solving: 4,
  overall_suitability: 4,
}

describe('interview feedback validation', () => {
  it('allows partial feedback to be saved as a draft', () => {
    expect(validateFeedbackDraft({ scores: { communication: 4 }, notes: 'Live note', recommendation: null })).toEqual([])
  })

  it('requires complete scores, useful notes and a recommendation to submit', () => {
    expect(validateFeedbackSubmission({ scores: {}, notes: 'Too short', recommendation: null })).toEqual([
      'Score all five evaluation criteria.',
      'Add at least 20 characters of interview feedback.',
      'Choose Proceed, Hold or Reject.',
    ])
  })

  it('calculates a five-criterion score out of 25', () => {
    expect(feedbackTotal(complete)).toBe(20)
    expect(feedbackTotal({ communication: 4 })).toBeNull()
  })
})
