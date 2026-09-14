import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCandidates } from '../services/candidates'
import {
  listFinalDecisionHistory,
  listFinalHiringDecisions,
  listFinalInterviewEvidence,
} from '../services/final-decisions'
import type { Candidate } from '../types/candidates'
import type { FinalHiringDecision } from '../types/final-decisions'
import { FinalDecisionsPage } from './FinalDecisionsPage'

vi.mock('../services/candidates', () => ({ listCandidates: vi.fn() }))
vi.mock('../services/final-decisions', () => ({
  listFinalHiringDecisions: vi.fn(),
  listFinalDecisionHistory: vi.fn(),
  listFinalInterviewEvidence: vi.fn(),
  submitFinalHiringRecommendation: vi.fn(),
  reviewFinalHiringRecommendation: vi.fn(),
}))

const finalist: Candidate = {
  id: 'candidate-1', position_id: 'position-1', candidate_name: 'Asha Perera', candidate_email: 'asha@example.com',
  candidate_phone: null, original_filename: 'asha.pdf', mime_type: 'application/pdf', file_size: 1024,
  processing_status: 'Processed', submitted_at: '2026-09-14T08:00:00Z', processed_at: '2026-09-14T08:01:00Z',
  current_stage_id: 'stage-final', application_status: 'Active', extraction_model: 'gemini', extracted_profile: {},
  position: { title: 'Platform Engineer', department: 'Engineering' },
  current_stage: { id: 'stage-final', name: 'Final Decision', stage_order: 5, stage_type: 'final_decision' },
  screening: { criterion_scores: [], total_score: 88, summary: '', screening_model: 'gemini', screened_at: '', rank: 1, decision: 'Shortlisted' },
}

const pendingDecision: FinalHiringDecision = {
  id: 'decision-1', submission_id: finalist.id, position_id: finalist.position_id,
  hiring_manager_id: 'manager-1', recommendation: 'hire', recommendation_note: 'Strong evidence supports hiring this candidate.',
  decision_status: 'pending_approval', recommended_at: '2026-09-14T09:00:00Z', executive_id: null,
  executive_note: null, decided_at: null, final_outcome: null, version: 1,
  created_at: '2026-09-14T09:00:00Z', updated_at: '2026-09-14T09:00:00Z',
}

describe('FinalDecisionsPage', () => {
  beforeEach(() => {
    vi.mocked(listCandidates).mockResolvedValue([finalist])
    vi.mocked(listFinalHiringDecisions).mockResolvedValue([])
    vi.mocked(listFinalInterviewEvidence).mockResolvedValue([])
    vi.mocked(listFinalDecisionHistory).mockResolvedValue([])
  })
  afterEach(cleanup)

  it('groups finalists by position and gives Hiring Managers the recommendation form', async () => {
    render(<FinalDecisionsPage role="hiring_manager" basePath="/candidate-review" />)
    expect(await screen.findByRole('heading', { name: 'Platform Engineer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Asha Perera' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Recommendation for Asha Perera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit to Executive' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve recommendation' })).not.toBeInTheDocument()
  })

  it('gives Executives approval controls for a pending recommendation', async () => {
    vi.mocked(listFinalHiringDecisions).mockResolvedValue([pendingDecision])
    render(<FinalDecisionsPage role="management_user" basePath="/overview" />)
    expect(await screen.findByText('Awaiting Executive')).toBeInTheDocument()
    expect(screen.getByText('Strong evidence supports hiring this candidate.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve recommendation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return for reconsideration' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit to Executive' })).not.toBeInTheDocument()
  })

  it('keeps the final decision workspace read-only for HR', async () => {
    vi.mocked(listFinalHiringDecisions).mockResolvedValue([pendingDecision])
    render(<FinalDecisionsPage role="hr_recruiter" basePath="/candidates" />)
    expect(await screen.findByText(/Read-only monitoring/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve recommendation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit to Executive' })).not.toBeInTheDocument()
  })
})
