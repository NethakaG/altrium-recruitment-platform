import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const marketingRankTwo: Candidate = {
  ...candidate,
  id: 'candidate-2', position_id: 'position-2', candidate_name: 'Marketing Two', candidate_email: 'two@example.com',
  submitted_at: '2026-08-18T10:00:00Z', current_stage_id: 'stage-2',
  position: { title: 'Marketing Intern', department: 'Marketing' },
  current_stage: { id: 'stage-2', name: 'HR Interview', stage_order: 2, stage_type: 'hr_interview' },
  screening: { criterion_scores: [], total_score: 82, summary: '', screening_model: 'gemini', screened_at: '', rank: 2, decision: 'Shortlisted' },
}

const marketingRankOne: Candidate = {
  ...marketingRankTwo,
  id: 'candidate-3', candidate_name: 'Marketing One', candidate_email: 'one@example.com', submitted_at: '2026-08-19T10:00:00Z',
  current_stage_id: 'stage-3', current_stage: { id: 'stage-3', name: 'Hiring Manager Interview', stage_order: 3, stage_type: 'hiring_manager_interview' },
  screening: { ...marketingRankTwo.screening!, total_score: 91, rank: 1 },
}

describe('CandidatesPage', () => {
  beforeEach(() => vi.mocked(listCandidates).mockResolvedValue([candidate]))
  afterEach(cleanup)

  it('shows the candidates permitted for the current role in a position section', async () => {
    render(<CandidatesPage role="hr_recruiter" basePath="/candidates" />)
    expect(await screen.findByText('Test Candidate')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Senior Software Engineer' })).toBeInTheDocument()
    expect(screen.getByText('CV Review', { selector: '.candidate-stage' })).toBeInTheDocument()
    expect(screen.getByText('Active', { selector: '.application-badge' })).toHaveClass('application-badge', 'application-active')
    expect(screen.getByRole('link', { name: 'Test Candidate' })).toHaveAttribute('href', '/candidates/candidate-1')
  })

  it('groups candidates by position and combines position and workflow stage filters', async () => {
    vi.mocked(listCandidates).mockResolvedValue([candidate, marketingRankTwo, marketingRankOne])
    render(<CandidatesPage role="hr_recruiter" basePath="/candidates" />)

    expect(await screen.findByRole('heading', { name: 'Marketing Intern' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Senior Software Engineer' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Job position' }), { target: { value: 'position-2' } })
    expect(screen.queryByRole('heading', { name: 'Senior Software Engineer' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'HR Interview' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Hiring Manager Interview' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Workflow stage' }), { target: { value: 'stage-2' } })
    expect(screen.getByText('Marketing Two')).toBeInTheDocument()
    expect(screen.queryByText('Marketing One')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Candidate filters' })).toHaveTextContent('1 candidate across 1 position')
  })

  it('orders ranks inside a position and always leaves unranked candidates last', async () => {
    const unranked = { ...marketingRankTwo, id: 'candidate-4', candidate_name: 'Unranked Candidate', screening: null }
    vi.mocked(listCandidates).mockResolvedValue([unranked, marketingRankTwo, marketingRankOne])
    render(<CandidatesPage role="hr_recruiter" basePath="/candidates" />)

    const section = await screen.findByRole('region', { name: 'Marketing Intern' })
    expect(within(section).getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Marketing One'),
      expect.stringContaining('Marketing Two'),
      expect.stringContaining('Unranked Candidate'),
    ])

    fireEvent.change(screen.getByRole('combobox', { name: 'Candidate order' }), { target: { value: 'rank-low' } })
    expect(within(section).getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Marketing Two'),
      expect.stringContaining('Marketing One'),
      expect.stringContaining('Unranked Candidate'),
    ])
  })
})
