import type { Position, PositionFormErrors, PositionInput, PositionStatus } from '../types/positions'

export function validatePosition(input: PositionInput): PositionFormErrors {
  const errors: PositionFormErrors = {}
  if (!input.title.trim()) errors.title = 'Position title is required.'
  if (!input.department.trim()) errors.department = 'Department is required.'
  if (!input.description.trim()) errors.description = 'Position description is required.'
  if (!input.openingDate) errors.openingDate = 'Opening date is required.'
  else if (Number.isNaN(Date.parse(`${input.openingDate}T00:00:00`))) errors.openingDate = 'Enter a valid opening date.'
  return errors
}

export function filterPositions(positions: Position[], search: string, status: 'All' | PositionStatus): Position[] {
  const query = search.trim().toLowerCase()
  return positions.filter((position) => {
    const matchesStatus = status === 'All' || position.status === status
    const matchesSearch = !query || [position.title, position.department, position.hiring_manager ?? '']
      .some((value) => value.toLowerCase().includes(query))
    return matchesStatus && matchesSearch
  })
}
