import { useState, type FormEvent } from 'react'
import { AppLink } from '../components/AppLink'
import { navigate } from '../lib/route'
import { validatePosition } from '../lib/position-validation'
import { createPosition } from '../services/positions'
import { emptyPositionInput, type PositionFormErrors, type PositionInput } from '../types/positions'

const fields: Array<{ key: keyof PositionInput; label: string; placeholder: string; optional?: boolean; multiline?: boolean }> = [
  { key: 'title', label: 'Position title', placeholder: 'e.g. Marketing Intern' },
  { key: 'department', label: 'Department', placeholder: 'e.g. Marketing' },
  { key: 'hiringManager', label: 'Hiring manager', placeholder: 'Manager name', optional: true },
  { key: 'openingDate', label: 'Opening date', placeholder: '' },
  { key: 'description', label: 'Position description', placeholder: 'Summarise the role and its responsibilities', multiline: true },
  { key: 'requirements', label: 'Requirements', placeholder: 'List the essential experience and skills', optional: true, multiline: true },
  { key: 'qualifications', label: 'Qualifications', placeholder: 'List preferred qualifications', optional: true, multiline: true },
]

export function CreatePositionPage() {
  const [input, setInput] = useState<PositionInput>(emptyPositionInput)
  const [errors, setErrors] = useState<PositionFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function update(key: keyof PositionInput, value: string) {
    setInput((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validationErrors = validatePosition(input)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return

    setSaving(true)
    setSubmitError(null)
    try {
      const position = await createPosition(input)
      navigate(`/workflows/${position.id}`)
    } catch {
      setSubmitError('The position could not be created. Check your access and try again.')
      setSaving(false)
    }
  }

  return <div className="page-shell position-form-page">
    <header className="page-header"><div><AppLink to="/positions" className="back-link">← Back to positions</AppLink><span className="eyebrow dark">New vacancy</span><h1>Create position</h1><p>Create the position once. It can later be closed, but not edited, paused, reopened or archived.</p></div></header>
    <form className="position-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="form-section-heading"><span>01</span><div><h2>Position information</h2><p>Required fields are marked with an asterisk.</p></div></div>
      <div className="position-form-grid">
        {fields.map((field) => <label key={field.key} className={`${field.multiline ? 'form-field-wide' : ''}`}>
          <span>{field.label}{field.optional ? ' (optional)' : ' *'}</span>
          {field.multiline
            ? <textarea value={input[field.key]} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} onChange={(event) => update(field.key, event.target.value)} />
            : <input type={field.key === 'openingDate' ? 'date' : 'text'} value={input[field.key]} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} onChange={(event) => update(field.key, event.target.value)} />}
          {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
        </label>)}
      </div>
      {submitError && <div className="auth-error">{submitError}</div>}
      <div className="form-actions"><AppLink to="/positions" className="secondary-button button-link">Cancel</AppLink><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create position'}</button></div>
    </form>
  </div>
}
