import type { ScreeningCriterion } from '../types/screening'

export function validateScreeningRubric(criteria: ScreeningCriterion[], shortlistCount: number): string[] {
  const errors: string[] = []
  if (criteria.length < 3 || criteria.length > 8) errors.push('Use between 3 and 8 criteria.')
  if (!Number.isInteger(shortlistCount) || shortlistCount < 1 || shortlistCount > 5) errors.push('Shortlist between 1 and 5 candidates.')
  criteria.forEach((criterion, index) => {
    if (criterion.name.trim().length < 2 || criterion.name.trim().length > 80) errors.push(`Criterion ${index + 1} needs a name between 2 and 80 characters.`)
    if (criterion.description.trim().length < 10 || criterion.description.trim().length > 500) errors.push(`Criterion ${index + 1} needs a description between 10 and 500 characters.`)
    if (!Number.isInteger(criterion.weight) || criterion.weight < 5 || criterion.weight > 80) errors.push(`Criterion ${index + 1} needs a whole-number weight between 5% and 80%.`)
  })
  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0)
  if (total !== 100) errors.push(`Criterion weights must total 100%. They currently total ${total}%.`)
  return errors
}
