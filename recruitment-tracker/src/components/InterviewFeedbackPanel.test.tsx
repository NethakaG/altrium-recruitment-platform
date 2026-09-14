import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getInterviewFeedback, listFeedbackHistory } from '../services/feedback'
import type { InterviewFeedback } from '../types/feedback'
import type { Interview } from '../types/interviews'
import { InterviewFeedbackPanel } from './InterviewFeedbackPanel'

vi.mock('../services/feedback', () => ({
  getInterviewFeedback: vi.fn(),
  listFeedbackHistory: vi.fn(),
  saveInterviewFeedback: vi.fn(),
  submitInterviewFeedback: vi.fn(),
  reviewInterviewFeedback: vi.fn(),
}))

const scheduled: Interview = {
  id: 'interview-1', submission_id: 'candidate-1', stage_id: 'stage-1', interviewer_id: 'profile-1',
  scheduled_start: '2026-09-14T05:00:00Z', scheduled_end: '2026-09-14T06:00:00Z',
  format: 'online', meeting_url: 'https://meet.example.com/test', location: null, instructions: null,
  status: 'scheduled', actual_start: null, actual_end: null, cancellation_reason: null,
  candidate: { id: 'candidate-1', position_id: 'position-1', candidate_name: 'Test Candidate', candidate_email: 'test@example.com' },
  position: { title: 'Platform Engineer', department: 'Engineering' },
  stage: { name: 'Technical Interview', stage_type: 'technical_interview' }, interviewer: null, notifications: [],
}

const submitted: InterviewFeedback = {
  id: 'feedback-1', interview_id: 'interview-1', interviewer_id: 'profile-1',
  scores: { communication: 4, role_knowledge: 4, relevant_experience: 5, problem_solving: 4, overall_suitability: 4 },
  notes: 'Clear and relevant evidence was provided throughout the interview.', recommendation: 'proceed',
  feedback_status: 'submitted', submitted_at: '2026-09-14T06:05:00Z', review_decision: null,
  review_note: null, reviewed_by: null, reviewed_at: null, version: 1,
  created_at: '2026-09-14T05:20:00Z', updated_at: '2026-09-14T06:05:00Z',
}

describe('InterviewFeedbackPanel', () => {
  beforeEach(() => {
    vi.mocked(getInterviewFeedback).mockResolvedValue(null)
    vi.mocked(listFeedbackHistory).mockResolvedValue([])
  })

  it('locks scoring until the assigned interview starts', async () => {
    render(<InterviewFeedbackPanel interview={scheduled} mode="interviewer" />)
    expect(await screen.findByText('Feedback unlocks when the interview starts')).toBeInTheDocument()
    expect(screen.queryByLabelText('Communication score')).not.toBeInTheDocument()
  })

  it('allows draft scoring after the interview starts', async () => {
    render(<InterviewFeedbackPanel interview={{ ...scheduled, status: 'in_progress', actual_start: '2026-09-14T05:02:00Z' }} mode="interviewer" />)
    expect(await screen.findByRole('heading', { name: 'Interview evaluation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Communication score')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit feedback' })).not.toBeInTheDocument()
  })

  it('shows submitted feedback and decisions to HR', async () => {
    vi.mocked(getInterviewFeedback).mockResolvedValue(submitted)
    render(<InterviewFeedbackPanel interview={{ ...scheduled, status: 'awaiting_feedback', actual_start: '2026-09-14T05:02:00Z', actual_end: '2026-09-14T06:03:00Z' }} mode="reviewer" />)
    expect(await screen.findByText('Interviewer recommends')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proceed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hold' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })
})
