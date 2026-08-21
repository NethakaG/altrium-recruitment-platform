import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCandidate } from '../services/candidates'
import { listWorkflowStages } from '../services/workflows'
import { listScreeningRubrics } from '../services/screening'
import type { Candidate } from '../types/candidates'
import { CandidateDetailsPage } from './CandidateDetailsPage'

vi.mock('../services/candidates', () => ({
  getCandidate: vi.fn(), advanceCandidate: vi.fn(), requestCvDownload: vi.fn(), retryCvExtraction: vi.fn(), setCandidateStatus: vi.fn(),
}))
vi.mock('../services/workflows', () => ({ listWorkflowStages: vi.fn() }))
vi.mock('../services/screening', () => ({ listScreeningRubrics: vi.fn() }))

const candidate: Candidate = {
  id: 'candidate-1', position_id: 'position-1', candidate_name: 'Test Candidate', candidate_email: 'candidate@example.com',
  candidate_phone: '+94 77 000 0000', original_filename: 'candidate.pdf', mime_type: 'application/pdf', file_size: 1024,
  processing_status: 'Processed', submitted_at: '2026-08-17T10:00:00Z', processed_at: '2026-08-17T10:01:00Z',
  current_stage_id: 'stage-1', application_status: 'Active', extraction_model: 'gemini-2.5-flash',
  extracted_profile: { professional_summary: 'Software engineer.', skills: ['TypeScript'], education: [], experience: [] },
  position: { title: 'Senior Software Engineer', department: 'Technology' },
  current_stage: { id: 'stage-1', name: 'CV Review', stage_order: 1, stage_type: 'cv_review' },
  screening: null,
}

describe('CandidateDetailsPage', () => {
  beforeEach(() => {
    vi.mocked(getCandidate).mockResolvedValue(candidate)
    vi.mocked(listWorkflowStages).mockResolvedValue([
      { id: 'stage-1', position_id: 'position-1', name: 'CV Review', stage_order: 1, stage_type: 'cv_review' },
      { id: 'stage-2', position_id: 'position-1', name: 'Final Decision', stage_order: 2, stage_type: 'final_decision' },
    ])
    vi.mocked(listScreeningRubrics).mockResolvedValue([])
  })

  it('shows extracted details and management controls for HR', async () => {
    render(<CandidateDetailsPage candidateId="candidate-1" basePath="/candidates" canManage />)
    expect(await screen.findByRole('heading', { name: 'Test Candidate' })).toBeInTheDocument()
    expect(screen.getByText('candidate@example.com')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('Awaiting automatic screening')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to next stage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject candidate' })).not.toBeInTheDocument()
  })
})
