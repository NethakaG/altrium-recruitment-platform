import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCandidates } from '../services/candidates'
import type { Candidate } from '../types/candidates'
import { CandidatesPage } from './CandidatesPage'

vi.mock('../services/candidates', () => ({ listCandidates: vi.fn() }))

const candidate: Candidate = {
  id: 'candidate-1', position_id: 'position-1', candidate_name: 'Test Candidate', candidate_email: 'candidate@example.com',
  candidate_phone: null, original_filename: 'candidate.pdf', mime_type: 'application/pdf', file_size: 1024,
  processing_status: 'Processed', submitted_at: '2026-08-17T10:00:00Z', processed_at: '2026-08-17T10:01:00Z',
  current_stage_id: 'stage-1', application_status: 'Active', extraction_model: 'gemini-2.5-flash',
  extracted_profile: { skills: ['TypeScript'] }, position: { title: 'Senior Software Engineer', department: 'Technology' },
  current_stage: { id: 'stage-1', name: 'CV Review', stage_order: 1, stage_type: 'cv_review' },
  screening: null,
}

describe('CandidatesPage', () => {
  beforeEach(() => vi.mocked(listCandidates).mockResolvedValue([candidate]))

  it('shows the candidates permitted for the current role', async () => {
    render(<CandidatesPage role="hr_recruiter" basePath="/candidates" />)
    expect(await screen.findByText('Test Candidate')).toBeInTheDocument()
    expect(screen.getByText('Senior Software Engineer')).toBeInTheDocument()
    expect(screen.getByText('CV Review')).toBeInTheDocument()
    expect(screen.getByText('Active', { selector: '.application-badge' })).toHaveClass('application-badge', 'application-active')
    expect(screen.getByRole('link', { name: 'Test Candidate' })).toHaveAttribute('href', '/candidates/candidate-1')
  })
})
