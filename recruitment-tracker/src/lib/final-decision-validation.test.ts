import { describe, expect, it } from 'vitest'
import { validateFinalDecisionInput } from './final-decision-validation'

describe('validateFinalDecisionInput', () => {
  it('requires a recommendation and a meaningful reason', () => {
    expect(validateFinalDecisionInput('', 'Too short')).toEqual([
      'Choose a recommendation.',
      'Enter a reason of at least 20 characters.',
    ])
  })

  it('accepts a complete final decision explanation', () => {
    expect(validateFinalDecisionInput('hire', 'Strong interview evidence supports this recommendation.')).toEqual([])
  })

  it('rejects notes longer than the database limit', () => {
    expect(validateFinalDecisionInput('reject', 'x'.repeat(5001))).toContain('The reason cannot exceed 5000 characters.')
  })
})
