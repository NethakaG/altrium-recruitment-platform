import { useRef, useState, type FormEvent } from 'react'
import { validateCvFile } from '../lib/file-validation'
import { submitCv, SubmissionError } from '../services/submissions'
import type { Position } from '../types/position'
import { CVUpload } from './CVUpload'
import { ErrorMessage } from './ErrorMessage'
import { ArrowUpRightIcon, ShieldIcon } from './icons'
import { PositionSelect } from './PositionSelect'

function isSubmissionError(error: unknown): error is SubmissionError {
  return error instanceof Error && 'code' in error
}

interface SubmissionFormProps {
  positions: Position[]
  onSuccess: () => void
}

export function SubmissionForm({ positions, onSuccess }: SubmissionFormProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [positionId, setPositionId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({})
  const [positionError, setPositionError] = useState('')
  const [fileError, setFileError] = useState('')
  const [submissionError, setSubmissionError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submissionLock = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return

    const trimmedName = fullName.trim()
    const trimmedEmail = email.trim()
    const trimmedPhone = phone.trim()
    const nextContactErrors: Record<string, string> = {}
    if (trimmedName.length < 2) nextContactErrors.fullName = 'Please enter your full name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) nextContactErrors.email = 'Please enter a valid email address.'
    if (trimmedPhone && (trimmedPhone.length < 7 || trimmedPhone.length > 30)) nextContactErrors.phone = 'Please enter a valid phone number.'
    const nextPositionError = positionId ? '' : 'Please select the position you are applying for.'
    const nextFileError = file ? validateCvFile(file) ?? '' : 'Please choose a CV to upload.'
    setContactErrors(nextContactErrors)
    setPositionError(nextPositionError)
    setFileError(nextFileError)
    setSubmissionError('')

    if (Object.keys(nextContactErrors).length || nextPositionError || nextFileError || !file) return

    submissionLock.current = true
    setSubmitting(true)
    try {
      await submitCv(positionId, file, { fullName: trimmedName, email: trimmedEmail, phone: trimmedPhone })
      onSuccess()
    } catch (error) {
      if (isSubmissionError(error)) {
        if (error.code === 'DUPLICATE_APPLICATION') {
          setContactErrors((current) => ({ ...current, email: error.message }))
        } else {
          setSubmissionError(error.message)
          if (error.code === 'POSITION_CLOSED') setPositionError(error.message)
        }
      } else {
        setSubmissionError("We couldn't submit your CV. Please try again.")
      }
    } finally {
      submissionLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <form className="submission-form" onSubmit={handleSubmit} noValidate>
      <div className="form-heading">
        <span>Application</span>
        <h2>Submit your CV</h2>
        <p>Choose an open role and share your CV. It only takes a minute.</p>
      </div>

      <div className="candidate-contact-grid">
        <div className={`field-group ${contactErrors.fullName ? 'field-invalid' : ''}`}>
          <label htmlFor="candidate-name">Full name</label>
          <input id="candidate-name" name="fullName" autoComplete="name" value={fullName} disabled={submitting} aria-invalid={Boolean(contactErrors.fullName)} onChange={(event) => { setFullName(event.target.value); setContactErrors((current) => ({ ...current, fullName: '' })) }} />
          {contactErrors.fullName ? <p className="field-error">{contactErrors.fullName}</p> : null}
        </div>
        <div className={`field-group ${contactErrors.email ? 'field-invalid' : ''}`}>
          <label htmlFor="candidate-email">Email address</label>
          <input id="candidate-email" name="email" type="email" autoComplete="email" value={email} disabled={submitting} aria-invalid={Boolean(contactErrors.email)} onChange={(event) => { setEmail(event.target.value); setContactErrors((current) => ({ ...current, email: '' })) }} />
          {contactErrors.email ? <p className="field-error">{contactErrors.email}</p> : null}
        </div>
        <div className={`field-group contact-field-wide ${contactErrors.phone ? 'field-invalid' : ''}`}>
          <label htmlFor="candidate-phone">Phone number <span>(optional)</span></label>
          <input id="candidate-phone" name="phone" type="tel" autoComplete="tel" value={phone} disabled={submitting} aria-invalid={Boolean(contactErrors.phone)} onChange={(event) => { setPhone(event.target.value); setContactErrors((current) => ({ ...current, phone: '' })) }} />
          {contactErrors.phone ? <p className="field-error">{contactErrors.phone}</p> : null}
        </div>
      </div>

      <PositionSelect
        positions={positions}
        value={positionId}
        onChange={(value) => {
          setPositionId(value)
          setPositionError('')
          setSubmissionError('')
        }}
        disabled={submitting}
        error={positionError}
      />

      <CVUpload
        file={file}
        onChange={(nextFile) => {
          setFile(nextFile)
          if (nextFile) setFileError('')
          setSubmissionError('')
        }}
        disabled={submitting}
        error={fileError}
        onValidationError={(message) => setFileError(message ?? '')}
      />

      {submissionError ? <ErrorMessage message={submissionError} /> : null}

      <button className="submit-button" type="submit" disabled={submitting}>
        {submitting ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Submitting your CV…
          </>
        ) : (
          <>
            Submit CV
            <ArrowUpRightIcon />
          </>
        )}
      </button>

      <p className="privacy-note">
        <ShieldIcon />
        Your CV is securely stored and only accessible to Altrium’s recruitment team.
      </p>
    </form>
  )
}
