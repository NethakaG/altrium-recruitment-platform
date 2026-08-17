import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadOpenPositions } from './services/positions'
import { submitCv } from './services/submissions'

vi.mock('./services/positions', () => ({ loadOpenPositions: vi.fn() }))
vi.mock('./services/submissions', async () => {
  const actual = await vi.importActual('./services/submissions')
  return { ...actual, submitCv: vi.fn() }
})

describe('App', () => {
  beforeEach(() => {
    vi.mocked(loadOpenPositions).mockResolvedValue([
      { id: 'position-1', title: 'Marketing Intern', department: 'Marketing' },
    ])
    vi.mocked(submitCv).mockResolvedValue({ success: true })
  })

  it('shows confirmation after a successful submission', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Full name'), 'Test Candidate')
    await user.type(screen.getByLabelText('Email address'), 'candidate@example.com')
    await user.selectOptions(await screen.findByLabelText('Position Applying For'), 'position-1')
    await user.upload(screen.getByLabelText(/upload your cv/i), new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Submit CV' }))
    expect(await screen.findByRole('heading', { name: 'CV Submitted Successfully' })).toBeInTheDocument()
  })
})
