import { describe, expect, it } from 'vitest'
import { filterAvailablePositions } from './positions'
import type { PositionRow } from '../types/position'

const rows: PositionRow[] = [
  { id: '1', title: 'Marketing Intern', department: 'Marketing', status: 'Open', archived_at: null, workflow_configured: true, rubric_configured: true },
  { id: '2', title: 'Engineer', department: 'Technology', status: 'Closed', archived_at: null, workflow_configured: true, rubric_configured: true },
  { id: '3', title: 'Analyst', department: null, status: 'Open', archived_at: '2026-01-01', workflow_configured: true, rubric_configured: true },
  { id: '4', title: 'Unconfigured Role', department: null, status: 'Open', archived_at: null, workflow_configured: false, rubric_configured: true },
  { id: '5', title: 'Missing rubric', department: null, status: 'Open', archived_at: null, workflow_configured: true, rubric_configured: false },
]

describe('filterAvailablePositions', () => {
  it('only returns positions with Open status', () => {
    expect(filterAvailablePositions(rows)).toEqual([
      { id: '1', title: 'Marketing Intern', department: 'Marketing' },
    ])
  })

  it('does not return archived positions', () => {
    expect(filterAvailablePositions([rows[2]])).toHaveLength(0)
  })

  it('does not return positions without a saved workflow', () => {
    expect(filterAvailablePositions([rows[3]])).toHaveLength(0)
  })

  it('does not return positions without a locked screening rubric', () => {
    expect(filterAvailablePositions([rows[4]])).toHaveLength(0)
  })
})
