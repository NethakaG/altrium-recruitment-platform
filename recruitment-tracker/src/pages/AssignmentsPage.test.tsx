import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listInterviews } from '../services/interviews'
import type { Interview } from '../types/interviews'
import { AssignmentsPage } from './AssignmentsPage'

vi.mock('../services/interviews', () => ({ listInterviews: vi.fn(), startInterview: vi.fn(), endInterview: vi.fn() }))
vi.mock('../components/InterviewFeedbackPanel', () => ({ InterviewFeedbackPanel: () => <div>Feedback panel</div> }))

function assignment(overrides: Partial<Interview>): Interview {
  return {
    id: 'today-1', submission_id: 'candidate-1', stage_id: 'stage-1', interviewer_id: 'person-1',
    scheduled_start: new Date(Date.now() - 30 * 60_000).toISOString(), scheduled_end: new Date(Date.now() + 30 * 60_000).toISOString(),
    format: 'online', meeting_url: 'https://meet.example.com/test', location: null, instructions: null, status: 'in_progress',
    actual_start: new Date(Date.now() - 30 * 60_000).toISOString(), actual_end: null, cancellation_reason: null, notifications: [],
    candidate: { id: 'candidate-1', position_id: 'position-1', candidate_name: 'Today Candidate', candidate_email: 'today@example.com' },
    position: { title: 'Platform Engineer', department: 'Engineering' },
    stage: { name: 'Technical Interview', stage_type: 'technical_interview' }, interviewer: null,
    ...overrides,
  }
}

const today = assignment({})
const awaiting = assignment({
  id: 'awaiting-1', submission_id: 'candidate-2', status: 'awaiting_feedback', actual_end: new Date().toISOString(),
  candidate: { id: 'candidate-2', position_id: 'position-2', candidate_name: 'Feedback Candidate', candidate_email: 'feedback@example.com' },
  position: { title: 'Marketing Intern', department: 'Marketing' }, stage: { name: 'HR Interview', stage_type: 'hr_interview' },
})
describe('AssignmentsPage', () => {
  beforeEach(() => vi.mocked(listInterviews).mockResolvedValue([today, awaiting]))
  afterEach(cleanup)

  it('organizes interviewer assignments by schedule priority', async () => {
    render(<AssignmentsPage />)
    expect(await screen.findByRole('heading', { name: 'Today and in progress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Awaiting feedback' })).toBeInTheDocument()
    expect(screen.getByText('Today Candidate')).toBeInTheDocument()
    expect(screen.getByText('Feedback Candidate')).toBeInTheDocument()
  })

  it('filters assigned interviews by position and status', async () => {
    render(<AssignmentsPage />)
    await screen.findByText('Today Candidate')
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned interview position' }), { target: { value: 'position-2' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned interview status' }), { target: { value: 'awaiting_feedback' } })
    expect(screen.getByText('Feedback Candidate')).toBeInTheDocument()
    expect(screen.queryByText('Today Candidate')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Assignment filters' })).toHaveTextContent('1 assigned interview in 1 schedule section')
  })
})
