import type { FinalRecommendation } from '../types/final-decisions'

export function validateFinalDecisionInput(recommendation: FinalRecommendation | '', note: string): string[] {
  const errors: string[] = []
  if (!recommendation) errors.push('Choose a recommendation.')
  const length = note.trim().length
  if (length < 20) errors.push('Enter a reason of at least 20 characters.')
  if (length > 5000) errors.push('The reason cannot exceed 5000 characters.')
  return errors
}
