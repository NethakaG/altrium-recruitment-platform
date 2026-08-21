import { describe, expect, it } from 'vitest'
import { filterPositions, validatePosition } from './position-validation'
import type { Position, PositionInput } from '../types/positions'

const validInput: PositionInput = {
  title: 'Marketing Intern',
  department: 'Marketing',
  description: 'Support the marketing team.',
  requirements: '',
  qualifications: '',
  hiringManager: '',
  openingDate: '2026-08-17',
}

const positions: Position[] = [
  { id: '1', title: 'Marketing Intern', department: 'Marketing', description: 'A', requirements: null, qualifications: null, hiring_manager: 'Nadia Silva', opening_date: '2026-08-17', status: 'Open', workflow_configured: true, rubric_configured: true, screening_status: 'Not started', screening_error: null, screening_started_at: null, screening_completed_at: null, closed_at: null, created_at: '', updated_at: '' },
  { id: '2', title: 'Senior Software Engineer', department: 'Engineering', description: 'B', requirements: null, qualifications: null, hiring_manager: 'Alex Perera', opening_date: '2026-08-17', status: 'Closed', workflow_configured: true, rubric_configured: true, screening_status: 'Completed', screening_error: null, screening_started_at: null, screening_completed_at: null, closed_at: null, created_at: '', updated_at: '' },
]

describe('position validation', () => {
  it('requires the title, department, description and opening date', () => {
    expect(validatePosition({ ...validInput, title: ' ', department: '', description: '', openingDate: '' })).toEqual({
      title: 'Position title is required.',
      department: 'Department is required.',
      description: 'Position description is required.',
      openingDate: 'Opening date is required.',
    })
  })

  it('accepts a complete position', () => {
    expect(validatePosition(validInput)).toEqual({})
  })
})

describe('position filtering', () => {
  it('searches titles, departments and hiring managers', () => {
    expect(filterPositions(positions, 'software', 'All').map((position) => position.id)).toEqual(['2'])
    expect(filterPositions(positions, 'nadia', 'All').map((position) => position.id)).toEqual(['1'])
  })

  it('filters open and closed records', () => {
    expect(filterPositions(positions, '', 'Open').map((position) => position.id)).toEqual(['1'])
    expect(filterPositions(positions, '', 'Closed').map((position) => position.id)).toEqual(['2'])
  })
})
