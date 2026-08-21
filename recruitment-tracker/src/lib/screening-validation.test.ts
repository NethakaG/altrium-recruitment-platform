import { describe, expect, it } from 'vitest'
import { validateScreeningRubric } from './screening-validation'

const valid = [
  { id: 'one', name: 'Experience', description: 'Relevant practical experience.', weight: 40 },
  { id: 'two', name: 'Skills', description: 'Relevant role-specific technical skills.', weight: 35 },
  { id: 'three', name: 'Achievements', description: 'Relevant projects and achievements.', weight: 25 },
]

describe('validateScreeningRubric', () => {
  it('accepts a complete weighted rubric', () => expect(validateScreeningRubric(valid, 3)).toEqual([]))
  it('requires weights to total 100', () => expect(validateScreeningRubric(valid.map((item) => ({ ...item, weight: 20 })), 3)).toContain('Criterion weights must total 100%. They currently total 60%.'))
  it('limits criterion and shortlist counts', () => {
    expect(validateScreeningRubric(valid.slice(0, 2), 6)).toEqual(expect.arrayContaining([
      'Use between 3 and 8 criteria.', 'Shortlist between 1 and 5 candidates.',
    ]))
  })
})
