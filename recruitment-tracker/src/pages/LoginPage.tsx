import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { validateLogin, type LoginErrors } from '../lib/login-validation'
import { navigate } from '../lib/route'
import { BriefcaseIcon, LockIcon, ShieldIcon, UsersIcon } from '../components/icons'

export function LoginPage() {
  const { login, error: authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateLogin(email, password)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    const status = await login(email, password)
    setSubmitting(false)
    if (status === 'active') navigate('/')
    if (status === 'pending') navigate('/access-pending')
  }

  return (
    <main className="login-page">
      <section className="login-intro" aria-label="Altrium recruitment workspace">
        <div className="brand-lockup brand-lockup-light"><span className="brand-mark">A</span><div><strong>ALTRIUM</strong><span>Recruitment workspace</span></div></div>
        <div className="intro-copy">
          <span className="eyebrow">Private staff platform</span>
          <h1>One secure place for every recruitment decision.</h1>
          <p>Manage vacancies, workflows, candidate CVs and AI-assisted screening from a controlled Altrium workspace.</p>
        </div>
        <div className="security-points">
          <span><ShieldIcon />Role-controlled access</span>
          <span><BriefcaseIcon />Position-specific workflows</span>
          <span><UsersIcon />Private candidate information</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="login-icon"><LockIcon /></span>
          <span className="eyebrow dark">Authorised staff only</span>
          <h2>Welcome back</h2>
          <p className="form-intro">Sign in with the staff account assigned by Altrium IT.</p>

          <form onSubmit={submit} noValidate>
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} placeholder="name@altrium.com" />
            {errors.email && <p className="field-error" id="email-error">{errors.email}</p>}

            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} placeholder="Enter your password" />
            {errors.password && <p className="field-error" id="password-error">{errors.password}</p>}

            {authError && <div className="auth-error" role="alert">{authError}</div>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in securely'}</button>
          </form>
          <p className="support-note">Need access? Contact your Altrium IT Admin.</p>
        </div>
      </section>
    </main>
  )
}
