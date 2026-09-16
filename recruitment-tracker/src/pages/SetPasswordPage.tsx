import { useState, type FormEvent } from 'react'
import { AppLink } from '../components/AppLink'
import { LockIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { validateNewPassword } from '../lib/staff-access-validation'
import { navigate } from '../lib/route'
import { updatePassword } from '../services/auth'

export function SetPasswordPage() {
  const { status } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validation = validateNewPassword(password, confirmation)
    setError(validation)
    if (validation) return
    setSaving(true)
    try {
      await updatePassword(password)
      setComplete(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Your password could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <main className="state-page"><div className="loading-mark"><span>A</span></div></main>

  return (
    <main className="password-page">
      <section className="password-card">
        <span className="login-icon"><LockIcon /></span>
        <span className="eyebrow dark">Staff invitation</span>
        {status === 'signed_out' || status === 'error' ? <>
          <h1>Invitation link unavailable</h1>
          <p>This invitation link has expired or has already been used. Ask your IT Admin to send a new invitation.</p>
          <AppLink className="primary-button" to="/login">Return to sign in</AppLink>
        </> : complete ? <>
          <h1>Password created</h1>
          <p>Your Altrium staff account is ready. Continue to your role-specific workspace.</p>
          <button type="button" className="primary-button" onClick={() => navigate('/')}>Open workspace</button>
        </> : <>
          <h1>Create your password</h1>
          <p>Use at least eight characters, including an uppercase letter, lowercase letter and number.</p>
          <form onSubmit={submit}>
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <label htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save password'}</button>
          </form>
        </>}
      </section>
    </main>
  )
}
