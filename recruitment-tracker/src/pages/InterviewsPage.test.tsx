import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listInterviewerProfiles, listInterviews } from '../services/interviews'
import type { Interview } from '../types/interviews'
import { InterviewsPage } from './InterviewsPage'

vi.mock('../services/interviews', () => ({
  listInterviews: vi.fn(), listInterviewerProfiles: vi.fn(), rescheduleInterview: vi.fn(),
  cancelInterview: vi.fn(), dispatchInterviewEmails: vi.fn(),
}))
vi.mock('../components/InterviewFeedbackPanel', () => ({ InterviewFeedbackPanel: () => <div>Feedback panel</div> }))

function interview(overrides: Partial<Interview>): Interview {
  return {
    id: 'interview-1', submission_id: 'candidate-1', stage_id: 'stage-1', interviewer_id: 'person-1',
    scheduled_start: '2026-09-15T04:00:00Z', scheduled_end: '2026-09-15T05:00:00Z', format: 'online',
    meeting_url: 'https://meet.example.com/test', location: null, instructions: null, status: 'scheduled',
    actual_start: null, actual_end: null, cancellation_reason: null, notifications: [],
    candidate: { id: 'candidate-1', position_id: 'position-1', candidate_name: 'Engineering Candidate', candidate_email: 'engineer@example.com' },
    position: { title: 'Platform Engineer', department: 'Engineering' },
    stage: { name: 'Technical Interview', stage_type: 'technical_interview' },
    interviewer: null,
    ...overrides,
  }
}

const engineering = interview({})
const marketing = interview({
  id: 'interview-2', submission_id: 'candidate-2', stage_id: 'stage-2', status: 'awaiting_feedback',
  candidate: { id: 'candidate-2', position_id: 'position-2', candidate_name: 'Marketing Candidate', candidate_email: 'marketing@example.com' },
  position: { title: 'Marketing Intern', department: 'Marketing' },
  stage: { name: 'HR Interview', stage_type: 'hr_interview' },
})
describe('InterviewsPage', () => {
  beforeEach(() => {
    vi.mocked(listInterviews).mockResolvedValue([engineering, marketing])
    vi.mocked(listInterviewerProfiles).mockResolvedValue([])
  })
  afterEach(cleanup)

  it('separates recruiter interviews into position cards', async () => {
    render(<InterviewsPage />)
    expect(await screen.findByRole('heading', { name: 'Platform Engineer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Marketing Intern' })).toBeInTheDocument()
    expect(screen.getByText('Engineering Candidate')).toBeInTheDocument()
    expect(screen.getByText('Marketing Candidate')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Interview filters' })).toHaveTextContent('2 interviews across 2 positions')
  })

  it('combines position, stage and status filters', async () => {
    render(<InterviewsPage />)
    await screen.findByText('Engineering Candidate')
    fireEvent.change(screen.getByRole('combobox', { name: 'Interview position' }), { target: { value: 'position-2' } })
    expect(screen.queryByText('Engineering Candidate')).not.toBeInTheDocument()
    expect(screen.getByText('Marketing Candidate')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'HR Interview' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Technical Interview' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Interview stage' }), { target: { value: 'stage-2' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Interview status' }), { target: { value: 'scheduled' } })
    expect(screen.getByText('No interviews found')).toBeInTheDocument()
  })
})
