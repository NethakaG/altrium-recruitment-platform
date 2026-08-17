import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitCv } from '../services/submissions'
import { SubmissionForm } from './SubmissionForm'

vi.mock('../services/submissions', async () => {
  const actual = await vi.importActual('../services/submissions')
  return { ...actual, submitCv: vi.fn() }
})

const positions = [{ id: 'position-1', title: 'Marketing Intern', department: 'Marketing' }]
const mockedSubmitCv = vi.mocked(submitCv)

async function enterContact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Test Candidate')
  await user.type(screen.getByLabelText('Email address'), 'candidate@example.com')
}

describe('SubmissionForm', () => {
  beforeEach(() => mockedSubmitCv.mockReset())

  it('does not submit without a position', async () => {
    const user = userEvent.setup()
    render(<SubmissionForm positions={positions} onSuccess={vi.fn()} />)
    await enterContact(user)
    await user.upload(screen.getByLabelText(/upload your cv/i), new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Submit CV' }))
    expect(screen.getByText('Please select the position you are applying for.')).toBeInTheDocument()
    expect(mockedSubmitCv).not.toHaveBeenCalled()
  })

  it('does not submit without a CV', async () => {
    const user = userEvent.setup()
    render(<SubmissionForm positions={positions} onSuccess={vi.fn()} />)
    await enterContact(user)
    await user.selectOptions(screen.getByLabelText('Position Applying For'), 'position-1')
    await user.click(screen.getByRole('button', { name: 'Submit CV' }))
    expect(screen.getByText('Please choose a CV to upload.')).toBeInTheDocument()
    expect(mockedSubmitCv).not.toHaveBeenCalled()
  })

  it('submits a valid CV and shows the success state callback', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    mockedSubmitCv.mockResolvedValue({ success: true })
    render(<SubmissionForm positions={positions} onSuccess={onSuccess} />)
    await enterContact(user)
    await user.selectOptions(screen.getByLabelText('Position Applying For'), 'position-1')
    await user.upload(screen.getByLabelText(/upload your cv/i), new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Submit CV' }))
    expect(mockedSubmitCv).toHaveBeenCalledTimes(1)
    expect(mockedSubmitCv).toHaveBeenCalledWith('position-1', expect.any(File), {
      fullName: 'Test Candidate', email: 'candidate@example.com', phone: '',
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('prevents accidental duplicate submissions while pending', async () => {
    const user = userEvent.setup()
    let resolveSubmission!: (value: { success: true }) => void
    mockedSubmitCv.mockReturnValue(new Promise((resolve) => { resolveSubmission = resolve }))
    render(<SubmissionForm positions={positions} onSuccess={vi.fn()} />)
    await enterContact(user)
    await user.selectOptions(screen.getByLabelText('Position Applying For'), 'position-1')
    await user.upload(screen.getByLabelText(/upload your cv/i), new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    const button = screen.getByRole('button', { name: 'Submit CV' })
    await user.click(button)
    expect(screen.getByRole('button', { name: /Submitting your CV/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Submitting your CV/i }))
    expect(mockedSubmitCv).toHaveBeenCalledTimes(1)
    await act(async () => resolveSubmission({ success: true }))
    await waitFor(() => expect(mockedSubmitCv).toHaveBeenCalledTimes(1))
  })

  it('requires a valid name and email address', async () => {
    const user = userEvent.setup()
    render(<SubmissionForm positions={positions} onSuccess={vi.fn()} />)
    await user.type(screen.getByLabelText('Full name'), 'A')
    await user.type(screen.getByLabelText('Email address'), 'not-an-email')
    await user.selectOptions(screen.getByLabelText('Position Applying For'), 'position-1')
    await user.upload(screen.getByLabelText(/upload your cv/i), new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Submit CV' }))
    expect(screen.getByText('Please enter your full name.')).toBeInTheDocument()
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(mockedSubmitCv).not.toHaveBeenCalled()
  })

  it('shows a duplicate application against the email field', async () => {
    const user = userEvent.setup()
    mockedSubmitCv.mockImplementationOnce(async () => {
      throw Object.assign(
        new Error('An application using this email address has already been submitted for this position.'),
        { code: 'DUPLICATE_APPLICATION' },
      )
    })
    render(<SubmissionForm positions={positions} onSuccess={vi.fn()} />)
    await enterContact(user)
    await user.selectOptions(screen.getByLabelText('Position Applying For'), 'position-1')
    await user.upload(screen.getByLabelText(/upload your cv/i), new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Submit CV' }))
    expect(await screen.findByText('An application using this email address has already been submitted for this position.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true')
  })
})
